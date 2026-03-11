<script lang="js">
/**
 * NostrRefCard — Central dispatcher for nostr:nevent / nostr:naddr references.
 *
 * Reactively loads the referenced event from Dexie (liveQuery) and renders
 * a kind-specific card. Add new kind handlers as additional branches below.
 *
 * Supported kinds:
 *   30818  → WikiCard (no labels, white4 bg)
 *   (all others) → compact generic ref chip
 */
import { untrack } from 'svelte';
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { get } from 'svelte/store';
import WikiCard from '$lib/components/WikiCard.svelte';
import { liveQuery, queryEvent } from '$lib/nostr/dexie.js';

/**
 * Open the referenced event in its dedicated SvelteKit route.
 * Wiki → /wiki/[naddr], Forum → /forum/[nevent], Task → /task/[naddr], etc.
 */
function openDetail(/** @type {Event} */ e) {
	e.stopPropagation();
	const bech32 = segment.raw?.startsWith('nostr:') ? segment.raw.slice(6) : segment.raw;
	if (!bech32) return;

	// Navigate to the real content-type SvelteKit route.
	// bech32 is already the bare naddr/nevent, ready to append to the route path.
	if (segment.kind === 30818) {
		// Wiki → /wiki/[naddr]
		goto(`/wiki/${bech32}`);
	} else if (segment.kind === 11) {
		// Forum post → /forum/[nevent]
		goto(`/forum/${bech32}`);
	} else if (segment.kind === 30315) {
		// Task → /task/[naddr]
		goto(`/task/${bech32}`);
	} else {
		// Unknown kind — fall back to communities event panel
		const currentPage = get(page);
		const params = new URLSearchParams(currentPage.url.search);
		params.set('event', bech32);
		goto(`/communities?${params.toString()}`, { noScroll: true, keepFocus: true });
	}
}

/** @type {{ segment: import('$lib/utils/short-text-parser.js').NostrRefSegment }} */
let { segment } = $props();

/** @type {import('nostr-tools').Event | null} */
let event = $state(null);
/** @type {import('nostr-tools').Event | null} */
let profileEvent = $state(null);

// ── Stable identity key ──────────────────────────────────────────────────────
// Derived as a plain string so the effect below only fires when the actual
// event identity changes, not whenever the parent passes a new segment object.
const eventKey = $derived.by(() => {
	const { bech32Type, kind, pubkey, identifier, id } = segment;
	if (bech32Type === 'naddr' && kind != null && pubkey && identifier != null) {
		return `naddr:${kind}:${pubkey}:${identifier}`;
	}
	if (bech32Type === 'nevent' && id) return `nevent:${id}`;
	return '';
});

// ── Event subscription ───────────────────────────────────────────────────────
$effect(() => {
	const key = eventKey; // sole reactive dep — string comparison prevents spurious re-runs

	if (!key) {
		untrack(() => { event = null; });
		return;
	}

	// Build filter from current segment without making segment itself a dep
	const { bech32Type, kind, pubkey, identifier, id } = untrack(() => segment);

	/** @type {object} */
	const filter = bech32Type === 'naddr'
		? { kinds: [/** @type {number} */ (kind)], authors: [/** @type {string} */ (pubkey)], '#d': [/** @type {string} */ (identifier)], limit: 1 }
		: { ids: [/** @type {string} */ (id)], limit: 1 };

	const sub = liveQuery(() => queryEvent(filter)).subscribe({
		next: (val) => { event = val ?? null; },
		error: () => { event = null; }
	});
	return () => sub.unsubscribe();
});

// ── Profile subscription (follows event.pubkey) ──────────────────────────────
const authorPubkey = $derived.by(() => {
	const ev = /** @type {import('nostr-tools').Event | null} */ (/** @type {any} */ (event));
	return ev?.pubkey ?? null;
});

$effect(() => {
	const pk = authorPubkey;
	if (!pk) {
		untrack(() => { profileEvent = null; });
		return;
	}
	const sub = liveQuery(() => queryEvent({ kinds: [0], authors: [pk], limit: 1 })).subscribe({
		next: (val) => { profileEvent = val ?? null; },
		error: () => { profileEvent = null; }
	});
	return () => sub.unsubscribe();
});

// ── Wiki data ────────────────────────────────────────────────────────────────
const wiki = $derived.by(() => {
	if (segment.kind !== 30818 || !event) return null;

	// Capture in a local const; cast through any to work around $state narrowing limits
	const ev = /** @type {import('nostr-tools').Event} */ (/** @type {any} */ (event));

	/** @param {string} name */
	const get = (name) => ev.tags?.find((/** @type {string[]} */ t) => t[0] === name)?.[1];

	const title = get('title') || ev.content?.split('\n')[0]?.replace(/^#+\s*/, '').slice(0, 80) || 'Untitled';
	const summaryTag = get('summary');
	const summary = summaryTag
		?? ev.content?.replace(/^[^\n]+\n+/, '').replace(/[#*`_[\]]/g, '').trim().slice(0, 150)
		?? '';
	const slug = get('d') ?? segment.identifier ?? '';

	/** @type {{ name?: string; picture?: string; pubkey?: string } | null} */
	let author = { pubkey: ev.pubkey };
	if (profileEvent) {
		try {
			const p = JSON.parse(profileEvent.content);
			author = {
				pubkey: ev.pubkey,
				name: p.display_name || p.name || undefined,
				picture: p.picture || undefined,
			};
		} catch { /* keep pubkey-only fallback */ }
	}

	return { title, summary, slug, author, createdAt: ev.created_at ?? 0 };
});

/** Shortened bech32 for the generic fallback chip label. */
const shortRef = $derived.by(() => {
	const raw = segment.raw ?? '';
	const bech32 = raw.startsWith('nostr:') ? raw.slice(6) : raw;
	if (bech32.length <= 16) return bech32;
	return `${bech32.slice(0, 8)}…${bech32.slice(-6)}`;
});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
{#if segment.kind === 30818}
	{#if wiki}
		<div class="ref-clickable" onclick={openDetail} role="button" tabindex="0"
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openDetail(e))}
		>
			<WikiCard
				title={wiki.title}
				summary={wiki.summary}
				slug={wiki.slug}
				author={wiki.author}
				createdAt={wiki.createdAt}
				class="nostr-wiki-ref"
			/>
		</div>
	{:else}
		<!-- Not yet in Dexie — link to the proper content-type route -->
		{@const _bech32 = segment.raw?.startsWith('nostr:') ? segment.raw.slice(6) : segment.raw}
		<a href="/wiki/{_bech32}" class="nostr-ref-chip" onclick={(e) => e.stopPropagation()}>
			<span class="nostr-ref-chip-type">wiki</span>
			<span class="nostr-ref-chip-addr">{shortRef}</span>
		</a>
	{/if}
{:else if event}
	<!-- Known event loaded — open in communities event panel -->
	<button type="button" class="nostr-ref-chip ref-chip-btn" onclick={openDetail}>
		{#if segment.kind != null}
			<span class="nostr-ref-chip-type">kind:{segment.kind}</span>
		{/if}
		<span class="nostr-ref-chip-addr">{shortRef}</span>
	</button>
{:else}
	<!-- Not yet loaded — link to communities event panel -->
	<a href="/communities?event={encodeURIComponent(segment.raw?.startsWith('nostr:') ? segment.raw.slice(6) : segment.raw)}"
		class="nostr-ref-chip" onclick={(e) => e.stopPropagation()}>
		{#if segment.kind != null}
			<span class="nostr-ref-chip-type">kind:{segment.kind}</span>
		{/if}
		<span class="nostr-ref-chip-addr">{shortRef}</span>
	</a>
{/if}

<style>
	/* ── Wiki card override: white4 bg instead of gray33 ─────────────── */
	:global(.nostr-wiki-ref) {
		background: hsl(var(--white4)) !important;
	}

	/* ── Clickable wrapper for wiki card ─────────────────────────────── */
	.ref-clickable {
		display: block;
		cursor: pointer;
		border-radius: 16px;
		outline: none;
		transition: opacity 0.15s ease;
	}

	.ref-clickable:hover {
		opacity: 0.85;
	}

	.ref-clickable:active {
		opacity: 0.7;
	}

	/* ── Button variant of chip (when event is loaded from Dexie) ───── */
	.ref-chip-btn {
		background: hsl(var(--white4));
		border: 0.33px solid hsl(var(--white16));
		cursor: pointer;
	}

	.ref-chip-btn:hover {
		background: hsl(var(--white8));
	}

	/* ── Generic ref chip ─────────────────────────────────────────────── */
	.nostr-ref-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 10px 3px 8px;
		border-radius: 99px;
		background: hsl(var(--white4));
		border: 0.33px solid hsl(var(--white16));
		text-decoration: none;
		font-size: 0.8125rem;
		line-height: 1.4;
		transition: background 0.15s ease;
	}

	.nostr-ref-chip:hover {
		background: hsl(var(--white8));
	}

	.nostr-ref-chip-type {
		font-weight: 600;
		color: hsl(var(--blurpleLightColor));
	}

	.nostr-ref-chip-addr {
		font-family: var(--font-mono);
		color: hsl(var(--white33));
		font-size: 0.75rem;
	}
</style>

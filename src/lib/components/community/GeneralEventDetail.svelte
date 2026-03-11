<script lang="js">
/**
 * GeneralEventDetail — Generic detail view for any Nostr event.
 *
 * Two usage modes:
 *   1. Caller provides `event` directly (e.g. from NostrRefCard which already loaded it).
 *   2. Caller provides `encoded` (bare naddr1… / nevent1… bech32) and this component
 *      loads the event itself from Dexie + relay fallback.
 *
 * Shows:
 *   - DetailHeader  (author pic, name, timestamp)
 *   - Optional title / summary (from tags)
 *   - Content body  (MarkdownBody for long/structured text, ShortTextRenderer for kind 1)
 *   - SocialTabs    (Details tab always present; Comments/Zaps/Labels empty in this context)
 */
import { nip19 } from 'nostr-tools';
import { liveQuery, queryEvent, putEvents } from '$lib/nostr/dexie.js';
import { fetchFromRelays } from '$lib/nostr';
import { DEFAULT_COMMUNITY_RELAYS, DEFAULT_SOCIAL_RELAYS, EVENT_KINDS } from '$lib/config';
import { tokenizeNostrMarkdown } from '$lib/utils/markdown.js';
import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
import { getCurrentPubkey } from '$lib/stores/auth.svelte.js';
import DetailHeader from '$lib/components/layout/DetailHeader.svelte';
import SocialTabs from '$lib/components/social/SocialTabs.svelte';
import ShortTextRenderer from '$lib/components/common/ShortTextRenderer.svelte';
import MarkdownBody from '$lib/components/common/MarkdownBody.svelte';
import EmptyState from '$lib/components/common/EmptyState.svelte';

/**
 * @type {{
 *   event?: import('nostr-tools').Event | null,
 *   encoded?: string,
 *   authorProfile?: import('nostr-tools').Event | null,
 *   wikiLinkFn?: ((slug: string) => string) | undefined,
 *   onBack?: () => void,
 * }}
 */
let {
	event: eventProp = null,
	encoded = '',
	authorProfile: authorProfileProp = null,
	wikiLinkFn = undefined,
	onBack = () => {}
} = $props();

// ── Self-loading from bech32 when `encoded` is provided ──────────────────────
/** @type {import('nostr-tools').Event | null} */
let loadedEvent = $state(null);
let loading = $state(false);
let notFound = $state(false);

$effect(() => {
	const enc = encoded;
	if (!enc) { loadedEvent = null; loading = false; return; }

	(async () => {
		loading = true;
		notFound = false;
		loadedEvent = null;

		let decoded;
		try { decoded = nip19.decode(enc); } catch {
			loading = false; notFound = true; return;
		}

		/** @type {object | null} */
		let filter = null;
		if (decoded.type === 'naddr') {
			const d = decoded.data;
			filter = { kinds: [d.kind], authors: [d.pubkey], '#d': [d.identifier], limit: 1 };
		} else if (decoded.type === 'nevent') {
			filter = { ids: [decoded.data.id], limit: 1 };
		} else if (decoded.type === 'note') {
			filter = { ids: [decoded.data], limit: 1 };
		}

		if (!filter) { loading = false; notFound = true; return; }

		let ev = await queryEvent(filter);

		if (!ev) {
			const relays = [
				...(decoded.type === 'naddr' ? (decoded.data.relays ?? []) : []),
				...(decoded.type === 'nevent' ? (decoded.data.relays ?? []) : []),
				...DEFAULT_COMMUNITY_RELAYS,
				...DEFAULT_SOCIAL_RELAYS,
			].filter((/** @type {string} */ r, i, /** @type {string[]} */ a) => a.indexOf(r) === i).slice(0, 5);
			try {
				const fetched = await fetchFromRelays(relays, { ...filter });
				if (fetched.length) { await putEvents(fetched); ev = fetched[0]; }
			} catch { /* relay unavailable */ }
		}

		loadedEvent = ev ?? null;
		loading = false;
		notFound = !ev;
	})();
});

// ── Resolved event (prop takes priority over self-loaded) ────────────────────
const event = $derived(/** @type {any} */ (eventProp ?? loadedEvent));

// ── Profile ──────────────────────────────────────────────────────────────────
const authorPubkey = $derived(event?.pubkey ?? null);

/** @type {import('nostr-tools').Event | null} */
let fetchedProfile = $state(null);

$effect(() => {
	if (authorProfileProp || !authorPubkey) { fetchedProfile = null; return; }
	const pk = authorPubkey;
	const sub = liveQuery(() => queryEvent({ kinds: [0], authors: [pk], limit: 1 })).subscribe({
		next: (v) => { fetchedProfile = v ?? null; },
		error: () => {}
	});
	return () => sub.unsubscribe();
});

const profileEvent = $derived(/** @type {any} */ (authorProfileProp ?? fetchedProfile));
const parsedProfile = $derived.by(() => {
	if (!profileEvent) return null;
	try { return JSON.parse(profileEvent.content); } catch { return null; }
});

// ── Event meta ───────────────────────────────────────────────────────────────
const ev = $derived(/** @type {any} */ (event));

/** @param {string} name */
const getTag = (name) => ev?.tags?.find((/** @type {string[]} */ t) => t[0] === name)?.[1] ?? null;

const kind = $derived(ev?.kind ?? null);
const title = $derived(getTag('title'));
const summary = $derived(getTag('summary'));
const content = $derived(ev?.content ?? '');

const publisherName = $derived(
	parsedProfile?.display_name || parsedProfile?.name ||
	(authorPubkey ? (() => { try { return nip19.npubEncode(authorPubkey); } catch { return ''; } })() : '')
);

const npub = $derived(
	authorPubkey ? (() => { try { return nip19.npubEncode(authorPubkey); } catch { return ''; } })() : ''
);

// ── Shareable ID for Details tab ─────────────────────────────────────────────
const shareableId = $derived.by(() => {
	if (!ev) return '';
	try {
		if (ev.kind >= 30000) {
			const dTag = ev.tags?.find((/** @type {string[]} */ t) => t[0] === 'd')?.[1] ?? '';
			return nip19.naddrEncode({ kind: ev.kind, pubkey: ev.pubkey, identifier: dTag });
		}
		return nip19.neventEncode({ id: ev.id, author: ev.pubkey });
	} catch { return ''; }
});

// ── wikiLinkFn: fall back to building from event pubkey when kind 30818 ───────
const resolvedWikiLinkFn = $derived.by(() => {
	if (wikiLinkFn) return wikiLinkFn;
	if (!ev || ev.kind !== EVENT_KINDS.WIKI) return undefined;
	const pubkey = ev.pubkey;
	return (/** @type {string} */ slug) => {
		try {
			const naddr = nip19.naddrEncode({ kind: EVENT_KINDS.WIKI, pubkey, identifier: slug });
			return `/communities?event=${naddr}`;
		} catch { return `#${slug}`; }
	};
});

// ── Content rendering ────────────────────────────────────────────────────────
const useMarkdown = $derived(kind !== 1 && kind !== 6 && kind !== 7);

const tokens = $derived.by(() => {
	if (!useMarkdown || !content) return [];
	return tokenizeNostrMarkdown(content, { wikiLinkFn: resolvedWikiLinkFn });
});

// ── Search functions ─────────────────────────────────────────────────────────
const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey() ?? ''));
const searchEmojis = $derived(createSearchEmojisFunction(/** @type {any} */ (() => getCurrentPubkey() ?? '')));

// ── Raw event for Details tab ─────────────────────────────────────────────────
const rawEventForDetails = $derived.by(() => {
	if (!ev) return null;
	const copy = { ...ev };
	delete copy._tags;
	return copy;
});

// ── Publication label ─────────────────────────────────────────────────────────
const publicationLabel = $derived(
	kind === EVENT_KINDS.WIKI ? 'Article'
	: kind === 11 ? 'Post'
	: kind === EVENT_KINDS.TASK ? 'Task'
	: 'Event'
);
</script>

{#if loading}
	<EmptyState message="Loading…" minHeight={200} />
{:else if notFound && !event}
	<EmptyState message="Event not found" minHeight={200} />
{:else if !ev}
	<EmptyState message="Event not found" minHeight={200} />
{:else}
	<div class="general-detail">
		<div class="header-wrap">
			<DetailHeader
				publisherPic={parsedProfile?.picture ?? null}
				{publisherName}
				publisherPubkey={authorPubkey}
				publisherUrl={npub ? `/profile/${npub}` : '#'}
				timestamp={ev.created_at}
				catalogs={[]}
				showPublisher={true}
				showMenu={false}
				showBackButton={true}
				{onBack}
				scrollThreshold={undefined}
				compactPadding={true}
			/>
		</div>

		<div class="content-scroll">
			<div class="content-inner">
				{#if title}
					<h1 class="event-title">{title}</h1>
				{/if}

				{#if summary}
					<div class="summary-panel">
						<p class="summary-text">{summary}</p>
					</div>
				{/if}

				<div class="body-wrap">
					{#if useMarkdown}
						<div class="markdown-body">
							<MarkdownBody {tokens} />
						</div>
					{:else}
						<ShortTextRenderer {content} resolveMentionLabel={undefined} wikiLinkFn={resolvedWikiLinkFn} class="short-body" />
					{/if}
				</div>

				<div class="social-wrap">
				<SocialTabs
					app={{}}
					mainEventIds={[ev.id]}
					wikiLinkFn={resolvedWikiLinkFn}
					showDetailsTab={true}
						detailsShareableId={shareableId}
						detailsPublicationLabel={publicationLabel}
						detailsNpub={npub}
						detailsPubkey={authorPubkey ?? ''}
						detailsRawData={rawEventForDetails}
						comments={[]}
						commentsLoading={false}
						commentsError=""
						zaps={[]}
						zapsLoading={false}
						zapperProfiles={new Map()}
						profiles={{}}
						profilesLoading={false}
						pubkeyToNpub={(/** @type {string} */ pk) => (pk ? nip19.npubEncode(pk) : '')}
						{searchProfiles}
						{searchEmojis}
						labelEntries={[]}
						labelsLoading={false}
						onCommentSubmit={() => {}}
						onZapReceived={() => {}}
						onGetStarted={() => {}}
					/>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.general-detail {
		display: flex;
		flex-direction: column;
		min-height: 0;
		height: 100%;
	}

	.header-wrap { flex-shrink: 0; }

	.content-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.content-inner {
		padding: 0 16px 24px;
	}

	.event-title {
		font-size: 1.4rem;
		font-weight: 700;
		line-height: 1.3;
		color: hsl(var(--foreground));
		margin: 12px 0 8px;
	}

	.summary-panel {
		background: hsl(var(--gray33));
		border-radius: 12px;
		padding: 6px 14px;
		margin-bottom: 14px;
	}

	.summary-text {
		font-size: 0.9375rem;
		color: hsl(var(--white66));
		line-height: 1.5;
		margin: 0;
	}

	.body-wrap { margin-bottom: 4px; }

	.markdown-body {
		font-size: 0.9375rem;
		line-height: 1.6;
		color: hsl(var(--foreground));
	}

	:global(.short-body) {
		font-size: 0.9375rem;
		line-height: 1.6;
	}

	.social-wrap { margin-top: 8px; }
</style>

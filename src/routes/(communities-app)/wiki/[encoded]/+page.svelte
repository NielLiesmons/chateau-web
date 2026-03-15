<script lang="js">
// @ts-nocheck
import { page } from '$app/stores';
import { nip19 } from 'nostr-tools';
import { navHandoff } from '$lib/navHandoff.js';
import WikiDetail from '$lib/components/community/WikiDetail.svelte';

const encoded = $derived($page.params.encoded ?? '');

const slug = $derived.by(() => {
	try {
		const d = nip19.decode(encoded);
		if (d.type === 'naddr' && d.data.kind === 30818) return d.data.identifier;
	} catch {}
	return encoded;
});

// ── Reactive handoff consumption ─────────────────────────────────────────────
// Consume the navHandoff for the INITIAL load synchronously (frame-0 render
// with preloaded event). On intra-route navigation (same /wiki/[encoded] route,
// different param), SvelteKit may soft-navigate without remounting the page
// component — the $effect.pre below re-consumes the handoff BEFORE each render
// so WikiDetail always receives the correct preloaded event.

const _enc0 = $page.params.encoded ?? '';
const _h0 = navHandoff.get(_enc0) ?? null;
if (_h0) navHandoff.delete(_enc0);

let _h = $state(_h0);
let _lastConsumedEnc = _enc0;

// $effect.pre runs synchronously before the DOM is updated, ensuring _h is
// correct before WikiDetail re-renders with new props.
$effect.pre(() => {
	const enc = encoded; // reactive — re-runs when encoded changes
	if (enc === _lastConsumedEnc) return;
	const h = navHandoff.get(enc) ?? null;
	if (h) navHandoff.delete(enc);
	_h = h;
	_lastConsumedEnc = enc;
});

// communityNpub: handoff first, then ?community= URL param as fallback.
// The click handler always embeds ?community= so this is always populated.
const communityNpub = $derived(
	_h?.communityNpub || $page.url.searchParams.get('community') || ''
);
</script>

<svelte:head>
	<title>Wiki — Chateau</title>
</svelte:head>

<WikiDetail
	{slug}
	event={_h?.event ?? null}
	{communityNpub}
	profiles={_h?.profiles ?? null}
	wikiLinkFn={(s) => `/wiki/${s}`}
	onBack={() => history.back()}
/>

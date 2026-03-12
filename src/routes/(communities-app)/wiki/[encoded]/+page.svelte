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

// Consume handoff synchronously — provides event, communityNpub, and profiles instantly.
const _enc = $page.params.encoded ?? '';
const _h = navHandoff.get(_enc) ?? null;
if (_h) navHandoff.delete(_enc);
</script>

<svelte:head>
	<title>Wiki — Chateau</title>
</svelte:head>

<WikiDetail
	{slug}
	event={_h?.event ?? null}
	communityNpub={_h?.communityNpub ?? ''}
	profiles={_h?.profiles ?? null}
	wikiLinkFn={(s) => `/wiki/${s}`}
	onBack={() => history.back()}
/>

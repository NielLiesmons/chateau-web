<script lang="js">
// @ts-nocheck
import { page } from '$app/stores';
import { nip19 } from 'nostr-tools';
import WikiDetail from '$lib/components/community/WikiDetail.svelte';

const encoded = $derived($page.params.encoded ?? '');

const slug = $derived.by(() => {
	try {
		const d = nip19.decode(encoded);
		if (d.type === 'naddr' && d.data.kind === 30818) return d.data.identifier;
	} catch {}
	return encoded;
});
</script>

<svelte:head>
	<title>Wiki — Chateau</title>
</svelte:head>

<WikiDetail
	{slug}
	communityNpub=""
	wikiLinkFn={(s) => `/wiki/${s}`}
	onBack={() => history.back()}
/>

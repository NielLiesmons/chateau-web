<script lang="js">
// @ts-nocheck
import { page } from '$app/stores';
import { browser } from '$app/environment';
import { nip19 } from 'nostr-tools';
import { queryEvent } from '$lib/nostr';
import { EVENT_KINDS } from '$lib/config';
import ForumPostDetail from '$lib/components/community/ForumPostDetail.svelte';
import GeneralEventDetail from '$lib/components/community/GeneralEventDetail.svelte';

const encoded = $derived($page.params.encoded ?? '');

const eventId = $derived.by(() => {
	try {
		const d = nip19.decode(encoded);
		if (d.type === 'nevent') return d.data.id;
		if (d.type === 'note') return d.data;
	} catch {}
	return '';
});

let communityNpub = $state('');

$effect(() => {
	const id = eventId;
	if (!browser || !id) { communityNpub = ''; return; }
	queryEvent({ kinds: [EVENT_KINDS.FORUM_POST], ids: [id], limit: 1 }).then((ev) => {
		if (!ev) return;
		const hTag = ev.tags?.find((t) => t[0] === 'h')?.[1];
		if (!hTag) return;
		try { communityNpub = nip19.npubEncode(hTag); } catch {}
	});
});
</script>

<svelte:head>
	<title>Post — Chateau</title>
</svelte:head>

{#if eventId && communityNpub}
	<ForumPostDetail {eventId} {communityNpub} onBack={() => history.back()} />
{:else if eventId}
	<GeneralEventDetail {encoded} onBack={() => history.back()} />
{/if}

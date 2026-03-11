<script lang="js">
// @ts-nocheck
import { page } from '$app/stores';
import { browser } from '$app/environment';
import { nip19 } from 'nostr-tools';
import { queryEvent } from '$lib/nostr';
import TaskDetail from '$lib/components/community/TaskDetail.svelte';
import GeneralEventDetail from '$lib/components/community/GeneralEventDetail.svelte';

const encoded = $derived($page.params.encoded ?? '');

let eventId = $state('');
let communityNpub = $state('');

$effect(() => {
	const enc = encoded;
	if (!browser || !enc) { eventId = ''; communityNpub = ''; return; }
	(async () => {
		try {
			const d = nip19.decode(enc);
			let ev = null;
			if (d.type === 'naddr') {
				ev = await queryEvent({ kinds: [d.data.kind], authors: [d.data.pubkey], '#d': [d.data.identifier], limit: 1 });
			} else if (d.type === 'nevent') {
				ev = await queryEvent({ ids: [d.data.id], limit: 1 });
			}
			if (!ev) return;
			eventId = ev.id;
			const hTag = ev.tags?.find((t) => t[0] === 'h')?.[1];
			if (hTag) communityNpub = nip19.npubEncode(hTag);
		} catch {}
	})();
});
</script>

<svelte:head>
	<title>Task — Chateau</title>
</svelte:head>

{#if eventId && communityNpub}
	<TaskDetail {eventId} {communityNpub} onBack={() => history.back()} />
{:else if encoded}
	<GeneralEventDetail {encoded} onBack={() => history.back()} />
{/if}

<script lang="js">
// @ts-nocheck
/**
 * /event/[encoded] — Standalone event detail page (deep-link fallback).
 *
 * [encoded] is a bare naddr1… or nevent1… bech32.
 * Used when opening an event outside the communities split-panel context,
 * e.g. from an external link. GeneralEventDetail handles all loading internally.
 */
import { page } from '$app/stores';
import { goto } from '$app/navigation';
import GeneralEventDetail from '$lib/components/community/GeneralEventDetail.svelte';

const encoded = $derived(decodeURIComponent($page.params.encoded ?? ''));

function onBack() {
	if (window.history.length > 1) window.history.back();
	else goto('/communities');
}
</script>

<svelte:head>
	<title>Event — Chateau</title>
</svelte:head>

<main class="event-page">
	<GeneralEventDetail {encoded} {onBack} />
</main>

<style>
	.event-page {
		min-height: 100svh;
		display: flex;
		flex-direction: column;
	}
</style>

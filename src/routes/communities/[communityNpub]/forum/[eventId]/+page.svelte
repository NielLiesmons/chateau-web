<script lang="js">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	// Redirect to two-column layout: same left sidebar, post in right column
	const communityNpub = $derived(decodeURIComponent($page.params.communityNpub || ''));
	const eventId = $derived($page.params.eventId || '');

	onMount(() => {
		if (communityNpub && eventId) {
			goto(`/communities/${encodeURIComponent(communityNpub)}/post/${encodeURIComponent(eventId)}`, { replaceState: true });
		}
	});
</script>

<svelte:head>
	<title>Forum post - Chateau</title>
</svelte:head>

<div class="redirect-placeholder">
	<p>Opening post…</p>
</div>

<style>
	.redirect-placeholder {
		padding: 2rem;
		text-align: center;
		color: hsl(var(--muted-foreground));
	}
</style>

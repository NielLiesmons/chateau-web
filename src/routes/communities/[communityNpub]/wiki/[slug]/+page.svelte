<script lang="js">
// @ts-nocheck
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import WikiDetail from '$lib/components/community/WikiDetail.svelte';

	const communityNpub = $derived(decodeURIComponent($page.params.communityNpub || ''));
	const slug = $derived(decodeURIComponent($page.params.slug || ''));

	function onBack() {
		goto(`/communities?c=${encodeURIComponent(communityNpub)}`, { replaceState: false });
	}

	function wikiLinkFn(s) {
		return `/communities/${encodeURIComponent(communityNpub)}/wiki/${encodeURIComponent(s)}`;
	}
</script>

<svelte:head>
	<title>{slug} - Wiki - Chateau</title>
</svelte:head>

<main class="wiki-page">
	<WikiDetail
		{slug}
		communityNpub={communityNpub}
		wikiLinkFn={wikiLinkFn}
		onBack={onBack}
	/>
</main>

<style>
	.wiki-page {
		min-height: 100vh;
		padding-bottom: 2rem;
	}
</style>

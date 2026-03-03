<script lang="js">
// @ts-nocheck
import { page } from '$app/stores';
import { goto } from '$app/navigation';
import TaskDetail from '$lib/components/community/TaskDetail.svelte';

const communityNpub = $derived(decodeURIComponent($page.params.communityNpub || ''));
const eventId = $derived(decodeURIComponent($page.params.eventId || ''));

function onBack() {
	goto(`/communities?c=${encodeURIComponent(communityNpub)}`, { replaceState: false });
}
</script>

<svelte:head>
	<title>Task - Chateau</title>
</svelte:head>

<main class="task-page">
	<TaskDetail
		{eventId}
		{communityNpub}
		{onBack}
	/>
</main>

<style>
	.task-page {
		min-height: 100dvh;
	}
</style>

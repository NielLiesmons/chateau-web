<script lang="js">
	import { goto } from '$app/navigation';
	import ChateauParallaxHero from '$lib/components/landing/ChateauParallaxHero.svelte';

	function handleExplore() {
		goto('/communities');
	}
</script>

<svelte:head>
	<title>Chateau - Community Collaboration</title>
	<meta name="description" content="Chat, Forum, Tasks and literally anything else" />
</svelte:head>

<main>
	<ChateauParallaxHero onExplore={handleExplore} />
</main>

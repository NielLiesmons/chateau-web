<script lang="js">
import { onMount } from 'svelte';
import { browser } from '$app/environment';
import { initAuth } from '$lib/stores/auth.svelte.js';
import { initOnlineStatus, isOnline } from '$lib/stores/online.svelte.js';
import { startProfileSearchBackground } from '$lib/services/profile-search';
import { startLiveSubscriptions, stopLiveSubscriptions } from '$lib/nostr/service';
import { evictOldEvents } from '$lib/nostr/dexie';
import NavigationProgress from '$lib/components/layout/NavigationProgress.svelte';
import '../app.css';

let { children } = $props();
let online = $derived(isOnline());

onMount(() => {
	if (browser) {
		initAuth();
		initOnlineStatus();
		startLiveSubscriptions();
		evictOldEvents();
		startProfileSearchBackground();
	}
	return () => {
		stopLiveSubscriptions();
	};
});
</script>

<div class="min-h-screen relative bg-background">
	<div class="fixed inset-0 bg-gradient-subtle pointer-events-none"></div>
	<div class="fixed inset-0 bg-dither pointer-events-none opacity-40"></div>

	<div class="relative z-10 flex flex-col min-h-screen">
		<NavigationProgress />

		{#if !online}
			<div class="offline-banner">
				<span class="offline-icon">📡</span>
				<span>You're offline — showing cached data</span>
			</div>
		{/if}

		<main class="flex-1">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.offline-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: hsl(var(--goldColor33));
		color: hsl(var(--goldColor));
		font-size: 0.875rem;
		font-weight: 500;
	}

	.offline-icon {
		font-size: 1rem;
	}
</style>

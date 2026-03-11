<script lang="js">
// @ts-nocheck
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import EmptyState from '$lib/components/common/EmptyState.svelte';

// Backward-compat redirect: /communities?c=[npub] → /community/[npub]
$effect(() => {
	if (!browser) return;
	const c = $page.url.searchParams.get('c');
	if (c) goto(`/community/${encodeURIComponent(c)}`, { replaceState: true });
});
</script>

<div class="panel-placeholder">
	<EmptyState message="Select a community" minHeight={280} />
</div>

<style>
	.panel-placeholder {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		min-height: 200px;
	}
</style>

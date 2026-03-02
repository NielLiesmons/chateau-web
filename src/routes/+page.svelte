<script lang="js">
import { goto } from '$app/navigation';
import { browser } from '$app/environment';

if (browser) {
	goto('/communities', { replaceState: true });
}
</script>

<div class="spinner-page">
	<div class="spinner"></div>
</div>

<style>
	.spinner-page {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: hsl(var(--background));
	}

	.spinner {
		width: 2rem;
		height: 2rem;
		border: 2px solid hsl(var(--white8));
		border-top-color: hsl(var(--blurple));
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

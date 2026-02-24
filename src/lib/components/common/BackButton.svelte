<script lang="js">
/**
 * BackButton - Round back button with chevron (2px left of center), gray33 bg, scale-on-press.
 */
import { ChevronLeft } from '$lib/components/icons';

let { onBack = () => {} } = $props();
</script>

<button type="button" class="back-button" aria-label="Back" onclick={() => onBack()}>
	<span class="back-button-icon">
		<ChevronLeft variant="outline" size={14} strokeWidth={1.4} color="hsl(var(--white33))" />
	</span>
</button>

<style>
	.back-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		min-width: 28px;
		min-height: 28px;
		background: hsl(var(--gray33));
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: transform 0.15s ease;
	}
	.back-button:active {
		transform: scale(0.96);
	}
	/* Chevron 2px left of center for visual balance */
	.back-button-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 2px;
	}
	.back-button-icon :global(svg) {
		pointer-events: none;
	}
</style>

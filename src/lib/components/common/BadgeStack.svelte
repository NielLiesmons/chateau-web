<script lang="js">
/**
 * BadgeStack - Zaplab_design style: overlapping badges with dovetail decorations.
 * Small: 32w x 38h per badge, overlap 16px. Circular image + white16 dovetails at bottom.
 */
import ProfilePic from './ProfilePic.svelte';

let {
	/** List of { image?: string, name?: string } for list/profile images */
	items = [],
	maxDisplay = 4,
	overlapPx = 16,
	/** Badge width (zaplab small = 32). If badgeSizePx is passed, used for width and height = width+6. */
	badgeWidth = 32,
	/** Badge height including dovetail (zaplab small = 38) */
	badgeHeight = 38,
	/** Legacy: sets both width and height (height = badgeSizePx + 6) */
	badgeSizePx = undefined,
	className = ''
} = $props();

const w = $derived(badgeSizePx ?? badgeWidth);
const h = $derived(badgeSizePx != null ? badgeSizePx + 6 : badgeHeight);
const displayed = $derived(items.slice(0, maxDisplay));
const stackWidth = $derived(displayed.length ? w + (displayed.length - 1) * (w - overlapPx) : 0);
</script>

<div class="badge-stack {className}" style="width: {stackWidth}px; height: {h}px;">
	{#each displayed as item, i}
		<div
			class="badge-stack-item"
			style="left: {i * (w - overlapPx)}px; z-index: {displayed.length - i}; width: {w}px; height: {h}px;"
		>
			<!-- Circular image area (top) -->
			<div class="badge-stack-pic-wrap" style="width: {w}px; height: {w}px;">
				<div class="badge-stack-pic">
					<ProfilePic
						pictureUrl={item.image ?? item.pictureUrl}
						name={item.name}
						size="xs"
					/>
				</div>
			</div>
			<!-- Dovetail decorations (bottom) - zaplab_design style -->
			<div class="badge-dovetails" style="width: {w}px;">
				{#if i === 0}
					<!-- Left dovetail: rotated 30deg -->
					<svg class="dovetail dovetail-left" viewBox="0 0 11 19" style="width: 11px; height: 19px;">
						<path d="M0 0 L11 0 L11 19 L5.5 14.25 L0 19 Z" fill="hsl(var(--white16))" />
					</svg>
				{/if}
				<!-- Right dovetail: rotated -30deg -->
				<svg class="dovetail dovetail-right" viewBox="0 0 11 19" style="width: 11px; height: 19px;">
					<path d="M0 0 L11 0 L11 19 L5.5 14.25 L0 19 Z" fill="hsl(var(--white16))" />
				</svg>
			</div>
		</div>
	{/each}
</div>

<style>
	.badge-stack {
		position: relative;
		flex-shrink: 0;
	}
	.badge-stack-item {
		position: absolute;
		top: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow: visible;
	}
	.badge-stack-pic-wrap {
		flex-shrink: 0;
		border-radius: 50%;
		overflow: hidden;
		background: hsl(var(--white16));
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 2px 0 6px -2px hsl(var(--black66));
	}
	.badge-stack-item:first-child .badge-stack-pic-wrap {
		box-shadow: none;
	}
	.badge-stack-pic {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.badge-stack-pic :global(.profile-pic) {
		width: 100% !important;
		height: 100% !important;
		min-width: 100%;
		min-height: 100%;
	}
	.badge-dovetails {
		position: absolute;
		bottom: 0;
		left: 0;
		height: 24px;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		pointer-events: none;
	}
	.dovetail {
		position: absolute;
		bottom: 0;
	}
	.dovetail-left {
		left: 0;
		transform: rotate(30deg);
		transform-origin: center bottom;
	}
	.dovetail-right {
		right: 0;
		transform: rotate(-30deg);
		transform-origin: center bottom;
	}
</style>

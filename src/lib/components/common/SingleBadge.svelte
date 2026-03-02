<script lang="js">
/**
 * SingleBadge - A single badge display with dovetail pin decorations.
 * Used to display a list/group image (not a profile pic).
 * The circular image sits on top; dovetail shapes are behind it.
 */
let {
	/** Image URL for the badge */
	image = null,
	/** Fallback name for display */
	name = '',
	/** Diameter of the circular image in px */
	sizePx = 52,
} = $props();

// Scale all dovetail dimensions proportionally to the circle size
// Reference: BadgeStack uses 11×19 dovetail for 32px circle, 6px peek below
const scale = $derived(sizePx / 32);
const dovetailW = $derived(Math.round(11 * scale));
const dovetailH = $derived(Math.round(22 * scale));
const peekBelow = $derived(Math.round(6 * scale));
// Dovetails start so that `peekBelow` px sticks out below the circle
const dovetailTopOffset = $derived(sizePx - (dovetailH - peekBelow));
const totalHeight = $derived(sizePx + peekBelow);
</script>

<div class="single-badge" style="width: {sizePx}px; height: {totalHeight}px;">
	<!-- Dovetail pins — behind the image (z-index 1) -->
	<div class="single-badge-dovetails" style="top: {dovetailTopOffset}px; width: {sizePx}px; height: {dovetailH}px;">
		<svg class="sb-dovetail sb-dovetail-left" viewBox="0 0 11 22" style="width: {dovetailW}px; height: {dovetailH}px;">
			<path d="M0 2.5 Q0 0 2.5 0 L8.5 0 Q11 0 11 2.5 L11 22 L5.5 17 L0 22 Z" fill="hsl(var(--white16))" />
		</svg>
		<svg class="sb-dovetail sb-dovetail-right" viewBox="0 0 11 22" style="width: {dovetailW}px; height: {dovetailH}px;">
			<path d="M0 2.5 Q0 0 2.5 0 L8.5 0 Q11 0 11 2.5 L11 22 L5.5 17 L0 22 Z" fill="hsl(var(--white16))" />
		</svg>
	</div>
	<!-- Circular image — above dovetails (z-index 2) -->
	<div class="single-badge-pic" style="width: {sizePx}px; height: {sizePx}px;">
		{#if image}
			<img src={image} alt={name || 'List'} class="single-badge-img" />
		{:else}
			<span class="single-badge-fallback">{(name || '?').slice(0, 1).toUpperCase()}</span>
		{/if}
	</div>
</div>

<style>
	.single-badge {
		position: relative;
		flex-shrink: 0;
	}
	.single-badge-dovetails {
		position: absolute;
		left: 0;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		pointer-events: none;
		z-index: 1;
	}
	.sb-dovetail {
		position: absolute;
		bottom: 0;
	}
	.sb-dovetail-left {
		left: 0;
		transform: rotate(30deg);
		transform-origin: center bottom;
	}
	.sb-dovetail-right {
		right: 0;
		transform: rotate(-30deg);
		transform-origin: center bottom;
	}
	.single-badge-pic {
		position: absolute;
		top: 0;
		left: 0;
		border-radius: 50%;
		overflow: hidden;
		background: hsl(var(--white16));
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2;
	}
	.single-badge-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.single-badge-fallback {
		font-size: 1.25rem;
		font-weight: 600;
		color: hsl(var(--white66));
		user-select: none;
	}
</style>

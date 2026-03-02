<script>
/**
 * PriorityBox - visual priority indicator built entirely from CSS/SVG containers.
 *
 * Outer shape: same size/3 border-radius as TaskBox, but transparent (no bg or border).
 *
 * States:
 *   none    → three equal dots, all dim (white16) — tap-to-set affordance
 *   low     → bars variant: 1 of 3 lit (white66), 2 dim (white16)
 *   medium  → bars variant: 2 of 3 lit
 *   high    → bars variant: all 3 lit
 *   urgent  → rounded-corner triangle filled with rouge gradient
 *
 * variant prop is respected for low/medium/high; "none" always shows dots.
 *
 * .dot and .bar carry CSS transitions so future animations are plug-and-play.
 */

let {
	variant = /** @type {"bars" | "dots"} */ ("bars"),
	priority = /** @type {"none" | "low" | "medium" | "high" | "urgent"} */ ("none"),
	size = 24,
} = $props();

const ACTIVE_COUNTS = /** @type {Record<string,number>} */ ({ none: 0, low: 1, medium: 2, high: 3 });
const activeCount = $derived(ACTIVE_COUNTS[priority] ?? 0);
const isUrgent = $derived(priority === "urgent");
const isNone   = $derived(priority === "none");

// Proportional inner sizing — 3 units + 2 gaps must fit in the box
const unitH     = $derived(Math.max(2, Math.round(size * 0.165)));
const gap       = $derived(Math.max(1, Math.round(unitH * 0.55)));
const barRadius = $derived(Math.ceil(unitH / 2));

const DIM    = 'hsl(var(--white16))';
const ACTIVE = 'hsl(var(--white66))';

// Per-element colour (bars and dots share the same logic)
const elColors = $derived([
	activeCount >= 1 ? ACTIVE : DIM,
	activeCount >= 2 ? ACTIVE : DIM,
	activeCount >= 3 ? ACTIVE : DIM,
]);
</script>

<div
	class="priority-box"
	style="width: {size}px; height: {size}px; border-radius: {Math.round(size / 3)}px;"
>
	{#if isUrgent}
		<!--
			Equilateral triangle, side=16, visually centred in the {size}×{size} box.
			Vertices (22-unit grid): A=(11,4.1) top, B=(3,17.9) BL, C=(19,17.9) BR.
			Bounding-box centre = (11,11) ✓.  Corner radius = inradius ≈ 4.62 (max
			valid for equilateral), giving rounder corners that match the outer box.
			All coordinates scaled by s = size/22 so it works at any size.
		-->
		{@const s = size / 22}
		<div
			class="urgent-triangle"
			style="
				width: {size}px;
				height: {size}px;
				clip-path: path('M {8.7*s} {8.1*s} L {5.3*s} {13.9*s} Q {3*s} {17.9*s} {7.6*s} {17.9*s} L {14.4*s} {17.9*s} Q {19*s} {17.9*s} {16.7*s} {13.9*s} L {13.3*s} {8.1*s} Q {11*s} {4.1*s} {8.7*s} {8.1*s} Z');
			"
			aria-label="Urgent"
		></div>

	{:else if isNone}
		<!-- Default: three equal dim dots — "tap to set priority" affordance -->
		<div class="inner-row" style="gap: {gap}px;">
			{#each [0, 1, 2] as i (i)}
				<div
					class="dot"
					style="
						width: {unitH}px;
						height: {unitH}px;
						border-radius: 50%;
						background: {DIM};
					"
				></div>
			{/each}
		</div>

	{:else if variant === "dots"}
		<!-- Dots with active colours -->
		<div class="inner-row" style="gap: {gap}px;">
			{#each [0, 1, 2] as i (i)}
				<div
					class="dot"
					style="
						width: {unitH}px;
						height: {unitH}px;
						border-radius: 50%;
						background: {elColors[i]};
					"
				></div>
			{/each}
		</div>

	{:else}
		<!-- Bars: ascending bar-graph, bottom-aligned -->
		<div class="inner-row bars-row" style="gap: {gap}px;">
			{#each [0, 1, 2] as i (i)}
				<div
					class="bar"
					style="
						width: {unitH}px;
						height: {unitH * (i + 1)}px;
						border-radius: {barRadius}px;
						background: {elColors[i]};
					"
				></div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.priority-box {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		background: transparent;
		border: none;
	}

	.inner-row {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.bars-row {
		align-items: flex-end;
	}

	.urgent-triangle {
		background: var(--gradient-rouge);
		flex-shrink: 0;
	}

	/* Animation hooks — background and height transitions for future use */
	.dot,
	.bar {
		flex-shrink: 0;
		transition: background 0.2s ease, height 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
	}
</style>

<script lang="js">
/**
 * LabelStack — overlapping row of small Label pills.
 *
 * z-index increases with index so each label sits on top of the previous one.
 * Non-top labels are capped at 50px wide with a wide mask fade on the right
 * so that the semi-transparent label backgrounds don't visibly bleed through
 * the label sitting above them.
 */
import Label from './Label.svelte';

let {
	/** @type {string[]} */
	labels = [],
	maxDisplay = 3,
} = $props();

const displayed = $derived(labels.slice(0, maxDisplay));
</script>

<div class="label-stack">
	{#each displayed as text, i}
		<div
			class="label-item"
			class:is-behind={i < displayed.length - 1}
			style="z-index: {i + 1}; {i > 0 ? 'margin-left: -10px;' : ''}"
		>
			<div style="pointer-events: none;">
				<Label {text} size="small" onTap={() => {}} />
			</div>
		</div>
	{/each}
</div>

<style>
	.label-stack {
		display: flex;
		align-items: center;
	}

	.label-item {
		position: relative;
		flex-shrink: 0;
	}

	/*
	 * Non-top labels: lock layout to 50px, then fade from opaque → fully
	 * transparent by calc(100% - 10px) = 40px, which is exactly where the next
	 * label's left edge arrives (50px width - 10px overlap = 40px). Zero bleed.
	 */
	.label-item.is-behind {
		width: 50px;
		overflow: hidden;
		mask-image: linear-gradient(to right, black calc(100% - 25px), transparent calc(100% - 10px));
		-webkit-mask-image: linear-gradient(to right, black calc(100% - 25px), transparent calc(100% - 10px));
	}
</style>

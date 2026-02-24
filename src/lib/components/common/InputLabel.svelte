<script lang="js">
/**
 * InputLabel - Tag/label-shaped text input
 *
 * Shape: rounded rectangle on left + smooth pointed shape on right
 * Styling: black33 background with white33 outline
 * Height: 42px desktop, 38px mobile
 * Shows divider + chevron when empty, Add button when text is entered.
 */
import { onMount } from 'svelte';
import { ChevronDown } from '$lib/components/icons';

let {
	value = $bindable(''),
	placeholder = 'Your label',
	onAdd = /** @type {() => void} */ (() => {}),
	onOptions = /** @type {() => void} */ (() => {}),
	focusOnMount = false
} = $props();

const hasText = $derived(value.trim().length > 0);

/** @type {HTMLInputElement | null} */
let inputEl = $state(null);

onMount(() => {
	if (focusOnMount) {
		// Small delay lets the fly transition start so the element is interactable
		const t = setTimeout(() => inputEl?.focus(), 150);
		return () => clearTimeout(t);
	}
});
</script>

<div class="input-label-container">
	<svg class="input-label-shape" viewBox="0 0 500 42" preserveAspectRatio="none" aria-hidden="true">
		<path
			d="M16 0.5
			   L460 0.5
			   Q468 0.5 474 4
			   Q482 9 488 16
			   Q491 19.5 491 21
			   Q491 22.5 488 26
			   Q482 33 474 38
			   Q468 41.5 460 41.5
			   L16 41.5
			   A15.5 15.5 0 0 1 0.5 26
			   L0.5 16
			   A15.5 15.5 0 0 1 16 0.5
			   Z"
			fill="hsl(var(--black33))"
			stroke="hsl(var(--white33))"
			stroke-width="0.5"
			vector-effect="non-scaling-stroke"
		/>
	</svg>

	<input type="text" class="input-label-input" bind:value bind:this={inputEl} {placeholder} />

	{#if hasText}
		<button type="button" class="add-button" onclick={onAdd}>Add</button>
	{:else}
		<div class="divider"></div>
		<button type="button" class="chevron-button" onclick={onOptions}>
			<ChevronDown variant="outline" size={16} color="hsl(var(--white33))" />
		</button>
	{/if}
</div>

<style>
	.input-label-container {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
		height: 38px;
	}

	@media (min-width: 768px) {
		.input-label-container {
			height: 42px;
		}
	}

	.input-label-shape {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.input-label-input {
		position: relative;
		flex: 1;
		height: 100%;
		padding: 0 0 0 16px;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--white));
		font-family: 'Inter', sans-serif;
		font-size: 16px;
		font-weight: 500;
		line-height: 38px;
		min-width: 0;
	}

	@media (min-width: 768px) {
		.input-label-input {
			line-height: 42px;
		}
	}

	.input-label-input::placeholder {
		color: hsl(var(--white33));
	}

	.add-button {
		position: relative;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 24px;
		padding: 0 14px;
		margin-right: 26px;
		font-size: 13px;
		font-weight: 500;
		color: hsl(var(--primary-foreground));
		background: var(--gradient-blurple);
		border: none;
		border-radius: 9999px;
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	@media (min-width: 768px) {
		.add-button {
			height: 26px;
			padding: 0 16px;
			font-size: 14px;
			margin-right: 32px;
		}
	}

	.add-button:hover {
		transform: scale(1.04);
	}

	.add-button:active {
		transform: scale(0.96);
	}

	.divider {
		width: 1.4px;
		height: 100%;
		margin-left: 8px;
		background-color: hsl(var(--white8));
		flex-shrink: 0;
	}

	.chevron-button {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		padding-left: 10px;
		padding-top: 2px;
		width: 46px;
		height: 100%;
		margin-right: 6px;
		background: transparent;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
		transition: opacity 0.15s ease;
	}

	@media (min-width: 768px) {
		.chevron-button {
			width: 50px;
			padding-left: 12px;
			margin-right: 8px;
		}
	}

	.chevron-button:hover {
		opacity: 0.7;
	}
</style>

<script lang="js">
/**
 * ActionsModal - Actions sheet for content (add labels, report).
 * Opened from BottomBar when signed in.
 * Content type drives the report label; stacks section shown only for 'app' type.
 */
import { fly } from "svelte/transition";
import { cubicOut } from "svelte/easing";
import InputLabel from "$lib/components/common/InputLabel.svelte";
import Label from "$lib/components/common/Label.svelte";

let {
	isOpen = $bindable(false),
	contentType = "post",
} = $props();

const contentTypeLabel = $derived(contentType.charAt(0).toUpperCase() + contentType.slice(1));
const showStacksSection = $derived(contentType === 'app');

let labelValue = $state("");

const defaultLabels = ['Discussion', 'Question', 'Help', 'Announcement', 'Feature', 'Bug'];

function selectLabel(/** @type {string} */ label) {
	labelValue = label;
}

function close() {
	isOpen = false;
}

function handleKeydown(/** @type {KeyboardEvent} */ e) {
	if (e.key === 'Escape') close();
}

$effect(() => {
	if (!isOpen) {
		labelValue = "";
	}
});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="actions-overlay" onclick={close} role="presentation"></div>

	<div class="actions-wrapper" role="dialog" aria-modal="true" aria-label="Content actions">
		<div class="actions-sheet" transition:fly={{ y: 80, duration: 200, easing: cubicOut }}>
			<!-- Title -->
			<div class="actions-section title-section">
				<h2 class="modal-title-text">Actions</h2>
			</div>

			<div class="section-divider"></div>

			<!-- Stacks section (apps only) -->
			{#if showStacksSection}
			<div class="actions-section">
				<p class="actions-modal-header">ADD TO STACKS</p>
			</div>
			<div class="section-divider"></div>
			{/if}

			<!-- Labels section -->
			<div class="actions-section">
				<p class="actions-modal-header">ADD LABELS</p>
				<div class="section-content">
					<InputLabel bind:value={labelValue} placeholder="Your label" />
				</div>
				<div class="labels-scroll-row">
					<div class="labels-row-inner">
						{#each defaultLabels as label}
							<button
								type="button"
								class="label-tap"
								onclick={() => selectLabel(label)}
								aria-label="Select {label}"
							>
								<Label text={label} isSelected={labelValue === label} isEmphasized={false} />
							</button>
						{/each}
					</div>
				</div>
			</div>

			<div class="section-divider"></div>

			<!-- Report section -->
			<div class="actions-section">
				<div class="section-content">
					<button
						type="button"
						class="report-button"
						onclick={() => {}}
					>
						Report this {contentTypeLabel}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.actions-overlay {
		position: fixed;
		inset: 0;
		z-index: 49;
		background: transparent;
	}

	.actions-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.actions-sheet {
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		display: flex;
		flex-direction: column;
		padding-bottom: max(20px, env(safe-area-inset-bottom));
	}

	@media (min-width: 768px) {
		.actions-sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
			padding-bottom: 0;
		}
	}

	.actions-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 0;
	}

	.title-section {
		padding-top: 20px;
		padding-bottom: 14px;
	}

	.modal-title-text {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		text-align: center;
	}

	.section-divider {
		width: 100%;
		height: 1px;
		background-color: hsl(var(--white8));
	}

	.actions-modal-header {
		margin: 0;
		padding-left: 24px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: hsl(var(--white33));
	}

	.section-content {
		padding: 0 12px;
	}

	.labels-scroll-row {
		overflow-x: auto;
		overflow-y: hidden;
		padding: 4px 12px;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.labels-scroll-row::-webkit-scrollbar {
		display: none;
	}

	.labels-row-inner {
		display: flex;
		flex-wrap: nowrap;
		gap: 8px;
		width: max-content;
	}

	.label-tap {
		flex-shrink: 0;
		cursor: pointer;
		background: transparent;
		border: none;
		padding: 0;
	}

	.report-button {
		width: 100%;
		height: 42px;
		padding: 0 20px;
		font-size: 16px;
		font-weight: 500;
		color: hsl(var(--destructive));
		background-color: hsl(var(--black33));
		border: none;
		border-radius: var(--radius-16);
		cursor: pointer;
	}

	@media (max-width: 767px) {
		.report-button {
			height: 38px;
		}
	}
</style>

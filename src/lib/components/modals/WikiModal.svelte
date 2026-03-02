<script lang="js">
/**
 * WikiModal - Bottom sheet for creating a new wiki article (kind 30818).
 * Title input (required, auto-generates d-tag slug) + optional summary +
 * rich Nostr Markdown content editor + labels.
 *
 * onsubmit receives: { title, slug, summary, text, emojiTags, mentions, labels }
 * The parent page is responsible for signing and publishing the event.
 */
import { fly, fade } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import ShortTextInput from '$lib/components/common/ShortTextInput.svelte';
import EmojiPickerModal from '$lib/components/modals/EmojiPickerModal.svelte';
import ForumPostLabelsModal from '$lib/components/modals/ForumPostLabelsModal.svelte';
import { Camera, EmojiFill, Plus } from '$lib/components/icons';
import { createSearchEmojisFunction } from '$lib/services/emoji-search';
import { createSearchProfilesFunction } from '$lib/services/profile-search';

const WIKI_LABEL_SUGGESTIONS = [
	'Guide', 'Reference', 'Tutorial', 'Overview', 'FAQ', 'Glossary',
	'Spec', 'Protocol', 'API', 'Architecture', 'Security', 'Onboarding',
	'Design', 'Nostr', 'Backend', 'Frontend', 'Community', 'Meta'
];

let {
	isOpen = $bindable(false),
	communityName: _communityName = '',
	getCurrentPubkey = () => null,
	searchProfiles: searchProfilesProp = null,
	searchEmojis: searchEmojisProp = null,
	onsubmit,
	onclose
} = $props();

const searchProfiles = $derived(searchProfilesProp ?? createSearchProfilesFunction(/** @type {any} */ (getCurrentPubkey)));
const searchEmojis = $derived(searchEmojisProp ?? createSearchEmojisFunction(/** @type {any} */ (getCurrentPubkey)));

let titleValue = $state('');
let summaryValue = $state('');
/** @type {import('$lib/components/common/ShortTextInput.svelte').default | null} */
let contentInput = $state(null);
/** @type {HTMLInputElement | null} */
let titleInput = $state(null);
let submitting = $state(false);
let error = $state('');
let emojiPickerOpen = $state(false);
let labelsModalOpen = $state(false);
/** @type {string[]} */
let selectedLabels = $state([]);
let slugValue = $state('');
let slugEdited = $state(false);

/** Normalizes a string → d-tag slug: lowercase, non-alphanumeric → '-', collapse/trim dashes. */
function toSlug(/** @type {string} */ title) {
	return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wiki';
}

// Auto-populate slug from title unless the user has manually edited it
$effect(() => {
	if (!slugEdited) slugValue = toSlug(titleValue);
});

const slugPreview = $derived(slugValue || toSlug(titleValue));

function handleEmojiTap() { emojiPickerOpen = true; }
function handleEmojiSelect(/** @type {{ shortcode: string; url: string; source: string }} */ emoji) {
	contentInput?.insertEmoji?.(emoji.shortcode, emoji.url, emoji.source);
	contentInput?.focus?.();
}
function handleLabelsTap() { labelsModalOpen = true; }

function close() {
	isOpen = false;
	onclose?.();
}

function handleKeydown(/** @type {KeyboardEvent} */ e) {
	if (e.key === 'Escape') {
		if (labelsModalOpen || emojiPickerOpen) return;
		close();
	}
}

async function handlePublish() {
	if (!titleValue.trim() || submitting) return;
	submitting = true;
	error = '';
	try {
		const serialized = contentInput?.getSerializedContent?.() ?? { text: '', emojiTags: [], mentions: [] };
		await onsubmit?.({
			title: titleValue.trim(),
			slug: slugPreview || toSlug(titleValue),
			summary: summaryValue.trim(),
			text: serialized.text ?? '',
			emojiTags: serialized.emojiTags ?? [],
			mentions: serialized.mentions ?? [],
			labels: selectedLabels
		});
		titleValue = '';
		summaryValue = '';
		slugValue = '';
		slugEdited = false;
		contentInput?.clear?.();
		selectedLabels = [];
		close();
	} catch (err) {
		console.error('Failed to publish wiki:', err);
		error = /** @type {any} */ (err)?.message || 'Failed to publish';
	} finally {
		submitting = false;
	}
}

$effect(() => {
	if (isOpen) {
		const t = setTimeout(() => titleInput?.focus(), 80);
		return () => clearTimeout(t);
	} else {
		titleValue = '';
		summaryValue = '';
		slugValue = '';
		slugEdited = false;
		error = '';
		submitting = false;
		emojiPickerOpen = false;
		labelsModalOpen = false;
		selectedLabels = [];
	}
});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay bg-overlay" onclick={close} role="presentation" transition:fade={{ duration: 180 }}></div>

	<div class="wiki-sheet-wrapper" role="dialog" aria-modal="true" aria-label="New wiki article">
		<div
			class="wiki-sheet"
			class:child-modal-open={emojiPickerOpen || labelsModalOpen}
			transition:fly={{ y: 100, duration: 200, easing: cubicOut }}
		>
			<div class="child-overlay" aria-hidden="true"></div>

			<!-- ── Form box ── -->
			<div class="post-form-box">

			<!-- Title row -->
			<div class="title-area">
				<input
					type="text"
					class="wiki-title-input"
					placeholder="Title of Wiki"
					bind:value={titleValue}
					bind:this={titleInput}
					disabled={submitting}
					aria-label="Article title"
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); contentInput?.focus?.(); } }}
				/>
			</div>

			<div class="post-form-divider"></div>

			<!-- Slug row -->
			<div class="slug-area">
				<span class="slug-prefix">/</span>
				<input
					type="text"
					class="slug-input"
					placeholder={toSlug(titleValue) || 'wiki'}
					value={slugEdited ? slugValue : (titleValue.trim() ? toSlug(titleValue) : '')}
					disabled={submitting}
					aria-label="Article slug (d-tag)"
					oninput={(e) => {
						const val = /** @type {HTMLInputElement} */ (e.target).value
							.toLowerCase()
							.replace(/[^a-z0-9-]+/g, '-')
							.replace(/^-+/, '');
						slugEdited = true;
						slugValue = val;
						/** @type {HTMLInputElement} */ (e.target).value = val;
					}}
					onblur={() => {
						if (slugEdited && !slugValue.trim()) {
							slugEdited = false;
						} else if (slugEdited) {
							slugValue = slugValue.replace(/-+$/, '') || toSlug(titleValue);
						}
					}}
				/>
			</div>

			<div class="post-form-divider"></div>

			<!-- Summary row -->
			<input
				type="text"
				class="wiki-summary-input"
					placeholder="Short summary (optional)"
					bind:value={summaryValue}
					disabled={submitting}
					aria-label="Article summary"
				/>

				<div class="post-form-divider"></div>

				<!-- Content area -->
				<div class="post-content-area">
					<ShortTextInput
						bind:this={contentInput}
						placeholder="Write your wiki article"
						size="large"
						{searchProfiles}
						{searchEmojis}
						showActionRow={false}
						onchange={undefined}
						onsubmit={undefined}
						onClose={undefined}
						aboveEditor={undefined}
					/>
				</div>

				<!-- Action row (no divider above — identical to ForumPostModal) -->
				<div class="post-action-row">
					<div class="action-buttons-left">
						<button type="button" class="action-btn" aria-label="Add photo" onclick={() => {}}>
							<Camera variant="fill" color="hsl(var(--white33))" size={20} />
						</button>
						<button type="button" class="action-btn" aria-label="Add emoji" onclick={handleEmojiTap}>
							<EmojiFill variant="fill" color="hsl(var(--white33))" size={18} />
						</button>
						<button type="button" class="action-btn" aria-label="Add attachment" onclick={() => {}}>
							<Plus variant="outline" color="hsl(var(--white33))" size={16} strokeWidth={2.8} />
						</button>
						<button
							type="button"
							class="labels-trigger"
							class:has-labels={selectedLabels.length > 0}
							onclick={handleLabelsTap}
							aria-label="Add labels"
						>
							<span class="labels-trigger-body">
								<span class="trigger-count">{selectedLabels.length}</span>
								<span class="trigger-text">Label{selectedLabels.length === 1 ? '' : 's'}</span>
							</span>
							<svg class="labels-trigger-tip" width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
								<path d="M0 0 L4 0 Q9 2 14 6 Q19 10 23 14 Q23.5 16 23 18 Q19 22 14 26 Q9 30 4 32 L0 32 Z" fill="var(--trigger-bg)" />
							</svg>
						</button>
					</div>

					<button
						type="button"
						class="publish-btn"
						onclick={handlePublish}
						disabled={!titleValue.trim() || submitting}
					>
						{submitting ? 'Publishing…' : 'Publish'}
					</button>
				</div>
			</div>

			{#if error}
				<p class="error-text">{error}</p>
			{/if}
		</div>
	</div>
{/if}

<EmojiPickerModal
	bind:isOpen={emojiPickerOpen}
	{getCurrentPubkey}
	onSelectEmoji={handleEmojiSelect}
	onclose={() => { emojiPickerOpen = false; }}
/>

<ForumPostLabelsModal
	bind:isOpen={labelsModalOpen}
	bind:selectedLabels
	suggestions={WIKI_LABEL_SUGGESTIONS}
	onclose={() => { labelsModalOpen = false; }}
/>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 49;
	}

	.wiki-sheet-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		display: flex;
		justify-content: center;
		align-items: flex-end;
		pointer-events: none;
	}

	.wiki-sheet {
		width: 100%;
		max-width: 100%;
		height: 80svh;
		margin: 0;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		padding: 16px;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		position: relative;
		transition: transform 0.25s cubic-bezier(0.33, 1, 0.68, 1);
		transform-origin: top center;
		display: flex;
		flex-direction: column;
	}

	.wiki-sheet.child-modal-open {
		transform: scale(0.96) translateY(8px);
	}

	.child-overlay {
		position: absolute;
		inset: 0;
		background: hsl(var(--black33));
		z-index: 10;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s ease-out;
		border-radius: inherit;
	}

	.wiki-sheet.child-modal-open .child-overlay {
		opacity: 1;
	}

	@media (min-width: 768px) {
		.wiki-sheet {
			max-width: 680px;
			height: 80svh;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
			padding: 12px;
		}
	}

	/* ── Form box ── */
	.post-form-box {
		flex: 1;
		display: flex;
		flex-direction: column;
		background-color: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white33));
		border-radius: var(--radius-16);
		overflow: hidden;
		min-height: 0;
	}

	/* ── Title row ── */
	.title-area {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		min-height: 44px;
		flex-shrink: 0;
	}

	.wiki-title-input {
		flex: 1;
		min-width: 0;
		padding: 0;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--white));
		font-family: 'Inter', sans-serif;
		font-size: 18px;
		font-weight: 600;
		box-sizing: border-box;
	}

	.wiki-title-input::placeholder {
		color: hsl(var(--white33));
		font-weight: 500;
	}

	.wiki-title-input:disabled {
		opacity: 0.6;
	}

	/* ── Slug row ── */
	.slug-area {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 6px 12px;
		min-height: 34px;
		flex-shrink: 0;
	}

	.slug-prefix {
		font-size: 13px;
		font-weight: 600;
		color: hsl(var(--white33));
		font-family: 'JetBrains Mono', monospace;
		flex-shrink: 0;
		line-height: 1;
	}

	.slug-input {
		flex: 1;
		min-width: 0;
		padding: 0;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--white33));
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
		font-weight: 500;
		box-sizing: border-box;
	}

	.slug-input::placeholder {
		color: hsl(var(--white16));
	}

	.slug-input:focus {
		color: hsl(var(--white66));
	}

	.slug-input:disabled {
		opacity: 0.5;
	}

	/* ── Summary input ── */
	.wiki-summary-input {
		width: 100%;
		padding: 8px 12px;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--white66));
		font-family: 'Inter', sans-serif;
		font-size: 14px;
		font-weight: 400;
		box-sizing: border-box;
		flex-shrink: 0;
	}

	.wiki-summary-input::placeholder {
		color: hsl(var(--white33));
	}

	.wiki-summary-input:disabled {
		opacity: 0.6;
	}

	/* Divider */
	.post-form-divider {
		width: 100%;
		height: 1.4px;
		background-color: hsl(var(--white8));
		flex-shrink: 0;
	}

	/* Content area — grows to fill available height */
	.post-content-area {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	/* Action row */
	.post-action-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 12px 12px 12px;
		gap: 8px;
		flex-shrink: 0;
	}

	.action-buttons-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.action-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--white8));
		border: none;
		border-radius: 8px;
		cursor: pointer;
	}

	.action-btn:active {
		transform: scale(0.97);
	}

	/* Labels trigger */
	.labels-trigger {
		display: inline-flex;
		align-items: center;
		height: 32px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
		--trigger-bg: hsl(var(--white8));
		transition: opacity 0.15s ease;
	}

	.labels-trigger.has-labels {
		--trigger-bg: hsl(var(--white16));
	}

	.labels-trigger:active {
		opacity: 0.75;
	}

	.labels-trigger-body {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 32px;
		padding: 0 4px 0 10px;
		background: var(--trigger-bg);
		border-radius: 8px 0 0 8px;
		white-space: nowrap;
		transition: background 0.15s ease;
	}

	.trigger-count {
		font-size: 15px;
		font-weight: 600;
		color: hsl(var(--white16));
		transition: color 0.15s ease;
	}

	.labels-trigger.has-labels .trigger-count {
		color: hsl(var(--white66));
	}

	.trigger-text {
		font-size: 15px;
		font-weight: 500;
		color: hsl(var(--white33));
		transition: color 0.15s ease;
	}

	.labels-trigger.has-labels .trigger-text {
		color: hsl(var(--white));
	}

	.labels-trigger-tip {
		flex-shrink: 0;
		display: block;
	}

	/* Publish button */
	.publish-btn {
		height: 32px;
		padding: 0 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--gradient-blurple);
		border: none;
		border-radius: 8px;
		color: white;
		font-size: 15px;
		font-weight: 500;
		cursor: pointer;
		flex-shrink: 0;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}

	.publish-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.publish-btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.error-text {
		margin: 10px 0 2px;
		font-size: 13px;
		font-weight: 500;
		color: hsl(var(--destructive));
		background: hsl(var(--destructive) / 0.1);
		border-radius: 8px;
		padding: 8px 12px;
	}
</style>

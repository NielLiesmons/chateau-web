<script lang="js">
/**
 * TaskModal - Bottom sheet for creating a new task (kind 37060).
 * Title row: tappable TaskBox (32px, opens status suggestion menu) + title input.
 * Description area + action row (camera/emoji/gif/+/labels | priority).
 * Outside the black33 box: L-shape connector → assignees | Publish button.
 */
import { fly, fade } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import ShortTextInput from '$lib/components/common/ShortTextInput.svelte';
import EmojiPickerModal from '$lib/components/modals/EmojiPickerModal.svelte';
import ForumPostLabelsModal from '$lib/components/modals/ForumPostLabelsModal.svelte';
import TaskBox from '$lib/components/common/TaskBox.svelte';
import PriorityBox from '$lib/components/common/PriorityBox.svelte';
import ProfilePicStack from '$lib/components/common/ProfilePicStack.svelte';
import { Camera, EmojiFill, Plus } from '$lib/components/icons';
import { createSearchEmojisFunction } from '$lib/services/emoji-search';
import { createSearchProfilesFunction } from '$lib/services/profile-search';
import { queryEvent } from '$lib/nostr';
import { parseProfile } from '$lib/nostr/models';

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

const TASK_LABEL_SUGGESTIONS = [
	'Design', 'UX', 'Frontend', 'Backend', 'Server', 'Data Loading',
	'Publishing', 'Forum', 'Tasks', 'Wikis', 'Bug', 'Onboarding',
	'Docs', 'Marketing', 'Auth', 'Performance', 'Testing', 'Security'
];

/** @type {Array<{ value: 'backlog'|'open'|'inProgress'|'inReview'|'closed', label: string }>} */
const STATUS_OPTIONS = [
	{ value: 'backlog',    label: 'Backlog'     },
	{ value: 'open',       label: 'Open'        },
	{ value: 'inProgress', label: 'In Progress' },
	{ value: 'inReview',   label: 'In Review'   },
	{ value: 'closed',     label: 'Closed'      },
];

/** @type {'backlog' | 'open' | 'inProgress' | 'inReview' | 'closed'} */
let taskStatus = $state('open');

/** @type {'none' | 'low' | 'medium' | 'high' | 'urgent'} */
let taskPriority = $state('none');

const PRIORITY_OPTIONS = [
	{ value: 'none',   label: 'None'   },
	{ value: 'low',    label: 'Low'    },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high',   label: 'High'   },
	{ value: 'urgent', label: 'Urgent' },
];
let priorityMenuOpen = $state(false);
function togglePriorityMenu() { priorityMenuOpen = !priorityMenuOpen; }
function selectPriority(/** @type {string} */ val) {
	taskPriority = /** @type {any} */ (val);
	priorityMenuOpen = false;
}

let statusMenuOpen = $state(false);
function toggleStatusMenu() { statusMenuOpen = !statusMenuOpen; }
function selectStatus(/** @type {string} */ val) {
	taskStatus = /** @type {any} */ (val);
	statusMenuOpen = false;
}

let titleValue = $state('');
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
/** @type {{ pubkey: string; name?: string; pictureUrl?: string }[]} */
let assignees = $state([]);

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
		if (statusMenuOpen) { statusMenuOpen = false; return; }
		if (priorityMenuOpen) { priorityMenuOpen = false; return; }
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
			status: taskStatus,
			priority: taskPriority,
			text: serialized.text ?? '',
			emojiTags: serialized.emojiTags ?? [],
			mentions: serialized.mentions ?? [],
			labels: selectedLabels,
			assignees: assignees.map((a) => a.pubkey)
		});
		titleValue = '';
		taskStatus = 'open';
		contentInput?.clear?.();
		selectedLabels = [];
		assignees = [];
		close();
	} catch (err) {
		console.error('Failed to publish task:', err);
		error = /** @type {any} */ (err)?.message || 'Failed to publish';
	} finally {
		submitting = false;
	}
}

$effect(() => {
	if (isOpen) {
		const pubkey = getCurrentPubkey?.();
		if (pubkey) {
			// Immediately render with pubkey (ProfilePic shows fallback while loading)
			assignees = [{ pubkey }];
			// Enrich from local Dexie — no network needed for cached profiles
			queryEvent({ kinds: [0], authors: [pubkey], limit: 1 })
				.then((event) => {
					if (event) {
						const p = parseProfile(event);
						assignees = [{
							pubkey,
							name: p.name ?? p.displayName ?? '',
							pictureUrl: p.picture ?? undefined,
						}];
					}
				})
				.catch(() => {});
		}
		const t = setTimeout(() => titleInput?.focus(), 80);
		return () => clearTimeout(t);
	} else {
		titleValue = '';
		error = '';
		submitting = false;
		emojiPickerOpen = false;
		labelsModalOpen = false;
		statusMenuOpen = false;
		priorityMenuOpen = false;
		taskStatus = 'open';
		taskPriority = 'none';
		selectedLabels = [];
		assignees = [];
	}
});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay bg-overlay" onclick={close} role="presentation" transition:fade={{ duration: 180 }}></div>

	<div class="task-sheet-wrapper" role="dialog" aria-modal="true" aria-label="New task">
		<div
			class="task-sheet"
			class:child-modal-open={emojiPickerOpen || labelsModalOpen}
			transition:fly={{ y: 100, duration: 200, easing: cubicOut }}
		>
			<div class="child-overlay" aria-hidden="true"></div>

			<!-- ── Black33 form box ── -->
			<div class="post-form-box">

				<!-- Section 1: Status + title input + Priority (transparent, small) -->
				<div class="task-title-row">
					<div class="status-wrapper">
						<button
							type="button"
							class="task-box-btn"
							onclick={toggleStatusMenu}
							aria-label="Set task status: {taskStatus}"
							aria-haspopup="listbox"
							aria-expanded={statusMenuOpen}
						>
							<TaskBox state={taskStatus} size={24} />
						</button>

						{#if statusMenuOpen}
							<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
							<div class="status-menu-backdrop" onclick={() => (statusMenuOpen = false)} role="presentation"></div>
							<div
								class="status-menu"
								role="listbox"
								aria-label="Task status"
								transition:fly={{ y: -6, duration: 150, easing: cubicOut }}
							>
								{#each STATUS_OPTIONS as opt}
									<button
										type="button"
										class="status-option"
										class:active={taskStatus === opt.value}
										role="option"
										aria-selected={taskStatus === opt.value}
										onclick={() => selectStatus(opt.value)}
									>
										<TaskBox state={opt.value} size={18} />
										<span class="status-label">{opt.label}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<input
						type="text"
						class="task-title-input"
						placeholder="Title of Task"
						bind:value={titleValue}
						bind:this={titleInput}
						disabled={submitting}
						aria-label="Task title"
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); contentInput?.focus?.(); } }}
					/>

					<!-- Priority: dropdown menu like the status menu -->
					<div class="priority-wrapper">
						<button
							type="button"
							class="priority-btn"
							onclick={togglePriorityMenu}
							aria-label="Set task priority: {taskPriority}"
							aria-haspopup="listbox"
							aria-expanded={priorityMenuOpen}
						>
							<PriorityBox priority={taskPriority} size={22} />
						</button>

						{#if priorityMenuOpen}
							<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
							<div class="status-menu-backdrop" onclick={() => (priorityMenuOpen = false)} role="presentation"></div>
							<div
								class="status-menu priority-menu"
								role="listbox"
								aria-label="Task priority"
								transition:fly={{ y: -6, duration: 150, easing: cubicOut }}
							>
								{#each PRIORITY_OPTIONS as opt (opt.value)}
									<button
										type="button"
										class="status-option"
										class:active={taskPriority === opt.value}
										role="option"
										aria-selected={taskPriority === opt.value}
										onclick={() => selectPriority(opt.value)}
									>
										<PriorityBox priority={opt.value} size={18} />
										<span class="status-label">{opt.label}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<div class="post-form-divider"></div>

				<!-- Section 2: Description + media action row -->
				<div class="post-content-area">
					<ShortTextInput
						bind:this={contentInput}
						placeholder="Describe your task"
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
				</div>

				<div class="post-form-divider"></div>

				<!-- Section 3: Target + Assignees (left) | Publish (right) -->
				<div class="task-bottom-row">
					<button type="button" class="target-btn" onclick={() => {}} aria-label="Set target">
						<Plus variant="outline" size={13} strokeWidth={2.8} color="hsl(var(--white33))" />
						<span class="target-text">Target</span>
					</button>

				<ProfilePicStack
					profiles={assignees}
					size="sm"
					text={assignees.length === 1
						? (assignees[0].name || 'Me')
						: assignees.length > 1
						? `${assignees.length} people`
						: 'Assign'}
					onclick={() => {}}
				/>

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
	suggestions={TASK_LABEL_SUGGESTIONS}
	onclose={() => { labelsModalOpen = false; }}
/>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 49;
	}

	.task-sheet-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.task-sheet {
		width: 100%;
		max-width: 100%;
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
	}

	.task-sheet.child-modal-open {
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

	.task-sheet.child-modal-open .child-overlay {
		opacity: 1;
	}

	@media (min-width: 768px) {
		.task-sheet {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
			padding: 12px;
		}
	}

	/* ── Form box ── */
	.post-form-box {
		display: flex;
		flex-direction: column;
		background-color: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white33));
		border-radius: var(--radius-16);
		overflow: hidden;
	}

	/* ── Title row ── */
	.task-title-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
	}

	/* Status wrapper — position:relative so menu floats from here */
	.status-wrapper {
		position: relative;
		flex-shrink: 0;
	}

	.task-box-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.15s ease, opacity 0.15s ease;
	}

	.task-box-btn:hover {
		opacity: 0.8;
	}

	.task-box-btn:active {
		transform: scale(0.88);
	}

	/* Status selection menu — matches ShortTextInput suggestion-menu style */
	.status-menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 19;
	}

	.status-menu {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		z-index: 20;
		background: hsl(var(--gray));
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border: 0.33px solid hsl(var(--white33));
		border-radius: 12px;
		overflow: hidden;
		min-width: 160px;
	}

	.status-option {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		background: none;
		border: none;
		border-radius: 0;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s ease;
	}

	.status-option:not(:last-child) {
		border-bottom: 0.33px solid hsl(var(--white8));
	}

	.status-option:hover {
		background: hsl(var(--white4));
	}

	.status-option.active {
		background: none;
	}

	.status-label {
		font-size: 0.9375rem;
		font-weight: 500;
		color: hsl(var(--white66));
	}

	.status-option.active .status-label {
		color: hsl(var(--white));
		font-weight: 600;
	}

	/* Title input */
	.task-title-input {
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

	.task-title-input::placeholder {
		color: hsl(var(--white33));
		font-weight: 500;
	}

	.task-title-input:disabled {
		opacity: 0.6;
	}

	/* Divider */
	.post-form-divider {
		width: 100%;
		height: 1.4px;
		background-color: hsl(var(--white8));
		flex-shrink: 0;
	}

	/* Description area */
	.post-content-area {
		min-height: 100px;
	}

	/* Priority icon button — transparent wrapper, PriorityBox inside */
	.priority-btn {
		background: none;
		border: none;
		padding: 2px;
		cursor: pointer;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}

	.priority-btn:hover {
		opacity: 0.8;
	}

	.priority-btn:active {
		transform: scale(0.9);
	}

	/* Priority wrapper — position:relative so menu floats from here */
	.priority-wrapper {
		position: relative;
		flex-shrink: 0;
	}

	/* Priority menu: opens downward like status menu, right-aligned */
	.priority-menu {
		top: calc(100% + 8px);
		bottom: auto;
		left: auto;
		right: 0;
	}

	.priority-menu .status-option.active .status-label {
		font-weight: 500;
	}

	/* Action row — media + labels buttons only, no Publish here */
	.post-action-row {
		display: flex;
		align-items: center;
		padding: 0 12px 12px 12px;
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

	/* Labels trigger (identical to ForumPostModal) */
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

	/* ── Bottom row: Target + Assignees (left) | Publish (right) ── */
	.task-bottom-row {
		display: flex;
		align-items: center;
		padding: 10px 12px;
		gap: 10px;
	}

	/* Target button — same bg/radius as action-btn row above */
	.target-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 28px;
		padding: 0 10px 0 8px;
		background: hsl(var(--white8));
		border: none;
		border-radius: 8px;
		cursor: pointer;
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	.target-btn:active {
		transform: scale(0.97);
	}

	.target-text {
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--white33));
	}

	/* Publish button — exact match of ForumPostModal's .next-btn */
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
		margin-left: auto;
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

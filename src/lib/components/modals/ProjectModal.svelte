<script lang="js">
// @ts-nocheck
/**
 * ProjectModal – bottom sheet for creating Projects (kind:30315).
 *
 * Layout:
 *   form-box:
 *     Title row:   ProjectBox (open/closed picker, 24px) | title input
 *     ──────────────────────────────────────────────
 *     Content area (ShortTextInput)
 *     Action row:  camera | emoji | + | [◇+ / N Milestones] [N Labels →]
 *     ──────────────────────────────────────────────  (only when has milestones)
 *     Milestone chips row
 *     ──────────────────────────────────────────────
 *     Bottom row:  Target btn | Publish btn
 *
 * Milestone sub-sheet: slides up over the parent (like Labels/Emoji modals).
 * Shows a simple editable list – add/edit/remove all in one place, no extra layers.
 *
 * onsubmit receives:
 *   { type, title, slug, text, emojiTags, mentions, labels, status, pendingMilestones }
 */
import { fly, fade } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import ShortTextInput from '$lib/components/common/ShortTextInput.svelte';
import EmojiPickerModal from '$lib/components/modals/EmojiPickerModal.svelte';
import ForumPostLabelsModal from '$lib/components/modals/ForumPostLabelsModal.svelte';
import ProjectBox from '$lib/components/common/ProjectBox.svelte';
import MilestoneBox from '$lib/components/common/MilestoneBox.svelte';
import PriorityBox from '$lib/components/common/PriorityBox.svelte';
import { Camera, EmojiFill, Plus } from '$lib/components/icons';
import { Calendar } from 'lucide-svelte';
import { createSearchEmojisFunction } from '$lib/services/emoji-search';
import { createSearchProfilesFunction } from '$lib/services/profile-search';

const PROJECT_LABEL_SUGGESTIONS = [
	'Design', 'Frontend', 'Backend', 'Mobile', 'Infrastructure', 'Research',
	'Marketing', 'Docs', 'Security', 'Testing', 'Nostr', 'Open Source'
];

/** Only two manual states – intermediate progress is computed from milestones */
const STATUS_OPTIONS = [
	{ value: 'open',   label: 'Open',   pct: 0   },
	{ value: 'closed', label: 'Closed', pct: 100 },
];

const STATUS_PCT = { open: 0, closed: 100 };

const PRIORITY_OPTIONS = [
	{ value: 'none',   label: 'None'   },
	{ value: 'low',    label: 'Low'    },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high',   label: 'High'   },
	{ value: 'urgent', label: 'Urgent' },
];

/** Milestone status cycle: open → in-progress → in-review → closed → open */
const MS_STATUS_CYCLE = ['open', 'in-progress', 'in-review', 'closed'];
const MS_STATUS_PCT   = { 'open': 0, 'in-progress': 40, 'in-review': 75, 'closed': 100 };

let {
	isOpen = $bindable(false),
	communityName: _communityName = '',
	getCurrentPubkey = () => null,
	searchProfiles: searchProfilesProp = null,
	searchEmojis: searchEmojisProp = null,
	/** @type {{ title?: string, slug?: string, summary?: string, text?: string, labels?: string[], status?: string, priority?: string }|null} */
	initialData = null,
	onsubmit,
	onclose
} = $props();

const searchProfiles = $derived(searchProfilesProp ?? createSearchProfilesFunction(getCurrentPubkey));
const searchEmojis   = $derived(searchEmojisProp   ?? createSearchEmojisFunction(getCurrentPubkey));

let projectStatus      = $state('open');
let statusMenuOpen     = $state(false);
/** @type {'none' | 'low' | 'medium' | 'high' | 'urgent'} */
let projectPriority    = $state('none');
let priorityMenuOpen   = $state(false);
let titleValue         = $state('');
let summaryValue       = $state('');
/** @type {import('$lib/components/common/ShortTextInput.svelte').default|null} */
let contentInput       = $state(null);
/** @type {HTMLInputElement|null} */
let titleInput         = $state(null);
let submitting         = $state(false);
let error              = $state('');
let emojiPickerOpen    = $state(false);
let labelsModalOpen    = $state(false);
let milestoneSheetOpen = $state(false);

/** @type {string[]} */
let selectedLabels = $state([]);

/**
 * @type {{ title: string; due?: string; status?: string; content?: string }[]}
 * `due` is stored as YYYY-MM-DD string; converted to Unix timestamp on submit.
 * `status` cycles: 'open' | 'in-progress' | 'in-review' | 'closed'
 */
let pendingMilestones = $state([]);

/** New-milestone add row input inside the sub-sheet */
let newMsTitle = $state('');
/** Which milestone row has its content area expanded (index or null) */
let expandedMsIdx = $state(/** @type {number|null} */ (null));
/** @type {HTMLInputElement|null} */
let newMsInput = $state(null);
/** ISO date string for the project start date (YYYY-MM-DD) */
let startDate = $state('');
/** @type {HTMLInputElement|null} */
let startDateInput = $state(null);
/** ISO date string for the project due date (YYYY-MM-DD) */
let dueDate = $state('');
/** @type {HTMLInputElement|null} */
let dueDateInput = $state(null);
/** Whether the From→To date picker dropdown is open */
let datePickerOpen = $state(false);

const statusPct = $derived(STATUS_PCT[projectStatus] ?? 0);

function close() { isOpen = false; onclose?.(); }

function handleKeydown(/** @type {KeyboardEvent} */ e) {
	if (e.key === 'Escape') {
		if (milestoneSheetOpen) { milestoneSheetOpen = false; return; }
		if (statusMenuOpen)     { statusMenuOpen = false;     return; }
		if (priorityMenuOpen)   { priorityMenuOpen = false;   return; }
		if (datePickerOpen)     { datePickerOpen = false;     return; }
		close();
	}
}

function togglePriorityMenu() { priorityMenuOpen = !priorityMenuOpen; }
function selectPriority(/** @type {string} */ val) {
	projectPriority = /** @type {any} */ (val);
	priorityMenuOpen = false;
}

/** Format YYYY-MM-DD to short "Mar 5" label */
function fmtDate(iso) {
	if (!iso) return '';
	const d = new Date(iso + 'T00:00:00');
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Cycle milestone status to next state in the ring */
function cycleMilestoneStatus(idx) {
	const cur = pendingMilestones[idx].status ?? 'open';
	const curIdx = MS_STATUS_CYCLE.indexOf(cur);
	const next = MS_STATUS_CYCLE[(curIdx + 1) % MS_STATUS_CYCLE.length];
	pendingMilestones = pendingMilestones.map((ms, i) => i === idx ? { ...ms, status: next } : ms);
}

function handleEmojiSelect(emoji) {
	contentInput?.insertEmoji?.(emoji.shortcode, emoji.url, emoji.source);
	contentInput?.focus?.();
}

function addMilestone() {
	if (!newMsTitle.trim()) return;
	pendingMilestones = [...pendingMilestones, { title: newMsTitle.trim(), status: 'open' }];
	newMsTitle = '';
	setTimeout(() => newMsInput?.focus(), 20);
}

function removeMilestone(idx) {
	pendingMilestones = pendingMilestones.filter((_, i) => i !== idx);
}

async function handlePublish() {
	if (!titleValue.trim() || submitting) return;
	submitting = true;
	error = '';
	try {
		const serialized = contentInput?.getSerializedContent?.() ?? { text: '', emojiTags: [], mentions: [] };
		const slug = titleValue.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
		await onsubmit?.({
			type: 'project',
			title: titleValue.trim(),
			slug,
			summary: summaryValue.trim(),
			text: serialized.text ?? '',
			emojiTags: serialized.emojiTags ?? [],
			mentions: serialized.mentions ?? [],
			labels: selectedLabels,
			status: projectStatus,
			priority: projectPriority,
			startDate: startDate || '',
			dueDate: dueDate || '',
			pendingMilestones,
			dTag: initialData?.slug ?? ''
		});
		resetForm();
		close();
	} catch (err) {
		console.error('[ProjectModal] publish failed:', err);
		error = err?.message || 'Failed to publish';
	} finally {
		submitting = false;
	}
}

function resetForm() {
	titleValue         = '';
	summaryValue       = '';
	projectStatus      = 'open';
	projectPriority    = 'none';
	selectedLabels     = [];
	pendingMilestones  = [];
	newMsTitle         = '';
	startDate          = '';
	dueDate            = '';
	datePickerOpen     = false;
	expandedMsIdx      = null;
	error              = '';
	contentInput?.clear?.();
}

$effect(() => {
	if (isOpen) {
		if (initialData) {
			titleValue       = initialData.title     ?? '';
			summaryValue     = initialData.summary   ?? '';
			projectStatus    = initialData.status    ?? 'open';
			projectPriority  = /** @type {any} */ (initialData.priority  ?? 'none');
			startDate        = initialData.startDate ?? '';
			dueDate          = initialData.dueDate   ?? '';
			selectedLabels   = initialData.labels    ?? [];
			const t = setTimeout(() => {
				if (initialData.text) contentInput?.setTextContent?.(initialData.text);
				titleInput?.focus();
			}, 120);
			return () => clearTimeout(t);
		} else {
			const t = setTimeout(() => titleInput?.focus(), 80);
			return () => clearTimeout(t);
		}
	} else {
		resetForm();
		statusMenuOpen     = false;
		priorityMenuOpen   = false;
		datePickerOpen     = false;
		milestoneSheetOpen = false;
		emojiPickerOpen    = false;
		labelsModalOpen    = false;
	}
});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay bg-overlay" onclick={close} role="presentation" transition:fade={{ duration: 180 }}></div>

	<div class="project-sheet-wrapper" role="dialog" aria-modal="true" aria-label="New project">
		<div
			class="project-sheet"
			class:child-modal-open={emojiPickerOpen || labelsModalOpen || milestoneSheetOpen}
			transition:fly={{ y: 100, duration: 200, easing: cubicOut }}
		>
			<div class="child-overlay" aria-hidden="true"></div>

			<!-- ── Black33 form box ─────────────────────────────────────── -->
			<div class="post-form-box">

				<!-- Section 1: Status + title input -->
				<div class="task-title-row">
					<div class="status-wrapper">
						<button
							type="button"
							class="task-box-btn"
							onclick={() => { statusMenuOpen = !statusMenuOpen; }}
							aria-label="Set project status"
							aria-haspopup="listbox"
							aria-expanded={statusMenuOpen}
						>
							<ProjectBox percentage={statusPct} size={24} />
						</button>

						{#if statusMenuOpen}
							<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
							<div class="status-menu-backdrop" onclick={() => (statusMenuOpen = false)} role="presentation"></div>
							<div
								class="status-menu"
								role="listbox"
								aria-label="Project status"
								transition:fly={{ y: -6, duration: 150, easing: cubicOut }}
							>
								{#each STATUS_OPTIONS as opt}
									<button
										type="button"
										class="status-option"
										class:active={projectStatus === opt.value}
										role="option"
										aria-selected={projectStatus === opt.value}
										onclick={() => { projectStatus = opt.value; statusMenuOpen = false; }}
									>
										<ProjectBox percentage={opt.pct} size={18} />
										<span class="status-label">{opt.label}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

				<input
					type="text"
					class="task-title-input"
					placeholder="Project title"
					bind:value={titleValue}
					bind:this={titleInput}
					disabled={submitting}
					aria-label="Project title"
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); contentInput?.focus?.(); } }}
				/>

				<!-- Priority: dropdown menu like the status menu -->
				<div class="priority-wrapper">
					<button
						type="button"
						class="priority-btn"
						onclick={togglePriorityMenu}
						aria-label="Set project priority: {projectPriority}"
						aria-haspopup="listbox"
						aria-expanded={priorityMenuOpen}
					>
						<PriorityBox priority={projectPriority} size={22} />
					</button>

					{#if priorityMenuOpen}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div class="status-menu-backdrop" onclick={() => (priorityMenuOpen = false)} role="presentation"></div>
						<div
							class="status-menu priority-menu"
							role="listbox"
							aria-label="Project priority"
							transition:fly={{ y: -6, duration: 150, easing: cubicOut }}
						>
							{#each PRIORITY_OPTIONS as opt (opt.value)}
								<button
									type="button"
									class="status-option"
									class:active={projectPriority === opt.value}
									role="option"
									aria-selected={projectPriority === opt.value}
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

				<!-- Section 1b: Summary -->
				<input
					type="text"
					class="project-summary-input"
					placeholder="Short summary (optional)"
					bind:value={summaryValue}
					disabled={submitting}
					aria-label="Project summary"
				/>

				<div class="post-form-divider"></div>

				<!-- Section 2: Description -->
				<div class="post-content-area">
					<ShortTextInput
						bind:this={contentInput}
						placeholder="Describe the project…"
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

				<!-- Action row -->
				<div class="post-action-row">
					<div class="action-buttons-left">
						<button type="button" class="action-btn" aria-label="Add photo" onclick={() => {}}>
							<Camera variant="fill" color="hsl(var(--white33))" size={20} />
						</button>
						<button type="button" class="action-btn" aria-label="Add emoji" onclick={() => { emojiPickerOpen = true; }}>
							<EmojiFill variant="fill" color="hsl(var(--white33))" size={18} />
						</button>
						<button type="button" class="action-btn" aria-label="Add attachment" onclick={() => {}}>
							<Plus variant="outline" color="hsl(var(--white33))" size={16} strokeWidth={2.8} />
						</button>

					<!-- Labels trigger -->
						<button
							type="button"
							class="labels-trigger"
							class:has-labels={selectedLabels.length > 0}
							onclick={() => { labelsModalOpen = true; }}
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

				<!-- Milestone chips (shown only when there are milestones) -->
				{#if pendingMilestones.length > 0}
					<div class="post-form-divider"></div>
					<div class="milestones-row">
						{#each pendingMilestones as ms, i}
							<div class="ms-chip">
								<MilestoneBox percentage={0} size={12} />
								<span class="ms-chip-title">{ms.title}</span>
								<button
									type="button"
									class="ms-chip-remove"
									onclick={() => removeMilestone(i)}
									aria-label="Remove milestone"
								>×</button>
							</div>
						{/each}
					</div>
				{/if}

				<div class="post-form-divider"></div>

			<!-- Section 4: Target | Milestones | Period | Publish -->
			<div class="task-bottom-row">
				<button type="button" class="target-btn" onclick={() => {}} aria-label="Set target">
					<Plus variant="outline" size={13} strokeWidth={2.8} color="hsl(var(--white33))" />
					<span class="target-text">Target</span>
				</button>

				<!-- Milestones button -->
				<button
					type="button"
					class="target-btn ms-bottom-btn"
					class:has-milestones={pendingMilestones.length > 0}
					onclick={() => { milestoneSheetOpen = true; }}
					aria-label={pendingMilestones.length === 0 ? 'Add milestones' : 'Edit milestones'}
				>
					{#if pendingMilestones.length === 0}
						<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
							<path d="M 8.85,1.85 L 14.15,7.15 Q 15,8 14.15,8.85 L 8.85,14.15 Q 8,15 7.15,14.15 L 1.85,8.85 Q 1,8 1.85,7.15 L 7.15,1.85 Q 8,1 8.85,1.85 Z" stroke="hsl(var(--white33))" stroke-width="1.4" fill="none" />
							<path d="M 8,5.5 L 8,10.5 M 5.5,8 L 10.5,8" stroke="hsl(var(--white33))" stroke-width="1.3" stroke-linecap="round" />
						</svg>
						<span class="target-text">Milestones</span>
					{:else}
						<MilestoneBox percentage={0} size={13} />
						<span class="target-text ms-count-text">{pendingMilestones.length} Milestone{pendingMilestones.length === 1 ? '' : 's'}</span>
					{/if}
				</button>

				<!-- From → To date range button -->
				<div class="period-wrapper">
					<!-- Hidden native inputs -->
					<input type="date" class="due-date-native" bind:value={startDate} bind:this={startDateInput} aria-label="Start date" />
					<input type="date" class="due-date-native" bind:value={dueDate}   bind:this={dueDateInput}   aria-label="Due date"   />

					<button
						type="button"
						class="target-btn period-btn"
						class:has-dates={!!(startDate || dueDate)}
						onclick={() => { datePickerOpen = !datePickerOpen; }}
						aria-label="Set project period"
					>
						<Calendar size={13} color={startDate || dueDate ? 'hsl(var(--white66))' : 'hsl(var(--white33))'} strokeWidth={1.8} />
						{#if startDate || dueDate}
							<span class="target-text period-text">
								{startDate ? fmtDate(startDate) : '…'} → {dueDate ? fmtDate(dueDate) : '…'}
							</span>
						{:else}
							<span class="target-text">Period</span>
						{/if}
					</button>

					{#if datePickerOpen}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div class="status-menu-backdrop" onclick={() => (datePickerOpen = false)} role="presentation"></div>
						<div
							class="period-dropdown"
							transition:fly={{ y: 6, duration: 150, easing: cubicOut }}
						>
							<div class="period-row">
								<span class="period-label">From</span>
								<input
									type="date"
									class="period-input"
									bind:value={startDate}
									aria-label="Start date"
								/>
							</div>
							<div class="period-row">
								<span class="period-label">To</span>
								<input
									type="date"
									class="period-input"
									bind:value={dueDate}
									aria-label="Due date"
								/>
							</div>
						</div>
					{/if}
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

<!-- ── Milestone sub-sheet ───────────────────────────────────────────────── -->
<!-- Slides up over the parent (parent scales via child-modal-open).         -->
<!-- Simple list UI: edit all milestones in one place, no extra layers.       -->
{#if milestoneSheetOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="ms-sheet-backdrop"
		onclick={() => { milestoneSheetOpen = false; newMsTitle = ''; }}
		role="presentation"
		transition:fade={{ duration: 120 }}
	></div>

	<div
		class="ms-sheet"
		role="dialog"
		aria-modal="true"
		aria-label="Milestones"
		transition:fly={{ y: 100, duration: 200, easing: cubicOut }}
	>
		<div class="ms-sheet-inner">
			<div class="ms-form-box">

			<!-- Existing milestone rows -->
			{#each pendingMilestones as ms, i}
				{@const msPct = MS_STATUS_PCT[ms.status ?? 'open'] ?? 0}
				{@const isExpanded = expandedMsIdx === i}
				<div class="ms-edit-row">
					<button
						type="button"
						class="ms-status-btn"
						onclick={() => cycleMilestoneStatus(i)}
						aria-label="Cycle milestone status: {ms.status ?? 'open'}"
						title="Status: {ms.status ?? 'open'} — click to cycle"
					>
						<MilestoneBox percentage={msPct} size={20} />
					</button>
					<input
						type="text"
						class="ms-edit-input"
						bind:value={pendingMilestones[i].title}
						placeholder="Milestone title"
						aria-label="Milestone title"
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); newMsInput?.focus(); } }}
					/>
					<!-- Hidden native date input -->
					<input
						type="date"
						id="ms-due-{i}"
						class="due-date-native"
						bind:value={pendingMilestones[i].due}
						aria-label="Milestone due date"
					/>
					<button
						type="button"
						class="calendar-btn ms-cal-btn"
						class:has-date={!!ms.due}
						onclick={() => document.getElementById(`ms-due-${i}`)?.showPicker?.()}
						aria-label={ms.due ? `Due ${ms.due}` : 'Set milestone due date'}
					>
						<Calendar size={14} color={ms.due ? 'hsl(var(--white66))' : 'hsl(var(--white33))'} strokeWidth={1.8} />
					</button>
					<button
						type="button"
						class="ms-expand-btn"
						class:is-expanded={isExpanded}
						onclick={() => { expandedMsIdx = isExpanded ? null : i; }}
						aria-label={isExpanded ? 'Collapse milestone details' : 'Expand milestone details'}
					>
						<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
							<path d="M2 4L6 8L10 4" stroke="hsl(var(--white33))" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
					<button
						type="button"
						class="ms-remove-btn"
						onclick={() => removeMilestone(i)}
						aria-label="Remove milestone"
					>×</button>
				</div>
				{#if isExpanded}
					<textarea
						class="ms-content-input"
						bind:value={pendingMilestones[i].content}
						placeholder="Milestone description, goals, acceptance criteria…"
						aria-label="Milestone description"
						rows="3"
					></textarea>
				{/if}
				<div class="ms-row-divider"></div>
			{/each}

				<!-- Add-new row -->
				<div class="ms-edit-row ms-add-row">
					<MilestoneBox percentage={0} size={20} />
					<input
						type="text"
						class="ms-edit-input ms-add-input"
						bind:value={newMsTitle}
						bind:this={newMsInput}
						placeholder="Add a milestone…"
						aria-label="New milestone title"
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMilestone(); } }}
					/>
					{#if newMsTitle.trim()}
						<button
							type="button"
							class="ms-confirm-btn"
							onclick={addMilestone}
							aria-label="Add milestone"
						>+</button>
					{/if}
				</div>
			</div>

			<div class="ms-sheet-footer">
				<button
					type="button"
					class="ms-done-btn"
					onclick={() => { milestoneSheetOpen = false; newMsTitle = ''; }}
				>Done</button>
			</div>
		</div>
	</div>
{/if}

<!-- Emoji picker -->
<EmojiPickerModal
	bind:isOpen={emojiPickerOpen}
	{getCurrentPubkey}
	onSelectEmoji={handleEmojiSelect}
	onclose={() => { emojiPickerOpen = false; }}
/>

<!-- Labels picker -->
<ForumPostLabelsModal
	bind:isOpen={labelsModalOpen}
	bind:selectedLabels
	suggestions={PROJECT_LABEL_SUGGESTIONS}
	onclose={() => { labelsModalOpen = false; }}
/>

<style>
/* ── Overlay ── */
.overlay {
	position: fixed;
	inset: 0;
	z-index: 49;
}

/* ── Sheet wrapper ── */
.project-sheet-wrapper {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 50;
	display: flex;
	justify-content: center;
	pointer-events: none;
}

.project-sheet {
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

.project-sheet.child-modal-open {
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

.project-sheet.child-modal-open .child-overlay {
	opacity: 1;
}

@media (min-width: 768px) {
	.project-sheet {
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

.task-box-btn:hover  { opacity: 0.8; }
.task-box-btn:active { transform: scale(0.88); }

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
	min-width: 140px;
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

.status-option:not(:last-child) { border-bottom: 0.33px solid hsl(var(--white8)); }
.status-option:hover             { background: hsl(var(--white4)); }

.status-label {
	font-size: 0.9375rem;
	font-weight: 500;
	color: hsl(var(--white66));
}

.status-option.active .status-label {
	color: hsl(var(--white));
	font-weight: 600;
}

/* ── Title input ── */
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
}

.task-title-input::placeholder { color: hsl(var(--white33)); font-weight: 500; }
.task-title-input:disabled      { opacity: 0.6; }

/* ── Divider ── */
.post-form-divider {
	width: 100%;
	height: 1.4px;
	background-color: hsl(var(--white8));
	flex-shrink: 0;
}

/* ── Content area ── */
.post-content-area { min-height: 100px; }

/* ── Action row ── */
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

.action-btn:active { transform: scale(0.97); }

/* ── Summary input ── */
.project-summary-input {
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

.project-summary-input::placeholder {
	color: hsl(var(--white33));
}

.project-summary-input:disabled {
	opacity: 0.6;
}

/* ── Calendar button (in title row) ── */
.due-date-native {
	position: absolute;
	opacity: 0;
	pointer-events: none;
	width: 0;
	height: 0;
}

.calendar-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	background: none;
	border: none;
	padding: 4px;
	cursor: pointer;
	flex-shrink: 0;
	border-radius: 6px;
	transition: background 0.15s;
}

.calendar-btn:hover              { background: hsl(var(--white8)); }
.calendar-btn:active             { transform: scale(0.9); }


/* ── Labels trigger ── */
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

.labels-trigger.has-labels { --trigger-bg: hsl(var(--white16)); }
.labels-trigger:active      { opacity: 0.75; }

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
	color: hsl(var(--white66));
}

.labels-trigger:not(.has-labels) .trigger-count { color: hsl(var(--white16)); }

.trigger-text {
	font-size: 15px;
	font-weight: 500;
	color: hsl(var(--white33));
}

.labels-trigger.has-labels .trigger-text  { color: hsl(var(--white)); }

.labels-trigger-tip { flex-shrink: 0; display: block; }

/* ── Milestone chips row ── */
.milestones-row {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 5px 12px;
	overflow-x: auto;
	scrollbar-width: none;
	-webkit-overflow-scrolling: touch;
}

.milestones-row::-webkit-scrollbar { display: none; }

.ms-chip {
	display: flex;
	align-items: center;
	gap: 5px;
	height: 24px;
	padding: 0 6px 0 7px;
	background: hsl(var(--white11));
	border: 0.33px solid hsl(var(--white16));
	border-radius: 6px;
	flex-shrink: 0;
}

.ms-chip-title {
	font-size: 12px;
	font-weight: 500;
	color: hsl(var(--white66));
	max-width: 100px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.ms-chip-remove {
	background: none;
	border: none;
	padding: 0 0 0 2px;
	cursor: pointer;
	font-size: 14px;
	line-height: 1;
	color: hsl(var(--white33));
	display: flex;
	align-items: center;
	transition: color 0.15s;
}

.ms-chip-remove:hover { color: hsl(var(--white)); }

/* ── Bottom row ── */
.task-bottom-row {
	display: flex;
	align-items: center;
	padding: 10px 12px;
	gap: 10px;
}

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

.target-btn:active { transform: scale(0.97); }

.target-text {
	font-size: 14px;
	font-weight: 500;
	color: hsl(var(--white33));
}

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

.publish-btn:disabled              { opacity: 0.5; cursor: not-allowed; }
.publish-btn:active:not(:disabled) { transform: scale(0.97); }

/* Milestone button in bottom row */
.ms-bottom-btn.has-milestones .target-text { color: hsl(var(--white66)); }

.ms-count-text { color: hsl(var(--white66)); }

/* Period (date range) button + dropdown */
.period-wrapper {
	position: relative;
	flex-shrink: 0;
}

.period-btn.has-dates .target-text { color: hsl(var(--white66)); }
.period-text { white-space: nowrap; }

.period-dropdown {
	position: absolute;
	bottom: calc(100% + 8px);
	left: 0;
	background: hsl(var(--black33));
	border: 0.33px solid hsl(var(--white16));
	border-radius: 12px;
	padding: 10px 12px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	z-index: 10;
	min-width: 200px;
	backdrop-filter: blur(24px);
	-webkit-backdrop-filter: blur(24px);
}

.period-row {
	display: flex;
	align-items: center;
	gap: 10px;
}

.period-label {
	font-size: 12px;
	font-weight: 600;
	letter-spacing: 0.05em;
	text-transform: uppercase;
	color: hsl(var(--white33));
	width: 28px;
	flex-shrink: 0;
}

.period-input {
	flex: 1;
	min-width: 0;
	background: hsl(var(--white8));
	border: none;
	border-radius: 6px;
	padding: 5px 8px;
	font-size: 13px;
	font-weight: 500;
	color: hsl(var(--white));
	font-family: 'Inter', sans-serif;
	cursor: pointer;
	outline: none;
	color-scheme: dark;
}
.period-input:focus { outline: 1px solid hsl(var(--blurpleColor) / 0.5); }

/* ── Error ── */
.error-text {
	margin: 10px 0 2px;
	font-size: 13px;
	font-weight: 500;
	color: hsl(var(--destructive));
	background: hsl(var(--destructive) / 0.1);
	border-radius: 8px;
	padding: 8px 12px;
}

/* ═══════════════════════════════════════════════════════════════════
   MILESTONE SUB-SHEET
   Simple editable list – no extra layers inside.
   Slides up over the parent (parent scales via child-modal-open).
═══════════════════════════════════════════════════════════════════ */
.ms-sheet-backdrop {
	position: fixed;
	inset: 0;
	z-index: 58;
}

.ms-sheet {
	position: fixed;
	bottom: 0;
	left: 0;
	right: 0;
	z-index: 59;
	display: flex;
	justify-content: center;
	pointer-events: none;
}

.ms-sheet-inner {
	width: 100%;
	max-width: 100%;
	background: hsl(var(--gray66));
	border-radius: var(--radius-32) var(--radius-32) 0 0;
	border: 0.33px solid hsl(var(--white8));
	border-bottom: none;
	padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
	backdrop-filter: blur(24px);
	-webkit-backdrop-filter: blur(24px);
	pointer-events: auto;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

@media (min-width: 768px) {
	.ms-sheet { pointer-events: none; }
	.ms-sheet-inner {
		max-width: 560px;
		margin-bottom: 16px;
		border-radius: 24px;
		border-bottom: 0.33px solid hsl(var(--white8));
		padding: 12px;
	}
}

/* List form box */
.ms-form-box {
	display: flex;
	flex-direction: column;
	background-color: hsl(var(--black33));
	border: 0.33px solid hsl(var(--white33));
	border-radius: var(--radius-16);
	overflow: hidden;
}

.ms-edit-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
}

.ms-row-divider {
	width: 100%;
	height: 1px;
	background: hsl(var(--white8));
}

.ms-add-row { opacity: 0.65; }
.ms-add-row:focus-within { opacity: 1; }

.ms-edit-input {
	flex: 1;
	min-width: 0;
	padding: 0;
	background: transparent;
	border: none;
	outline: none;
	color: hsl(var(--white));
	font-family: 'Inter', sans-serif;
	font-size: 16px;
	font-weight: 500;
	caret-color: hsl(var(--blurpleColor));
}

.ms-edit-input::placeholder { color: hsl(var(--white33)); }

.ms-add-input::placeholder { font-style: italic; }

.ms-remove-btn {
	background: none;
	border: none;
	padding: 0 2px;
	cursor: pointer;
	font-size: 18px;
	line-height: 1;
	color: hsl(var(--white33));
	display: flex;
	align-items: center;
	transition: color 0.15s;
	flex-shrink: 0;
}

.ms-remove-btn:hover { color: hsl(var(--white)); }

.ms-confirm-btn {
	background: none;
	border: none;
	padding: 0 2px;
	cursor: pointer;
	font-size: 20px;
	font-weight: 600;
	line-height: 1;
	color: hsl(var(--blurpleColor));
	display: flex;
	align-items: center;
	transition: color 0.15s, transform 0.15s;
	flex-shrink: 0;
}

.ms-confirm-btn:active { transform: scale(0.88); }

/* Footer */
.ms-sheet-footer {
	display: flex;
	justify-content: flex-end;
}

.ms-done-btn {
	height: 32px;
	padding: 0 20px;
	background: var(--gradient-blurple);
	border: none;
	border-radius: 8px;
	color: white;
	font-size: 14px;
	font-weight: 500;
	cursor: pointer;
	transition: opacity 0.15s, transform 0.15s;
}

.ms-done-btn:active { transform: scale(0.97); }

/* ── Priority button (title row, right of status) ── */
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
.priority-btn:hover  { opacity: 0.8; }
.priority-btn:active { transform: scale(0.9); }

.priority-wrapper {
	position: relative;
	flex-shrink: 0;
}

.priority-menu {
	top: calc(100% + 8px);
	bottom: auto;
	left: auto;
	right: 0;
}
.priority-menu .status-option.active .status-label { font-weight: 500; }

/* ── Milestone sub-sheet: status cycling button ── */
.ms-status-btn {
	background: none;
	border: none;
	padding: 0;
	cursor: pointer;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	transition: opacity 0.15s, transform 0.15s;
}
.ms-status-btn:hover  { opacity: 0.8; }
.ms-status-btn:active { transform: scale(0.88); }

/* ── Milestone calendar button (inline, smaller) ── */
.ms-cal-btn {
	width: 24px;
	height: 24px;
	padding: 0;
}

/* ── Milestone expand toggle ── */
.ms-expand-btn {
	background: none;
	border: none;
	padding: 2px;
	cursor: pointer;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: transform 0.2s ease, opacity 0.15s;
	opacity: 0.6;
}
.ms-expand-btn:hover   { opacity: 1; }
.ms-expand-btn.is-expanded { transform: rotate(180deg); opacity: 1; }

/* ── Milestone content textarea (expands below the row) ── */
.ms-content-input {
	width: 100%;
	min-height: 64px;
	padding: 8px 12px 10px 42px;
	background: transparent;
	border: none;
	outline: none;
	resize: vertical;
	color: hsl(var(--white));
	font-family: 'Inter', sans-serif;
	font-size: 14px;
	font-weight: 400;
	line-height: 1.5;
	caret-color: hsl(var(--blurpleColor));
	box-sizing: border-box;
}
.ms-content-input::placeholder { color: hsl(var(--white33)); }
</style>

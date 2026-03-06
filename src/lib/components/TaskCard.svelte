<script>
/**
 * TaskCard — feed card for a kind:37060 task event.
 *
 * Row 1: TaskBox (status, 24px) | title (clamped to 2 lines) | PriorityBox (22px) | timestamp
 * Row 2: L-shape connector from bottom-center of the TaskBox above
 *         → optional targets container (28px high, shown when targets.length > 0)
 *         → ProfilePicStack (creator + assignees + commenters)
 *
 * The L-shape aligns with the horizontal center of the TaskBox (12px from the
 * left edge of the card's padded content, because TaskBox is 24px wide).
 */
import TaskBox from '$lib/components/common/TaskBox.svelte';
import PriorityBox from '$lib/components/common/PriorityBox.svelte';
import ProfilePicStack from '$lib/components/common/ProfilePicStack.svelte';
import LabelStack from '$lib/components/common/LabelStack.svelte';

let {
	title = '',
	/** @type {'backlog'|'open'|'inProgress'|'inReview'|'closed'} */
	status = 'open',
	/** @type {'none'|'low'|'medium'|'high'|'urgent'} */
	priority = 'none',
	/** @type {{ pubkey: string; name?: string; pictureUrl?: string }|null} */
	author = null,
	/** @type {{ pubkey: string; name?: string; pictureUrl?: string }[]} */
	assignees = [],
	/** @type {{ pubkey: string; name?: string; pictureUrl?: string }[]} */
	commenters = [],
	/** @type {{ id: string; label: string }[]} */
	targets = [],
	/** @type {string[]} */
	labels = [],
	/** @type {() => void} */
	onClick = () => {},
} = $props();

// Merge creator → assignees → commenters, deduplicated (full list for text; capped at 4 for pics).
const allStackPeople = $derived((() => {
	const seen = new Set();
	/** @type {{ pubkey: string; name?: string; pictureUrl?: string }[]} */
	const merged = [];
	for (const p of [author, ...assignees, ...commenters]) {
		if (p && !seen.has(p.pubkey)) {
			seen.add(p.pubkey);
			merged.push(p);
		}
	}
	return merged;
})());

const stackProfiles = $derived(allStackPeople.slice(0, 4));

// "Name", "Name & Name", or "Name & N Others" across all unique people in the stack.
const stackText = $derived((() => {
	const n = allStackPeople.length;
	if (n === 0) return '';
	const a = allStackPeople[0].name || allStackPeople[0].pubkey.slice(0, 8) + '…';
	if (n === 1) return a;
	if (n === 2) return `${a} & ${allStackPeople[1].name || allStackPeople[1].pubkey.slice(0, 8) + '…'}`;
	return `${a} & ${n - 1} Others`;
})());

const hasBottomRow = $derived(stackProfiles.length > 0 || targets.length > 0 || labels.length > 0);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<article
	class="task-card"
	role="button"
	tabindex="0"
	onclick={onClick}
	onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), onClick())}
>
	<!-- Row 1: status | title | priority -->
	<div class="row-main">
		<div class="taskbox-col">
			<TaskBox state={status} size={24} />
		</div>
		<span class="task-title">{title}</span>
		<div class="priority-col">
			<PriorityBox {priority} size={22} />
		</div>
	</div>

	<!-- Row 2: L-shape + ProfilePicStack (left) + LabelStack (right) -->
	{#if hasBottomRow}
		<div class="row-bottom">
			<!-- Single SVG L-shape: vertical drop then curved corner (20×20, square) -->
			<div class="connector-col">
				<svg viewBox="0 0 22 22" width="22" height="22" fill="none" aria-hidden="true">
					<path
						d="M1 0 L1 9 Q1 21 10 21 L22 21"
						stroke="hsl(var(--white16))"
						stroke-width="1.5"
						fill="none"
					/>
				</svg>
			</div>

			<div class="bottom-items">
				<!-- Target events container -->
				{#if targets.length > 0}
					<div class="targets-container">
						{#each targets as target}
							<span class="target-chip">{target.label}</span>
						{/each}
					</div>
				{/if}

				<!-- Creator + assignees + commenters stack -->
				{#if stackProfiles.length > 0}
				<ProfilePicStack
					profiles={stackProfiles}
					text={stackText}
					size="xs"
					onclick={onClick}
				/>
				{/if}

				<!-- Labels stack, pushed to the far right -->
				{#if labels.length > 0}
					<div class="labels-right">
						<LabelStack {labels} />
					</div>
				{/if}
			</div>
		</div>
	{/if}
</article>

<style>
	.task-card {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 14px 16px;
		border-bottom: 1.4px solid hsl(var(--white11));
		background: transparent;
		border-radius: 0;
		cursor: pointer;
		outline: none;
	}

	.task-card:focus-visible {
		background: hsl(var(--white4));
	}

	/* Row 1 — fixed height = TaskBox height so connector always starts flush */
	.row-main {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 24px;
	}

	/* Fixed-width column so the L-shape aligns to the centre of the TaskBox */
	.taskbox-col {
		width: 24px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.task-title {
		flex: 1;
		min-width: 0;
		font-size: 0.9375rem;
		font-weight: 500;
		color: hsl(var(--white));
		line-height: 1.35;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.priority-col {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	/* Row 2 ────────────────────────────────── */
	/*
	 * margin-left = half the TaskBox width (24/2 = 12px) so the L-shape
	 * connector aligns with the centre of the TaskBox in row 1.
	 */
	.row-bottom {
		display: flex;
		align-items: flex-start;
		margin-left: 12px;
		width: calc(100% - 12px);
	}

	.connector-col {
		width: 22px;
		flex-shrink: 0;
		display: flex;
		align-items: flex-start;
	}

	.bottom-items {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
		/* Center of xs ProfilePicStack (24px) at y=19 (the connector horizontal line): 7+12=19 */
		padding-top: 7px;
	}

	.labels-right {
		margin-left: auto;
		flex-shrink: 0;
	}

	/* Target events container — same 28px height as ProfilePicStack sm */
	.targets-container {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 28px;
		padding: 0 10px;
		background: hsl(var(--white8));
		border-radius: 9999px;
		flex-shrink: 0;
		max-width: 50%;
		overflow: hidden;
	}

	.target-chip {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--white66));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
</style>

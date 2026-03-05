<script>
// @ts-nocheck
/**
 * ProjectCard — feed card for a kind:30315 Project event.
 *
 * Layout mirrors ForumPost:
 *   Left column  : ProjectBox (24px hexagon) + vertical connector line
 *   Right column : Row 1 — title + due chip
 *                  Row 2 — summary (3-line clamp)
 *                  Row 3 — one btn-secondary-small per milestone
 *   Bottom row   : L-shape connector → ProfilePicStack of project members
 */
import ProjectBox from '$lib/components/common/ProjectBox.svelte';
import MilestoneBox from '$lib/components/common/MilestoneBox.svelte';
import ProfilePicStack from '$lib/components/common/ProfilePicStack.svelte';

let {
	title = '',
	summary = '',
	/** 0-100 overall project completion */
	percentage = 0,
	/** @type {{ id: string; title: string; percentage: number }[]} */
	milestones = [],
	/** @type {{ pubkey: string; name?: string; pictureUrl?: string }|null} */
	author = null,
	/** @type {{ pubkey: string; name?: string; pictureUrl?: string }[]} */
	members = [],
	/** Unix timestamp or null */
	due = null,
	/** @type {() => void} */
	onClick = () => {},
} = $props();

/** Unique team profiles: author first, then other members, capped at 4 */
const stackProfiles = $derived((() => {
	const seen = new Set();
	/** @type {{ pubkey: string; name?: string; pictureUrl?: string }[]} */
	const merged = [];
	for (const p of [author, ...members]) {
		if (p && !seen.has(p.pubkey)) {
			seen.add(p.pubkey);
			merged.push(p);
		}
	}
	return merged.slice(0, 4);
})());

const stackText = $derived(
	author?.name || (author ? author.pubkey.slice(0, 8) + '…' : '')
);

const hasBottomRow = $derived(stackProfiles.length > 0);

/** Format Unix timestamp as relative or short date */
function formatDue(/** @type {number} */ ts) {
	if (!ts) return '';
	const date = new Date(ts * 1000);
	const now = new Date();
	const diffDays = Math.floor((date.getTime() - now.getTime()) / 86400000);
	if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
	if (diffDays === 0) return 'Today';
	if (diffDays < 7) return `${diffDays}d`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions a11y_no_noninteractive_element_to_interactive_role a11y_no_noninteractive_tabindex -->
<article
	class="project-card"
	role="button"
	tabindex="0"
	onclick={onClick}
	onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), onClick())}
>
	<div class="top-section">
		<!-- Left column: ProjectBox + vertical connector line -->
		<div class="left-column">
			<div class="box-wrap">
				<ProjectBox {percentage} size={24} />
			</div>
			{#if hasBottomRow}
				<div class="connector-vertical-only"></div>
			{/if}
		</div>

		<!-- Right column: title → summary → milestone buttons -->
		<div class="right-column">
			<!-- Row 1: title + due chip -->
			<div class="row row-title">
				<span class="project-title">{title}</span>
				{#if due}
					<span class="due-chip">{formatDue(due)}</span>
				{/if}
			</div>

			<!-- Row 2: summary -->
			{#if summary}
				<div class="row summary-row">
					<p class="project-summary">{summary}</p>
				</div>
			{/if}

			<!-- Row 3: one btn per milestone -->
			{#if milestones.length > 0}
				<div class="row milestones-row">
					{#each milestones.slice(0, 5) as ms}
						<button
							class="ms-btn"
							type="button"
							onclick={(e) => e.stopPropagation()}
						>
							<MilestoneBox percentage={ms.percentage} size={13} />
							{ms.title}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- Bottom row: L-shape connector + profile stack -->
	{#if hasBottomRow}
		<div class="reply-row">
			<div class="connector-column">
				<div class="connector-vertical"></div>
				<div class="connector-corner">
					<svg viewBox="0 0 27 16" fill="none" aria-hidden="true">
						<path
							d="M1 0 L1 0 Q1 15 16 15 L27 15"
							stroke="hsl(var(--white16))"
							stroke-width="1.5"
							fill="none"
						/>
					</svg>
				</div>
			</div>
			<div class="repliers-row">
				<ProfilePicStack
					profiles={stackProfiles}
					text={stackText}
					size="sm"
					onclick={onClick}
				/>
			</div>
		</div>
	{/if}
</article>

<style>
	.project-card {
		display: flex;
		flex-direction: column;
		background: transparent;
		border: none;
		border-radius: 0;
		border-bottom: 1.4px solid hsl(var(--white11));
		cursor: pointer;
		overflow: visible;
		padding: 14px 16px;
		outline: none;
	}

	.project-card:focus-visible {
		background: hsl(var(--white4));
	}

	/* ── Top section ── */

	.top-section {
		display: flex;
		align-items: stretch;
		gap: 0;
	}

	/* Left column — ProjectBox at top, vertical line fills the rest */
	.left-column {
		width: 32px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.box-wrap {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.connector-vertical-only {
		width: 1.5px;
		flex: 1;
		min-height: 8px;
		background: hsl(var(--white16));
		margin-top: 2px;
	}

	/* Right column */
	.right-column {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 0;
	}

	.row {
		margin: 0;
	}

	/* Row 1: title + due chip */
	.row-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0 0 0 12px;
		min-height: 24px;
	}

	.project-title {
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

	.due-chip {
		flex-shrink: 0;
		font-size: 0.6875rem;
		font-weight: 500;
		color: hsl(var(--white33));
		background: hsl(var(--white8));
		border-radius: 9999px;
		padding: 2px 8px;
		white-space: nowrap;
	}

	/* Row 2: summary */
	.summary-row {
		padding: 0 0 0 12px;
		margin-top: 2px;
	}

	.project-summary {
		font-size: 0.9375rem;
		line-height: 1.45;
		margin: 0;
		color: hsl(var(--white66));
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Row 3: one milestone button per milestone */
	.milestones-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 0 4px 12px;
		flex-wrap: wrap;
	}

	/* Milestone chip */
	.ms-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 28px;
		padding: 0 10px 0 8px;
		background: hsl(var(--gray66));
		border: none;
		border-radius: 8px;
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 500;
		color: hsl(var(--white66));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 160px;
		pointer-events: none;
		cursor: default;
	}

	/* ── Bottom row: L-shape connector + profile stack ── */

	.reply-row {
		display: flex;
		align-items: flex-end;
		margin-left: 16px;
		width: calc(100% - 16px);
	}

	.connector-column {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 27px;
		flex-shrink: 0;
		padding-bottom: 14px;
	}

	.connector-vertical {
		width: 1.5px;
		height: 12px;
		background: hsl(var(--white16));
		margin-left: 0;
	}

	.connector-corner {
		width: 27px;
		height: 16px;
		flex-shrink: 0;
	}

	.connector-corner svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	.repliers-row {
		display: flex;
		align-items: center;
		padding-top: 4px;
		flex: 1;
		min-width: 0;
	}
</style>

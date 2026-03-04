<script>
// @ts-nocheck
/**
 * ProjectCard — feed card for a kind:30315 Project event.
 *
 * Row 1: ProjectBox (24px hexagon, status + progress) | title | due-date chip
 * Row 2: L-shape connector → row of MilestoneBox chips (one per milestone, 16px diamonds)
 *         + ProfilePicStack of project members
 */
import ProjectBox from '$lib/components/common/ProjectBox.svelte';
import MilestoneBox from '$lib/components/common/MilestoneBox.svelte';
import ProfilePicStack from '$lib/components/common/ProfilePicStack.svelte';

let {
	title = '',
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

const hasBottomRow = $derived(milestones.length > 0 || stackProfiles.length > 0);

/** Format Unix timestamp as relative or short date */
function formatDue(/** @type {number} */ ts) {
	if (!ts) return '';
	const date = new Date(ts * 1000);
	const now = new Date();
	const diffDays = Math.floor((date - now) / 86400000);
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
	<!-- Row 1: hexagon status | title | due chip -->
	<div class="row-main">
		<div class="box-col">
			<ProjectBox {percentage} size={24} />
		</div>
		<span class="project-title">{title}</span>
		{#if due}
			<span class="due-chip">{formatDue(due)}</span>
		{/if}
	</div>

	<!-- Row 2: L-shape + milestone diamonds + team stack -->
	{#if hasBottomRow}
		<div class="row-bottom">
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
				<!-- Milestone diamond strip -->
				{#if milestones.length > 0}
					<div class="milestones-strip">
						{#each milestones.slice(0, 6) as m}
							<MilestoneBox percentage={m.percentage} size={16} />
						{/each}
						{#if milestones.length > 6}
							<span class="ms-overflow">+{milestones.length - 6}</span>
						{/if}
					</div>
				{/if}

				<!-- Team profile stack -->
				{#if stackProfiles.length > 0}
					<ProfilePicStack
						profiles={stackProfiles}
						text={stackText}
						size="xs"
						onclick={onClick}
					/>
				{/if}
			</div>
		</div>
	{/if}
</article>

<style>
	.project-card {
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

	.project-card:focus-visible {
		background: hsl(var(--white4));
	}

	.row-main {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 24px;
	}

	.box-col {
		width: 24px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
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
		gap: 10px;
		flex: 1;
		min-width: 0;
		padding-top: 7px;
	}

	.milestones-strip {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.ms-overflow {
		font-size: 0.6875rem;
		color: hsl(var(--white33));
		padding-left: 2px;
	}
</style>

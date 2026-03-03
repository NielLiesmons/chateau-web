<script lang="js">
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import LabelStack from '$lib/components/common/LabelStack.svelte';
import ProfilePicStack from '$lib/components/common/ProfilePicStack.svelte';

/**
 * Wiki feed card — panel style.
 *
 * Layout:
 *   Row 1: ProfilePic (sm) · author name · timestamp
 *   Row 2: title (left, 2-line clamp) · #slug (right)
 *   Row 3: summary (left, 2-line clamp) · LabelStack (right, optional)
 *   Row 4 (optional): L-shape + ProfilePicStack for contributors
 */
let {
	title = '',
	summary = '',
	slug = '',
	/** @type {string[]} */
	labels = [],
	/** @type {{ name?: string; picture?: string; pubkey?: string }|null} */
	author = null,
	createdAt = 0,
	/** @type {{ pubkey: string; displayName?: string; avatarUrl?: string }[]} */
	contributors = [],
	/** @type {() => void} */
	onClick = () => {},
} = $props();

const hasContributors = $derived(contributors && contributors.length > 0);
const hasLabels = $derived(labels && labels.length > 0);

const displayName = $derived(author?.name || 'Anonymous');

const stackProfiles = $derived(
	(contributors || []).slice(0, 3).map((r) => ({
		pubkey: r.pubkey,
		name: r.displayName ?? '',
		pictureUrl: r.avatarUrl ?? undefined
	}))
);

const stackText = $derived(
	contributors?.length === 1
		? (contributors[0].displayName || 'Someone')
		: contributors?.length === 2
			? `${contributors[0].displayName || 'Someone'} & ${contributors[1].displayName || 'Someone'}`
			: contributors?.length > 2
				? `${contributors[0].displayName || 'Someone'} & Others`
				: ''
);

/** @param {number|string|null|undefined} ts */
function formatDateTime(ts) {
	if (ts == null || ts === '') return '';
	const date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
	if (Number.isNaN(date.getTime())) return '';
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);
	if (diffMins < 1) return 'now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions a11y_no_noninteractive_element_to_interactive_role -->
<article
	class="wiki-card"
	role="button"
	tabindex="0"
	onclick={() => onClick()}
	onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), onClick())}
>
	<!-- Row 1: author pic + name + timestamp -->
	<div class="row row-meta">
		<div class="author-pic">
		<ProfilePic
			pictureUrl={author?.picture}
			name={author?.name}
			pubkey={author?.pubkey}
			size="xs"
		/>
		</div>
		<span class="author-name">{displayName}</span>
		<span class="timestamp">{formatDateTime(createdAt)}</span>
	</div>

	<!-- Row 2: title (left) + slug (right) -->
	{#if title}
		<div class="row title-slug-row">
			<h3 class="wiki-title">{title}</h3>
			{#if slug}
				<span class="wiki-slug">/{slug}</span>
			{/if}
		</div>
	{/if}

	<!-- Row 3: summary (left) + labels (right) -->
	{#if summary || hasLabels}
		<div class="row summary-labels-row">
			{#if summary}
				<p class="wiki-summary">{summary}</p>
			{/if}
			{#if hasLabels}
				<div class="label-wrap">
					<LabelStack {labels} maxDisplay={3} />
				</div>
			{/if}
		</div>
	{/if}

	<!-- Row 4 (optional): L-shape connector + contributors stack -->
	{#if hasContributors}
		<div class="reply-row">
			<div class="connector-column">
				<div class="connector-vertical"></div>
				<div class="connector-corner">
					<svg viewBox="0 0 27 16" fill="none">
						<path
							d="M1 0 L1 0 Q1 15 16 15 L27 15"
							stroke="hsl(var(--white16))"
							stroke-width="1.5"
							fill="none"
						/>
					</svg>
				</div>
			</div>
			<div class="contributors-row">
				<ProfilePicStack
					profiles={stackProfiles}
					text={stackText}
					suffix={String(contributors.length)}
					size="sm"
					onclick={onClick}
				/>
			</div>
		</div>
	{/if}
</article>

<style>
	.wiki-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: hsl(var(--gray33));
		border: none;
		border-radius: 16px;
		cursor: pointer;
		outline: none;
		padding: 12px 14px;
	}

	.wiki-card:focus-visible {
		background: hsl(var(--gray44));
	}

	.row {
		margin: 0;
	}

	/* Row 1 */
	.row-meta {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.author-pic {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	.author-name {
		font-weight: 500;
		font-size: 0.875rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: hsl(var(--white66));
		flex: 1;
		min-width: 0;
	}

	.timestamp {
		font-size: 0.75rem;
		white-space: nowrap;
		flex-shrink: 0;
		color: hsl(var(--white33));
	}

	/* Row 2: title + slug */
	.title-slug-row {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}

	.wiki-title {
		font-size: 1.0625rem;
		font-weight: 600;
		line-height: 1.35;
		color: hsl(var(--white));
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		flex: 1;
		min-width: 0;
		margin: 0;
	}

	.wiki-slug {
		font-size: 0.6875rem;
		color: hsl(var(--white33));
		font-family: var(--font-mono);
		white-space: nowrap;
		flex-shrink: 0;
		padding-top: 2px;
	}

	/* Row 3: summary + labels */
	.summary-labels-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
	}

	.wiki-summary {
		font-size: 0.875rem;
		line-height: 1.45;
		margin: 0;
		color: hsl(var(--white66));
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		flex: 1;
		min-width: 0;
	}

	.label-wrap {
		flex-shrink: 0;
		padding-top: 1px;
	}

	/* Row 4: L-shape + contributors */
	.reply-row {
		display: flex;
		align-items: flex-end;
		margin-left: 0;
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

	.contributors-row {
		display: flex;
		align-items: center;
		padding-top: 4px;
		flex: 1;
		min-width: 0;
	}
</style>

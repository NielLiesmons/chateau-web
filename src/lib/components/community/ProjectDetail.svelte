<script lang="js">
// @ts-nocheck
/**
 * ProjectDetail — full-screen view for a kind:30315 Project event.
 * Shows: project header (hexagon status, title, team), Markdown description,
 * ordered milestone list (each with diamond + status + due + progress),
 * and SocialTabs + BottomBar for comments/zaps.
 */
import { queryEvent, queryEvents, liveQuery, parseProfile, parseComment, parseZapReceipt,
	publishComment, fetchProfilesBatch, parseCommunity, fetchFromRelays, putEvents,
	publishToRelays, fetchEventsNoStore, fetchProjectMilestones, parseMilestone
} from '$lib/nostr';
import { EVENT_KINDS, DEFAULT_COMMUNITY_RELAYS, DEFAULT_SOCIAL_RELAYS } from '$lib/config';
import { tokenizeNostrMarkdown } from '$lib/utils/markdown';
import MarkdownBody from '$lib/components/common/MarkdownBody.svelte';
import EmptyState from '$lib/components/common/EmptyState.svelte';
import DetailHeader from '$lib/components/layout/DetailHeader.svelte';
import SocialTabs from '$lib/components/social/SocialTabs.svelte';
import BottomBar from '$lib/components/social/BottomBar.svelte';
import ProjectBox from '$lib/components/common/ProjectBox.svelte';
import MilestoneBox from '$lib/components/common/MilestoneBox.svelte';
import ProfilePicStack from '$lib/components/common/ProfilePicStack.svelte';
import ProjectModal from '$lib/components/modals/ProjectModal.svelte';
import { Pen } from '$lib/components/icons';
import { getCurrentPubkey, getIsSignedIn, signEvent } from '$lib/stores/auth.svelte.js';
import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
import { fly } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';

let { eventId = '', communityNpub = '', onBack = () => {} } = $props();

let editModalOpen = $state(false);

// ── Project event ───────────────────────────────────────────────────────────
let projectEvent  = $state(null);
let projectParsed = $state(null);
let authorProfile = $state(null);
let teamProfiles  = $state([]);

$effect(() => {
	if (!eventId) return;
	(async () => {
		const ev = await queryEvent({ ids: [eventId] });
		if (!ev) return;
		projectEvent  = ev;
		const { parseProject } = await import('$lib/nostr');
		projectParsed = parseProject(ev);
		const pks = [ev.pubkey, ...(projectParsed?.members?.map((m) => m.pubkey) ?? [])];
		const profiles = await fetchProfilesBatch(pks);
		const byPk = new Map(profiles.map((p) => [p.pubkey, p]));
		authorProfile = byPk.get(ev.pubkey) ?? null;
		teamProfiles  = (projectParsed?.members ?? []).map((m) => ({
			pubkey: m.pubkey,
			name: byPk.get(m.pubkey)?.displayName ?? byPk.get(m.pubkey)?.name ?? '',
			pictureUrl: byPk.get(m.pubkey)?.picture ?? ''
		}));
	})();
});

// ── Milestones ──────────────────────────────────────────────────────────────
let milestones = $state([]);
let milestoneStatusMap = $state(new Map()); // addr → status string

$effect(() => {
	if (!projectParsed?.milestoneAddrs?.length && !projectEvent) return;
	const communityDef = communityNpub
		? (() => { /* resolved below */ })()
		: null;
	(async () => {
		const relays = DEFAULT_COMMUNITY_RELAYS;
		const projectAddr = projectEvent
			? `${EVENT_KINDS.PROJECT}:${projectEvent.pubkey}:${projectParsed?.dTag}`
			: null;
		const evs = await fetchProjectMilestones(
			relays,
			projectParsed?.milestoneAddrs ?? [],
			projectAddr
		);
		if (evs.length) await putEvents(evs);
		milestones = evs.map((e) => parseMilestone(e)).filter(Boolean);
	})();
});

// Fetch milestone statuses (kind:1983)
const milestoneAddressSet = $derived(
	new Set((projectParsed?.milestoneAddrs ?? []).concat(
		milestones.map((m) => `${EVENT_KINDS.MILESTONE}:${m.pubkey}:${m.dTag}`)
	))
);

$effect(() => {
	if (!milestones.length) return;
	const sub = liveQuery(async () => {
		const addrs = milestones.map((m) => `${EVENT_KINDS.MILESTONE}:${m.pubkey}:${m.dTag}`);
		if (!addrs.length) return new Map();
		const evs = await queryEvents({ kinds: [EVENT_KINDS.STATUS], '#a': addrs, limit: 500 });
		const map = new Map();
		for (const e of evs) {
			const a = e.tags?.find((t) => t[0] === 'a')?.[1];
			if (!a) continue;
			const prev = map.get(a);
			if (!prev || e.created_at > prev.created_at) map.set(a, e);
		}
		// Convert status event to normalised string
		const result = new Map();
		for (const [addr, ev] of map) {
			const raw = ev.tags?.find((t) => t[0] === 'status')?.[1] ?? 'open';
			const statusMap = { 'in-progress': 'inProgress', 'in-review': 'inReview', open: 'open', backlog: 'backlog', closed: 'closed', canceled: 'canceled' };
			result.set(addr, statusMap[raw] ?? raw);
		}
		return result;
	}).subscribe({
		next: (val) => { milestoneStatusMap = val ?? new Map(); },
		error: (e) => console.error('[ProjectDetail] milestone status error', e)
	});
	return () => sub.unsubscribe();
});

// ── Project status (kind:1983) ────────────────────────────────────────────
let projectPercentage = $state(0);

$effect(() => {
	if (!projectParsed) return;
	// Derive project progress from closed milestones
	if (milestones.length) {
		const closedCount = milestones.filter((m) => {
			const a = `${EVENT_KINDS.MILESTONE}:${m.pubkey}:${m.dTag}`;
			return milestoneStatusMap.get(a) === 'closed';
		}).length;
		projectPercentage = Math.round((closedCount / milestones.length) * 100);
	}
});

// ── Markdown content ─────────────────────────────────────────────────────
const markdownTokens = $derived(
	projectParsed?.content ? tokenizeNostrMarkdown(projectParsed.content) : []
);

// ── Comments / SocialTabs ─────────────────────────────────────────────────
const currentPubkey  = $derived(getCurrentPubkey());
const isSignedIn     = $derived(getIsSignedIn());
const communityDef   = $state(null);
const searchProfiles = $derived(createSearchProfilesFunction(getCurrentPubkey));
const searchEmojis   = $derived(createSearchEmojisFunction(getCurrentPubkey));

// We reuse the same comment logic as ForumPostDetail by delegating to SocialTabs
// SocialTabs + BottomBar expect the event's id and community info.

// ── Due date formatting ───────────────────────────────────────────────────
function formatDue(ts) {
	if (!ts) return null;
	const d = new Date(ts * 1000);
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getMilestoneAddr(m) {
	return `${EVENT_KINDS.MILESTONE}:${m.pubkey}:${m.dTag}`;
}
</script>

{#if !projectParsed}
	<EmptyState message="Loading project…" minHeight={400} />
{:else}
	<div class="project-detail" in:fly={{ y: 40, duration: 260, easing: cubicOut }}>
		<DetailHeader
			title={projectParsed.title || 'Project'}
			onBack={onBack}
		>
			{#snippet right()}
				{#if currentPubkey === projectEvent?.pubkey}
					<button class="edit-btn" onclick={() => { editModalOpen = true; }} title="Edit">
						<Pen size={18} color="hsl(var(--white66))" />
					</button>
				{/if}
			{/snippet}
		</DetailHeader>

		<div class="body">
			<!-- Project header -->
			<div class="project-header">
				<ProjectBox percentage={projectPercentage} size={40} />
				<div class="header-text">
					<h1 class="project-title">{projectParsed.title}</h1>
					{#if projectParsed.summary}
						<p class="project-summary">{projectParsed.summary}</p>
					{/if}
				</div>
			</div>

			<!-- Meta row: due + team -->
			<div class="meta-row">
				{#if projectParsed.due}
					<span class="meta-chip">Due {formatDue(projectParsed.due)}</span>
				{/if}
				{#if teamProfiles.length > 0 || authorProfile}
					<ProfilePicStack
						profiles={[
							...(authorProfile ? [{ pubkey: projectEvent.pubkey, name: authorProfile.displayName ?? authorProfile.name, pictureUrl: authorProfile.picture }] : []),
							...teamProfiles
						].slice(0, 4)}
						text={authorProfile?.displayName ?? authorProfile?.name ?? ''}
						size="xs"
					/>
				{/if}
			</div>

			<!-- Markdown description -->
			{#if markdownTokens.length > 0}
				<div class="description">
					<MarkdownBody tokens={markdownTokens} />
				</div>
			{/if}

			<!-- Milestones list -->
			{#if milestones.length > 0}
				<div class="milestones-section">
					<h2 class="section-heading">Milestones</h2>
					<div class="milestones-list">
						{#each milestones as ms}
							{@const addr = getMilestoneAddr(ms)}
							{@const msStatus = milestoneStatusMap.get(addr) ?? 'open'}
						{@const msPct = msStatus === 'closed' ? 100 : msStatus === 'inProgress' ? 50 : msStatus === 'inReview' ? 75 : 0}
							<div class="milestone-row">
								<MilestoneBox percentage={msPct} size={20} />
								<div class="ms-info">
									<span class="ms-title">{ms.title}</span>
									{#if ms.summary}
										<span class="ms-summary">{ms.summary}</span>
									{/if}
								</div>
								{#if ms.due}
									<span class="ms-due">{formatDue(ms.due)}</span>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Social section -->
			{#if eventId}
				<div class="social-section">
					<SocialTabs
						postId={eventId}
						{communityDef}
						{communityNpub}
					/>
				</div>
			{/if}
		</div>

		<!-- Bottom bar for commenting -->
		{#if isSignedIn && eventId}
			<BottomBar
				onComment={async (content, emojiTags, mentions) => {
					await publishComment(
						content,
						{ id: eventId, pubkey: projectEvent?.pubkey ?? '', kind: EVENT_KINDS.PROJECT },
						signEvent,
						emojiTags,
						null, null, null, mentions,
						DEFAULT_COMMUNITY_RELAYS
					);
				}}
				{searchProfiles}
				{searchEmojis}
			/>
		{/if}
	</div>
{/if}

<!-- Edit modal -->
<ProjectModal
	bind:isOpen={editModalOpen}
	initialData={{
		title: projectParsed?.title,
		slug: projectParsed?.dTag,
		summary: projectParsed?.summary,
		text: projectParsed?.content,
		labels: projectParsed?.labels,
		status: projectStatus
	}}
	defaultMode="project"
	{getCurrentPubkey}
	{searchProfiles}
	{searchEmojis}
	onsubmit={async (data) => {
		// Publishing handled by the parent page via onBack + re-open
		console.log('[ProjectDetail] edit submitted', data);
		editModalOpen = false;
	}}
/>

<style>
.project-detail {
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: hidden;
}

.body {
	flex: 1;
	overflow-y: auto;
	padding-bottom: 80px;
}

.project-header {
	display: flex;
	align-items: flex-start;
	gap: 14px;
	padding: 20px 16px 12px;
}

.header-text {
	flex: 1;
	min-width: 0;
}

.project-title {
	font-size: 1.25rem;
	font-weight: 700;
	color: hsl(var(--white));
	margin: 0;
	line-height: 1.3;
}

.project-summary {
	font-size: 0.875rem;
	color: hsl(var(--white66));
	margin: 4px 0 0;
}

.meta-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 0 16px 14px;
	flex-wrap: wrap;
}

.meta-chip {
	font-size: 0.75rem;
	padding: 3px 10px;
	background: hsl(var(--white8));
	border-radius: 9999px;
	color: hsl(var(--white66));
}

.edit-btn {
	background: transparent;
	border: none;
	padding: 6px;
	cursor: pointer;
	display: flex;
	align-items: center;
	opacity: 0.7;
	transition: opacity 0.15s;
}
.edit-btn:hover { opacity: 1; }

.description {
	padding: 0 16px 16px;
	border-bottom: 1px solid hsl(var(--white11));
}

.milestones-section {
	padding: 16px 16px 0;
}

.section-heading {
	font-size: 0.75rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: hsl(var(--white33));
	margin: 0 0 10px;
}

.milestones-list {
	display: flex;
	flex-direction: column;
	gap: 0;
}

.milestone-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 0;
	border-bottom: 1px solid hsl(var(--white8));
}

.ms-info {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.ms-title {
	font-size: 0.9375rem;
	font-weight: 500;
	color: hsl(var(--white));
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.ms-summary {
	font-size: 0.8125rem;
	color: hsl(var(--white33));
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.ms-due {
	font-size: 0.6875rem;
	color: hsl(var(--white33));
	flex-shrink: 0;
	background: hsl(var(--white8));
	border-radius: 9999px;
	padding: 2px 8px;
}

.social-section {
	margin-top: 16px;
}
</style>

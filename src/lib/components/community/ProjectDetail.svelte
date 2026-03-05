<script lang="js">
// @ts-nocheck
/**
 * ProjectDetail — full article view for a kind:30315 Project event.
 *
 * Mirrors WikiDetail:
 *   - DetailHeader with author info
 *   - Title row with edit button (own projects only)
 *   - Summary panel (gray33 box)
 *   - Meta panel: progress · due · members (scrollable, like TaskDetail)
 *   - Markdown content body with read-more/show-less
 *   - Milestones list
 *   - SocialTabs + BottomBar
 */
import { nip19 } from 'nostr-tools';
import {
	queryEvent, queryEvents, liveQuery, parseProfile, parseComment, parseZapReceipt,
	publishComment, fetchProfilesBatch, fetchFromRelays, putEvents, publishToRelays,
	fetchProjectMilestones, parseMilestone, parseProject
} from '$lib/nostr';
import { EVENT_KINDS, DEFAULT_COMMUNITY_RELAYS } from '$lib/config';
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
import { goto } from '$app/navigation';

let { eventId = '', communityNpub = '', onBack = () => {} } = $props();

let editModalOpen       = $state(false);
let projectEvent        = $state(null);
let projectParsed       = $state(null);
let authorProfile       = $state(null);
let teamProfiles        = $state([]);
let loading             = $state(true);
let communityName       = $state('');
let communityPicture    = $state('');
let communityPubkeyState = $state('');
let descriptionExpanded = $state(false);
let isTruncated         = $state(false);

// ── Milestones ────────────────────────────────────────────────────────────
let milestones        = $state([]);
let milestoneStatusMap = $state(new Map());

// ── Project progress (derived from closed milestones) ───────────────────
let projectPercentage = $state(0);

// ── Derived values ────────────────────────────────────────────────────────
const title = $derived(projectParsed?.title ?? '');
const summary = $derived(projectParsed?.summary ?? '');
const dTag = $derived(projectParsed?.dTag ?? '');

const emojiMap = $derived(
	Object.fromEntries(
		(projectEvent?.tags ?? [])
			.filter((t) => t[0] === 'emoji' && t[1] && t[2])
			.map((t) => [t[1], t[2]])
	)
);
const bodyTokens = $derived(
	projectParsed?.content ? tokenizeNostrMarkdown(projectParsed.content, { emojiMap }) : []
);

const npub = $derived(
	projectEvent?.pubkey
		? (() => { try { return nip19.npubEncode(projectEvent.pubkey); } catch { return ''; } })()
		: ''
);

const publisherName = $derived(authorProfile?.displayName ?? authorProfile?.name ?? 'Author');

const catalogs = $derived(
	communityPubkeyState
		? [{ name: communityName || 'Community', pictureUrl: communityPicture || undefined, pubkey: communityPubkeyState }]
		: []
);

const projectNaddr = $derived(
	projectEvent?.pubkey && dTag
		? (() => {
				try {
					return nip19.naddrEncode({ kind: EVENT_KINDS.PROJECT, pubkey: projectEvent.pubkey, identifier: dTag });
				} catch { return ''; }
			})()
		: ''
);

const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey() ?? ''));
const searchEmojis   = $derived(createSearchEmojisFunction(/** @type {any} */ (() => getCurrentPubkey() ?? '')));

const isOwnProject = $derived(
	!!projectEvent?.pubkey && !!getCurrentPubkey() && projectEvent.pubkey === getCurrentPubkey()
);

const zapTarget = $derived(
	projectEvent
		? { name: title, pubkey: projectEvent.pubkey, id: projectEvent.id, pictureUrl: authorProfile?.picture }
		: null
);

const editInitialData = $derived(
	projectParsed
		? {
				title: projectParsed.title ?? '',
				slug:  projectParsed.dTag  ?? '',
				summary: projectParsed.summary ?? '',
				text:  projectEvent?.content ?? '',
				labels: projectParsed.labels ?? [],
				status: 'open'
			}
		: null
);

// ── Load project event ────────────────────────────────────────────────────
$effect(() => {
	if (!communityNpub) { loading = false; return; }
	let communityPubkey = '';
	try {
		const decoded = nip19.decode(communityNpub);
		if (decoded.type === 'npub') communityPubkey = decoded.data;
	} catch { loading = false; return; }

	(async () => {
		loading = true;
		projectEvent  = null;
		projectParsed = null;
		authorProfile = null;
		teamProfiles  = [];
		milestones    = [];
		communityName = '';
		communityPicture = '';
		communityPubkeyState = communityPubkey;
		descriptionExpanded = false;
		isTruncated = false;

		let ev = null;
		if (eventId) {
			ev = await queryEvent({ ids: [eventId] });
		}
		if (!ev) {
			const candidates = await queryEvents({ kinds: [EVENT_KINDS.PROJECT], '#h': [communityPubkey], limit: 20 });
			ev = candidates.find((e) => e.id === eventId) ?? candidates[0] ?? null;
		}
		if (!ev) {
			const fetched = await fetchFromRelays(
				DEFAULT_COMMUNITY_RELAYS,
				eventId ? { kinds: [EVENT_KINDS.PROJECT], ids: [eventId], limit: 1 } : { kinds: [EVENT_KINDS.PROJECT], '#h': [communityPubkey], limit: 20 }
			);
			if (fetched.length) {
				await putEvents(fetched);
				ev = eventId ? fetched[0] : fetched.find((e) => e.id === eventId) ?? fetched[0];
			}
		}

		projectEvent  = ev ?? null;
		projectParsed = ev ? parseProject(ev) : null;
		loading = false;

		if (!ev) return;

		// Load author + community in parallel
		const [profileEv, communityEv, communityProfileEv] = await Promise.all([
			queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [ev.pubkey], limit: 1 }),
			queryEvent({ kinds: [EVENT_KINDS.COMMUNITY], authors: [communityPubkey], limit: 1 }),
			queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [communityPubkey], limit: 1 })
		]);

		if (profileEv) {
			authorProfile = parseProfile(profileEv);
		} else {
			const batch = await fetchProfilesBatch([ev.pubkey]);
			const pEv = batch.get(ev.pubkey);
			if (pEv?.content) {
				try {
					const c = JSON.parse(pEv.content);
					authorProfile = { displayName: c.display_name ?? c.name, name: c.name, picture: c.picture };
				} catch {}
			}
		}

		if (communityEv?.content) {
			try {
				const c = JSON.parse(communityEv.content);
				communityName    = c.name ?? c.display_name ?? '';
				communityPicture = c.image ?? c.picture ?? c.icon ?? '';
			} catch {}
		}
		if ((!communityName || !communityPicture) && communityProfileEv?.content) {
			try {
				const c = JSON.parse(communityProfileEv.content);
				if (!communityName)    communityName    = c.display_name ?? c.name ?? 'Community';
				if (!communityPicture) communityPicture = c.picture ?? c.image ?? '';
			} catch {}
		}

		// Load team profiles
		const memberPks = (projectParsed?.members ?? []).map((m) => m.pubkey);
		if (memberPks.length) {
			const batch = await fetchProfilesBatch(memberPks);
			teamProfiles = memberPks.map((pk) => {
				const pEv = batch.get(pk);
				const c = pEv?.content ? (() => { try { return JSON.parse(pEv.content); } catch { return {}; } })() : {};
				return { pubkey: pk, name: c.display_name ?? c.name ?? '', pictureUrl: c.picture ?? '' };
			});
		}
	})();
});

// ── Load milestones ───────────────────────────────────────────────────────
$effect(() => {
	if (!projectParsed?.milestoneAddrs?.length && !projectEvent) return;
	(async () => {
		const projectAddr = projectEvent
			? `${EVENT_KINDS.PROJECT}:${projectEvent.pubkey}:${projectParsed?.dTag}`
			: null;
		const evs = await fetchProjectMilestones(
			DEFAULT_COMMUNITY_RELAYS,
			projectParsed?.milestoneAddrs ?? [],
			projectAddr
		);
		if (evs.length) await putEvents(evs);
		milestones = evs.map((e) => parseMilestone(e)).filter(Boolean);
	})();
});

// ── Live milestone statuses ───────────────────────────────────────────────
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
		const result = new Map();
		const statusMap = { 'in-progress': 'inProgress', 'in-review': 'inReview', open: 'open', backlog: 'backlog', closed: 'closed', canceled: 'canceled' };
		for (const [addr, ev] of map) {
			const raw = ev.tags?.find((t) => t[0] === 'status')?.[1] ?? 'open';
			result.set(addr, statusMap[raw] ?? raw);
		}
		return result;
	}).subscribe({
		next: (val) => {
			milestoneStatusMap = val ?? new Map();
			if (milestones.length) {
				const closed = milestones.filter((m) => milestoneStatusMap.get(`${EVENT_KINDS.MILESTONE}:${m.pubkey}:${m.dTag}`) === 'closed').length;
				projectPercentage = Math.round((closed / milestones.length) * 100);
			}
		},
		error: (e) => console.error('[ProjectDetail] milestone status error', e)
	});
	return () => sub.unsubscribe();
});

// ── Truncation detection ──────────────────────────────────────────────────
/** @param {HTMLElement} node */
function checkTruncation(node) {
	const check = () => { isTruncated = node.scrollHeight > node.clientHeight; };
	setTimeout(check, 0);
	const ro = new ResizeObserver(() => { if (!descriptionExpanded) check(); });
	ro.observe(node);
	return { destroy() { ro.disconnect(); } };
}

// ── Due date formatting ───────────────────────────────────────────────────
function formatDue(ts) {
	if (!ts) return '';
	return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getMsAddr(m) {
	return `${EVENT_KINDS.MILESTONE}:${m.pubkey}:${m.dTag}`;
}

// ── Edit submit ───────────────────────────────────────────────────────────
async function handleEditSubmit({ title: newTitle, slug: newSlug, summary: newSummary = '', text, emojiTags = [], mentions = [], labels = [], status, pendingMilestones = [], dTag: submittedDTag = '' }) {
	const currentPubkey = getCurrentPubkey();
	if (!currentPubkey) throw new Error('Not signed in');
	const finalDTag = submittedDTag || projectParsed?.dTag || newSlug;

	/** @type {string[][]} */
	const tags = [['d', finalDTag], ['title', newTitle.trim()]];
	if (communityPubkeyState) tags.push(['h', communityPubkeyState]);
	if (newSummary?.trim())   tags.push(['summary', newSummary.trim()]);
	if (projectParsed?.due)   tags.push(['due', String(projectParsed.due)]);
	// Keep existing milestone references
	(projectParsed?.milestoneAddrs ?? []).forEach((a) => tags.push(['a', a]));
	labels.forEach((l)  => tags.push(['t', l]));
	mentions.forEach((pk) => tags.push(['p', pk]));
	emojiTags.forEach((e) => tags.push(e));

	const ev = await signEvent({
		kind: EVENT_KINDS.PROJECT,
		content: text ?? '',
		tags,
		created_at: Math.floor(Date.now() / 1000)
	});
	await putEvents([ev]);
	await publishToRelays(DEFAULT_COMMUNITY_RELAYS, ev);
	projectEvent  = ev;
	projectParsed = parseProject(ev);
}

// ── Meta panel overflow scroll ────────────────────────────────────────────
let panelOverflows = $state(false);
function observeOverflow(node) {
	const check = () => { panelOverflows = node.scrollWidth > node.clientWidth; };
	check();
	const ro = new ResizeObserver(check);
	ro.observe(node);
	return { destroy() { ro.disconnect(); } };
}

// ── Team profiles for meta panel ─────────────────────────────────────────
const allTeamProfiles = $derived([
	...(authorProfile ? [{ pubkey: projectEvent?.pubkey ?? '', name: authorProfile.displayName ?? authorProfile.name ?? '', pictureUrl: authorProfile.picture ?? '' }] : []),
	...teamProfiles
].slice(0, 4));
</script>

<div class="project-detail">
	{#if loading}
		<EmptyState message="Loading…" minHeight={200} />
	{:else if !projectParsed}
		<EmptyState message="Project not found" minHeight={200} />
	{:else}
		<div class="detail-header-wrap">
			<DetailHeader
				publisherPic={authorProfile?.picture}
				{publisherName}
				publisherPubkey={projectEvent?.pubkey ?? ''}
				publisherUrl={npub ? `/profile/${npub}` : '#'}
				timestamp={projectEvent?.created_at}
				{catalogs}
				catalogText="Community"
				showPublisher={true}
				showMenu={false}
				showBackButton={true}
				{onBack}
				scrollThreshold={undefined}
				compactPadding={true}
			/>
		</div>

		<div class="content-scroll">
			<div class="content-inner">

				<!-- Title row -->
				<div class="title-row">
					<ProjectBox percentage={projectPercentage} size={28} />
					<h1 class="project-title">{title}</h1>
					{#if isOwnProject && getIsSignedIn()}
						<button
							type="button"
							class="edit-btn"
							onclick={() => (editModalOpen = true)}
							aria-label="Edit project"
						>
							<Pen variant="outline" color="hsl(var(--white66))" size={14} />
							<span>Edit</span>
						</button>
					{/if}
				</div>

				<!-- Summary panel -->
				{#if summary}
					<div class="project-summary-panel">
						<p class="project-summary">{summary}</p>
					</div>
				{/if}

				<!-- Meta panel: progress / due / members / milestones count -->
				<div class="meta-scroll-wrap" class:panel-overflows={panelOverflows} use:observeOverflow>
					<div class="meta-panel">
						<div class="meta-cols">

							<!-- Progress -->
							<div class="meta-col">
								<span class="meta-label">PROGRESS</span>
								<div class="meta-line">
									<ProjectBox percentage={projectPercentage} size={16} />
									<span class="meta-val">{projectPercentage}%</span>
								</div>
							</div>

							<!-- Due date -->
							<div class="meta-col">
								<span class="meta-label">DUE</span>
								<div class="meta-line">
									<span class="meta-val" class:meta-empty={!projectParsed.due}>
										{projectParsed.due ? formatDue(projectParsed.due) : 'No due date'}
									</span>
								</div>
							</div>

							<!-- Milestones -->
							<div class="meta-col">
								<span class="meta-label">MILESTONES</span>
								<div class="meta-line">
									<span class="meta-val" class:meta-empty={!milestones.length}>
										{milestones.length
											? `${milestones.filter((m) => milestoneStatusMap.get(getMsAddr(m)) === 'closed').length} / ${milestones.length} done`
											: 'None'}
									</span>
								</div>
							</div>

							<!-- Members -->
							<div class="meta-col">
								<span class="meta-label">TEAM</span>
								<div class="meta-line">
									{#if allTeamProfiles.length > 0}
										<ProfilePicStack
											profiles={allTeamProfiles}
											text={authorProfile?.displayName ?? authorProfile?.name ?? ''}
											size="xs"
										/>
									{:else}
										<span class="meta-val meta-empty">No members</span>
									{/if}
								</div>
							</div>

						</div>
					</div>
				</div>

				<!-- Markdown body -->
				{#if bodyTokens.length > 0}
					<div class="body-wrap">
						<div class="description-container" class:expanded={descriptionExpanded}>
							<div class="project-body" use:checkTruncation>
								<MarkdownBody tokens={bodyTokens} />
							</div>
							{#if isTruncated && !descriptionExpanded}
								<div class="description-fade" aria-hidden="true"></div>
								<button
									type="button"
									class="read-more-btn"
									onclick={() => (descriptionExpanded = true)}
								>
									Read more
								</button>
							{/if}
							{#if descriptionExpanded}
								<button
									type="button"
									class="show-less-btn"
									onclick={() => (descriptionExpanded = false)}
								>
									Show less
								</button>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Milestones list -->
				{#if milestones.length > 0}
					<div class="milestones-section">
						<h2 class="section-heading">Milestones</h2>
						<div class="milestones-list">
							{#each milestones as ms}
								{@const addr    = getMsAddr(ms)}
								{@const msStatus = milestoneStatusMap.get(addr) ?? 'open'}
								{@const msPct   = msStatus === 'closed' ? 100 : msStatus === 'inProgress' ? 50 : msStatus === 'inReview' ? 75 : 0}
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

				<!-- Social tabs -->
				<div class="social-tabs-wrap">
					<SocialTabs
						app={{}}
						mainEventIds={[projectEvent?.id ?? '']}
						showDetailsTab={true}
						detailsShareableId={projectNaddr}
						detailsPublicationLabel="Project"
						detailsNpub={npub}
						detailsPubkey={projectEvent?.pubkey ?? ''}
						detailsRawData={projectEvent ? (() => { const c = { ...projectEvent }; delete c._tags; return c; })() : null}
						comments={[]}
						commentsLoading={false}
						commentsError=""
						zaps={[]}
						zapsLoading={false}
						zapperProfiles={new Map()}
						profiles={{}}
						profilesLoading={false}
						pubkeyToNpub={(pk) => (pk ? nip19.npubEncode(pk) : '')}
						{searchProfiles}
						{searchEmojis}
						labelEntries={[]}
						labelsLoading={false}
						onCommentSubmit={() => {}}
						onZapReceived={() => {}}
						onGetStarted={() => {}}
					/>
				</div>
			</div>
		</div>

		{#if zapTarget && getIsSignedIn()}
			<BottomBar
				{publisherName}
				contentType="forum"
				{zapTarget}
				otherZaps={[]}
				isSignedIn={getIsSignedIn()}
				onGetStarted={() => goto('/')}
				{searchProfiles}
				{searchEmojis}
				oncommentSubmit={() => {}}
				onzapReceived={() => {}}
				onoptions={() => {}}
			/>
		{/if}
	{/if}
</div>

<ProjectModal
	bind:isOpen={editModalOpen}
	initialData={editInitialData}
	{getCurrentPubkey}
	{searchProfiles}
	{searchEmojis}
	onsubmit={handleEditSubmit}
	onclose={() => (editModalOpen = false)}
/>

<style>
	.project-detail {
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding-bottom: 120px;
	}

	.detail-header-wrap {
		flex-shrink: 0;
	}

	.content-scroll {
		flex: 1;
		min-height: 0;
	}

	.content-inner {
		padding: 0 16px 16px;
		max-width: 100%;
	}

	/* ── Title row ── */
	.title-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 12px 0 10px;
	}

	.project-title {
		flex: 1;
		min-width: 0;
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0;
		line-height: 1.3;
		color: hsl(var(--foreground));
	}

	.edit-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		flex-shrink: 0;
		height: 28px;
		padding: 0 10px 0 8px;
		background: hsl(var(--white8));
		border: none;
		border-radius: 9999px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--white66));
		cursor: pointer;
		transition: background 0.15s ease, transform 0.15s ease;
	}

	.edit-btn:hover  { background: hsl(var(--white16)); }
	.edit-btn:active { transform: scale(0.96); }

	/* ── Summary panel ── */
	.project-summary-panel {
		background: hsl(var(--gray33));
		border-radius: 12px;
		padding: 6px 14px;
		margin-bottom: 14px;
	}

	.project-summary {
		font-size: 0.9375rem;
		color: hsl(var(--white66));
		line-height: 1.5;
		margin: 0;
	}

	/* ── Meta panel (scrollable, like TaskDetail) ── */
	.meta-scroll-wrap {
		overflow-x: auto;
		margin: 0 -16px;
		padding: 0 16px;
		margin-bottom: 14px;
		scrollbar-width: none;
	}

	.meta-scroll-wrap::-webkit-scrollbar { display: none; }

	.meta-scroll-wrap.panel-overflows {
		mask-image: linear-gradient(to right, black 90%, transparent 100%);
		-webkit-mask-image: linear-gradient(to right, black 90%, transparent 100%);
	}

	.meta-panel {
		background: hsl(var(--gray33));
		border-radius: 12px;
		padding: 0 14px;
		min-width: max-content;
	}

	.meta-cols {
		display: flex;
		flex-wrap: nowrap;
		gap: 0;
	}

	.meta-col {
		display: flex;
		flex-direction: column;
		gap: 5px;
		flex: 1;
		min-width: 120px;
		padding: 10px 14px 10px 0;
		border-right: 1px solid hsl(var(--white11));
	}

	.meta-col:not(:first-child) { padding-left: 14px; }
	.meta-col:last-child { border-right: none; padding-right: 0; }

	.meta-label {
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: hsl(var(--white33));
	}

	.meta-line {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.meta-val {
		font-size: 0.875rem;
		color: hsl(var(--white66));
		line-height: 1.4;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.meta-empty { color: hsl(var(--white16)); }

	/* ── Markdown body ── */
	.body-wrap { margin-bottom: 4px; }

	.description-container {
		position: relative;
		margin-bottom: 0.5rem;
	}

	.description-container:not(.expanded) .project-body {
		max-height: 400px;
		overflow: hidden;
	}

	.description-container.expanded .project-body { max-height: none; }

	.project-body {
		line-height: 1.6;
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
	}

	.description-fade {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 100px;
		background: linear-gradient(to bottom, transparent, hsl(var(--background)));
		pointer-events: none;
	}

	.read-more-btn {
		position: absolute;
		bottom: 8px;
		left: 0;
		height: 32px;
		padding: 0 14px;
		background-color: hsl(var(--white8));
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: none;
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.read-more-btn:hover { transform: scale(1.025); }
	.read-more-btn:active { transform: scale(0.98); }

	.show-less-btn {
		display: inline-flex;
		align-items: center;
		margin-top: 0.5rem;
		height: 32px;
		padding: 0 14px;
		background-color: hsl(var(--white8));
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: none;
		border-radius: 9999px;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		cursor: pointer;
		transition: transform 0.15s ease;
	}

	.show-less-btn:hover { transform: scale(1.025); }
	.show-less-btn:active { transform: scale(0.98); }

	/* ── Milestones list ── */
	.milestones-section {
		padding: 16px 0 0;
		border-top: 1px solid hsl(var(--white11));
		margin-top: 8px;
	}

	.section-heading {
		font-size: 0.625rem;
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

	/* ── Social tabs ── */
	.social-tabs-wrap { margin-top: 8px; }
</style>

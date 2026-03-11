<script lang="js">
// @ts-nocheck
/**
 * Shared layout for all communities-app routes:
 *   /communities, /wiki/[encoded], /forum/[encoded], /task/[encoded], /project/[encoded]
 *
 * Owns the left-panel (community list, profile header) so it NEVER remounts during
 * intra-app navigations. The right column renders each page's content via {@render children()}.
 */
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { nip19 } from 'nostr-tools';
import { Plus, Search } from '$lib/components/icons';
import { liveQuery, queryEvents } from '$lib/nostr';
import { parseCommunity, parseProfile } from '$lib/nostr';
import { EVENT_KINDS } from '$lib/config';
import { getCurrentPubkey, signOut, connect } from '$lib/stores/auth.svelte.js';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import CommunityCard from '$lib/components/community/CommunityCard.svelte';
import GetStartedModal from '$lib/components/modals/GetStartedModal.svelte';
import SpinKeyModal from '$lib/components/modals/SpinKeyModal.svelte';
import OnboardingBuildingModal from '$lib/components/modals/OnboardingBuildingModal.svelte';

let { children } = $props();

// ── URL-derived state ────────────────────────────────────────────────────────
// Community npub: comes from route param (community/[npub]) or legacy ?c= query param
const communityNpub = $derived(
	$page.params.npub || $page.url.searchParams.get('c') || ''
);
// Show right column when: on a content route, or a community is selected
const rightOpen = $derived(
	$page.url.pathname !== '/communities' || !!communityNpub
);

// ── Auth / profile ───────────────────────────────────────────────────────────
const currentPubkey = $derived(getCurrentPubkey());
let profileDropdownOpen = $state(false);

// ── Onboarding modal chain ───────────────────────────────────────────────────
let getStartedModalOpen = $state(false);
let spinKeyModalOpen = $state(false);
let onboardingBuildingModalOpen = $state(false);
let onboardingProfileName = $state('');

function handleSignOut() {
	signOut();
	profileDropdownOpen = false;
}
async function handleAddProfile() {
	profileDropdownOpen = false;
	await connect();
}
function handleGetStartedStart(/** @type {{ profileName: string }} */ event) {
	onboardingProfileName = event.profileName;
	spinKeyModalOpen = true;
	setTimeout(() => { getStartedModalOpen = false; }, 80);
}
function handleSpinComplete() {
	spinKeyModalOpen = false;
	setTimeout(() => { onboardingBuildingModalOpen = true; }, 150);
}
function handleUseExistingKey() {
	spinKeyModalOpen = false;
	getStartedModalOpen = true;
}

// ── Communities data ─────────────────────────────────────────────────────────
let communities = $state([]);
let profilesByPubkey = $state(new Map());
let forumCountByPubkey = $state(new Map());
let taskCountByPubkey = $state(new Map());
let projectCountByPubkey = $state(new Map());
let wikiCountByPubkey = $state(new Map());
let lastActivityByPubkey = $state(new Map());
let searchQuery = $state('');

const SINGLE_COMMUNITY_NPUB = 'npub1vcxcc7r9racyslkfhrwu9qlznne9v95nmk3m5frd8lfuprdmwzpsxqzqcr';

const filteredCommunities = $derived.by(() => {
	const all = !searchQuery.trim()
		? communities
		: communities.filter((c) => {
				const profile = profilesByPubkey.get(c.pubkey);
				const content = profile?.content
					? (() => { try { return JSON.parse(profile.content || '{}'); } catch { return {}; } })()
					: {};
				const name = (content.display_name ?? content.name ?? '').toLowerCase();
				return name.includes(searchQuery.trim().toLowerCase());
			});
	return all.filter((c) => {
		try { return nip19.npubEncode(c.pubkey) === SINGLE_COMMUNITY_NPUB; } catch { return false; }
	});
});

const currentUserProfileContent = $derived.by(() => {
	if (!currentPubkey) return {};
	const p = profilesByPubkey.get(currentPubkey);
	if (!p?.content) return {};
	try { return JSON.parse(p.content); } catch { return {}; }
});
const currentUserNpub = $derived(
	currentPubkey
		? (() => { try { return nip19.npubEncode(currentPubkey); } catch { return ''; } })()
		: ''
);

// liveQuery: communities (kind 10222)
$effect(() => {
	if (!browser) return;
	const since = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
	const sub = liveQuery(async () => {
		const events = await queryEvents({ kinds: [EVENT_KINDS.COMMUNITY], limit: 100, since });
		return events.map((e) => ({ raw: e, ...parseCommunity(e) })).filter(Boolean);
	}).subscribe({
		next: (val) => { communities = val ?? []; },
		error: (e) => console.error('[Layout] communities liveQuery error', e)
	});
	return () => sub.unsubscribe();
});

// liveQuery: profiles for community pubkeys + current user
$effect(() => {
	if (!browser) return;
	const pubkeys = [...new Set([
		...communities.map((c) => c.pubkey),
		...(currentPubkey ? [currentPubkey] : [])
	])];
	if (pubkeys.length === 0) return;
	const sub = liveQuery(async () => {
		const events = await queryEvents({ kinds: [EVENT_KINDS.PROFILE], authors: pubkeys, limit: 200 });
		const map = new Map();
		for (const e of events) {
			try {
				const p = parseProfile(e);
				map.set(e.pubkey, { ...p, content: e.content });
			} catch { map.set(e.pubkey, {}); }
		}
		return map;
	}).subscribe({
		next: (val) => { profilesByPubkey = val ?? new Map(); },
		error: (e) => console.error('[Layout] profiles liveQuery error', e)
	});
	return () => sub.unsubscribe();
});

// liveQuery: content counts + last activity per community (for sidebar cards)
$effect(() => {
	if (!browser || communities.length === 0) return;
	const pubkeySet = new Set(communities.map((c) => c.pubkey));
	const sub = liveQuery(async () => {
		const events = await queryEvents({
			kinds: [EVENT_KINDS.FORUM_POST, EVENT_KINDS.TASK, EVENT_KINDS.PROJECT, EVENT_KINDS.WIKI],
			limit: 2000
		});
		const forumBy = new Map(), taskBy = new Map(), projectBy = new Map(), wikiBy = new Map(), lastBy = new Map();
		for (const ev of events) {
			const h = ev.tags?.find((t) => t[0] === 'h')?.[1];
			if (!h || !pubkeySet.has(h)) continue;
			if (ev.kind === EVENT_KINDS.FORUM_POST) forumBy.set(h, (forumBy.get(h) || 0) + 1);
			else if (ev.kind === EVENT_KINDS.TASK) taskBy.set(h, (taskBy.get(h) || 0) + 1);
			else if (ev.kind === EVENT_KINDS.PROJECT) projectBy.set(h, (projectBy.get(h) || 0) + 1);
			else if (ev.kind === EVENT_KINDS.WIKI) wikiBy.set(h, (wikiBy.get(h) || 0) + 1);
			const ts = ev.created_at;
			if (!lastBy.has(h) || ts > lastBy.get(h)) lastBy.set(h, ts);
		}
		return { forumBy, taskBy, projectBy, wikiBy, lastBy };
	}).subscribe({
		next: (val) => {
			if (val) {
				forumCountByPubkey = val.forumBy;
				taskCountByPubkey = val.taskBy;
				projectCountByPubkey = val.projectBy;
				wikiCountByPubkey = val.wikiBy;
				lastActivityByPubkey = val.lastBy;
			}
		},
		error: (e) => console.error('[Layout] content counts error', e)
	});
	return () => sub.unsubscribe();
});

const CHATEAU_DEFAULT_NPUB = 'npub1vcxcc7r9racyslkfhrwu9qlznne9v95nmk3m5frd8lfuprdmwzpsxqzqcr';

// Auto-select default community on desktop when landing on /communities with no community selected.
// Guard: only fires on the /communities index page, NOT on wiki/forum/task/project routes
// (those routes have no communityNpub by design).
$effect(() => {
	if (!browser || communityNpub || typeof window === 'undefined') return;
	if ($page.url.pathname !== '/communities') return;
	if (window.innerWidth >= 768) {
		goto(`/community/${encodeURIComponent(CHATEAU_DEFAULT_NPUB)}`, { replaceState: true });
	}
});

function selectCommunity(npub) {
	goto(`/community/${encodeURIComponent(npub)}`);
}
</script>

<main class="communities-layout" class:right-open={rightOpen}>
	<!-- Left column: persistent across all child route navigations -->
	<aside class="left-column">
		<header class="left-header">
			{#if currentPubkey}
				<div class="profile-menu-wrap">
					<button
						type="button"
						class="profile-menu-btn"
						onclick={() => (profileDropdownOpen = !profileDropdownOpen)}
						aria-label="Profile menu"
						aria-haspopup="menu"
						aria-expanded={profileDropdownOpen}
					>
						<ProfilePic
							pictureUrl={currentUserProfileContent?.picture}
							name={currentUserProfileContent?.display_name ?? currentUserProfileContent?.name}
							pubkey={currentUserNpub}
							size="bubble"
						/>
					</button>

					{#if profileDropdownOpen}
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div class="profile-menu-backdrop" onclick={() => (profileDropdownOpen = false)} role="presentation"></div>
						<div class="profile-menu" role="menu">
							<div class="profile-menu-info">
								<span class="profile-menu-name">
									{currentUserProfileContent?.display_name ?? currentUserProfileContent?.name ?? 'Anonymous'}
								</span>
								<span class="profile-menu-npub">{currentUserNpub.slice(0, 12)}…</span>
							</div>
							<div class="profile-menu-divider"></div>
							<button type="button" class="profile-menu-item" role="menuitem" onclick={handleAddProfile}>
								<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
									<circle cx="7" cy="7" r="6.5" stroke="currentColor" stroke-width="1.2" />
									<line x1="7" y1="4" x2="7" y2="10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
									<line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
								</svg>
								Add profile
							</button>
							<div class="profile-menu-divider"></div>
							<button type="button" class="profile-menu-item profile-menu-item--danger" role="menuitem" onclick={handleSignOut}>
								<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
									<path d="M5 2H2.5A1.5 1.5 0 0 0 1 3.5v7A1.5 1.5 0 0 0 2.5 12H5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
									<path d="M9 4l3 3-3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
									<line x1="12" y1="7" x2="5" y2="7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
								</svg>
								Disconnect
							</button>
						</div>
					{/if}
				</div>
			{:else}
				<button type="button" class="profile-menu-btn" onclick={() => { getStartedModalOpen = true; }} aria-label="Get started">
					<ProfilePic size="bubble" />
				</button>
			{/if}
			<button type="button" class="left-search-wrap" aria-label="Search / Command">
				<Search variant="outline" size={16} strokeWidth={1.4} color="hsl(var(--white33))" />
				<span class="left-search-text">Search / Command</span>
			</button>
			<button type="button" class="plus-btn" aria-label="Create community" tabindex="-1">
				<Plus variant="outline" size={14} strokeWidth={2.8} color="hsl(var(--white33))" />
			</button>
		</header>

		<div class="communities-list">
			{#if filteredCommunities.length === 0}
				<p class="left-empty">No communities yet.</p>
			{:else}
				{#each filteredCommunities as comm, i}
					{@const npub = (() => { try { return nip19.npubEncode(comm.pubkey); } catch { return ''; } })()}
					{@const profile = profilesByPubkey.get(comm.pubkey)}
					{@const displayName = profile?.content
						? (() => { try { const j = JSON.parse(profile.content); return j.display_name ?? j.name; } catch { return ''; } })()
						: ''}
					{@const lastTs = lastActivityByPubkey.get(comm.pubkey)}
					{#if i > 0}<div class="community-list-divider"></div>{/if}
					<CommunityCard
						pictureUrl={profile?.content
							? (() => { try { return JSON.parse(profile.content).picture; } catch { return null; } })()
							: null}
						name={displayName}
						pubkey={comm.pubkey}
						{lastTs}
						selected={communityNpub === npub}
						forumCount={forumCountByPubkey.get(comm.pubkey) ?? 0}
						taskCount={taskCountByPubkey.get(comm.pubkey) ?? 0}
						projectCount={projectCountByPubkey.get(comm.pubkey) ?? 0}
						wikiCount={wikiCountByPubkey.get(comm.pubkey) ?? 0}
						onclick={() => selectCommunity(npub)}
					/>
				{/each}
			{/if}
		</div>
	</aside>

	<!-- Right column: each child route renders its own content here -->
	<div class="right-column">
		<div class="right-page-viewport">
			{@render children()}
		</div>
	</div>
</main>

<!-- Onboarding modal chain — triggered from profile button above -->
<GetStartedModal
	bind:open={getStartedModalOpen}
	onstart={handleGetStartedStart}
	onconnected={() => { getStartedModalOpen = false; }}
/>
<SpinKeyModal
	bind:open={spinKeyModalOpen}
	profileName={onboardingProfileName}
	zIndex={55}
	onspinComplete={handleSpinComplete}
	onuseExistingKey={handleUseExistingKey}
/>
<OnboardingBuildingModal bind:open={onboardingBuildingModalOpen} zIndex={56} />

<style>
	.communities-layout {
		display: grid;
		grid-template-columns: 360px 1fr;
		height: 100vh;
		min-height: 0;
	}
	.left-column {
		display: flex;
		flex-direction: column;
		border-right: 1px solid hsl(var(--white11));
		min-width: 0;
	}
	.left-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		flex-shrink: 0;
	}
	/* Profile dropdown */
	.profile-menu-wrap {
		position: relative;
		flex-shrink: 0;
	}
	.profile-menu-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		transition: opacity 0.15s;
	}
	.profile-menu-btn:hover { opacity: 0.85; }
	.profile-menu-btn:active { opacity: 0.7; }
	.profile-menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 49;
		background: transparent;
		cursor: default;
	}
	.profile-menu {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		z-index: 50;
		min-width: 200px;
		background: hsl(var(--card));
		border: 0.33px solid hsl(var(--white16));
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		overflow: hidden;
	}
	.profile-menu-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 12px 14px 10px;
	}
	.profile-menu-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--white));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.profile-menu-npub {
		font-size: 0.75rem;
		font-weight: 400;
		color: hsl(var(--white33));
		font-family: monospace;
	}
	.profile-menu-divider {
		height: 0.33px;
		background: hsl(var(--white16));
		margin: 0;
	}
	.profile-menu-item {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		padding: 10px 14px;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		text-align: left;
		transition: background 0.1s ease, color 0.1s ease;
	}
	.profile-menu-item:hover { background: hsl(var(--white4)); color: hsl(var(--white)); }
	.profile-menu-item--danger { color: hsl(var(--destructive)); }
	.profile-menu-item--danger:hover { background: hsl(var(--destructive) / 0.1); color: hsl(var(--destructive)); }

	.left-search-wrap {
		flex: 1;
		min-width: 0;
		height: 32px;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0 12px;
		border: 0.33px solid hsl(var(--white16));
		border-radius: 12px;
		background: transparent;
		color: hsl(var(--foreground));
		cursor: pointer;
		text-align: left;
	}
	.left-search-wrap:hover { background: transparent; }
	.left-search-text {
		font-size: 0.875rem;
		color: hsl(var(--white33));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.plus-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 12px;
		background: hsl(var(--card));
		flex-shrink: 0;
		cursor: pointer;
		color: inherit;
	}
	.plus-btn:hover { background: hsl(var(--card)); }
	.communities-list {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow-y: auto;
		padding: 0;
	}
	.community-list-divider {
		width: 100%;
		height: 1px;
		background: hsl(var(--white4));
		flex-shrink: 0;
	}
	.left-empty {
		padding: 16px;
		font-size: 0.875rem;
		color: hsl(var(--white33));
	}
	.right-column {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		position: relative;
	}
	/* Viewport creates containing block: fixed modals/bars are scoped and centred to this column */
	.right-page-viewport {
		position: relative;
		transform: translateZ(0);
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* Mobile: single column */
	@media (max-width: 767px) {
		.communities-layout { grid-template-columns: 1fr; }
		.left-column {
			border-right: none;
			height: 100dvh;
			overflow-y: auto;
		}
		.right-column { display: none; }
		/* Community selected or on content route: show right, hide left */
		.communities-layout.right-open .left-column { display: none; }
		.communities-layout.right-open .right-column {
			display: flex;
			flex-direction: column;
			height: 100dvh;
		}
		.right-page-viewport { transform: none; }
	}
</style>

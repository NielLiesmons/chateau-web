<script lang="js">
	/**
	 * Single-community view (mobile: full screen; desktop: redirects to /communities?c=).
	 */
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { nip19 } from 'nostr-tools';
	import { ChevronLeft } from 'lucide-svelte';
	import { liveQuery, queryEvents, queryEvent, putEvents } from '$lib/nostr';
	import { parseCommunity, parseProfileList, parseForumPost, parseProfile } from '$lib/nostr';
	import {
		fetchProfileListFromRelays,
		fetchFormTemplateFromRelays,
		fetchCommunityForumPosts,
		subscribeCommunityForumPosts,
		publishToRelays
	} from '$lib/nostr';
	import { parseFormTemplate } from '$lib/nostr';
	import { DEFAULT_COMMUNITY_RELAYS, EVENT_KINDS } from '$lib/config';
	import { getCurrentPubkey, signEvent, encrypt44 } from '$lib/stores/auth.svelte.js';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import ForumPost from '$lib/components/ForumPost.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import CommunityBottomBar from '$lib/components/community/CommunityBottomBar.svelte';
	import ForumPostModal from '$lib/components/modals/ForumPostModal.svelte';

	const SECTION_PILLS = [
		{ id: 'forum', label: 'Forum' },
		{ id: 'tasks', label: 'Tasks' },
		{ id: 'chat', label: 'Chat' },
		{ id: 'apps', label: 'Apps' }
	];

	const communityNpubParam = $derived($page.params.communityNpub || '');
	const currentPubkey = $derived(getCurrentPubkey());

	let communityPubkey = $state('');
	let community = $state(null);
	let communityProfile = $state(null);
	let selectedSection = $state('forum');
	let forumPosts = $state([]);
	let forumMembers = $state([]);
	let profileListEvent = $state(null);
	let profilesByPubkey = $state(new Map());
	let forumUnsub = $state(null);
	let joinModalOpen = $state(false);
	let joinFormTemplate = $state(null);
	let joinMessage = $state('');
	let joinSubmitting = $state(false);
	let joinError = $state('');
	let joinFetched = $state(false);
	let addPostModalOpen = $state(false);

	function openCreatePost() {
		addPostModalOpen = true;
	}

	function closeCreatePost() {
		addPostModalOpen = false;
	}

	async function handleForumPostSubmit({ title, text, labels = /** @type {string[]} */ ([]) }) {
		if (!communityPubkey || !currentPubkey) throw new Error('Not signed in');
		const ev = await signEvent({
			kind: EVENT_KINDS.FORUM_POST,
			content: text,
			tags: [
				['h', communityPubkey],
				['title', title],
				...labels.map(l => /** @type {[string, string]} */ (['t', l]))
			],
			created_at: Math.floor(Date.now() / 1000)
		});
		await putEvents([ev]);
		const relays = community?.relays?.length ? community.relays : DEFAULT_COMMUNITY_RELAYS;
		await publishToRelays(relays, ev);
	}
	const formAddress = $derived(profileListEvent ? parseProfileList(profileListEvent)?.form : null);

	$effect(() => {
		if (!joinModalOpen) {
			joinFormTemplate = null;
			joinFetched = false;
			joinMessage = '';
			joinError = '';
			return;
		}
		if (!formAddress || !communityPubkey || joinFetched) return;
		joinFetched = true;
		joinFormTemplate = null;
		joinError = '';
		const parts = formAddress.split(':');
		const formPubkey = parts[1];
		const formD = parts.length >= 3 ? parts.slice(2).join(':') : '';
		const relays = community?.relays?.length ? community.relays : DEFAULT_COMMUNITY_RELAYS;
		(async () => {
			try {
				let ev = await queryEvent({
					kinds: [EVENT_KINDS.FORM_TEMPLATE],
					authors: [formPubkey],
					'#d': [formD]
				});
				if (!ev) {
					ev = await fetchFormTemplateFromRelays(relays, formAddress);
					if (ev) await putEvents([ev]);
				}
				joinFormTemplate = ev;
			} catch (e) {
				joinError = e?.message || 'Failed to load form';
			}
		})();
	});

	async function submitJoinForm() {
		if (!formAddress || !communityPubkey || !currentPubkey) return;
		joinSubmitting = true;
		joinError = '';
		try {
			const plaintext = joinMessage.trim() || ' ';
			const content = await encrypt44(communityPubkey, plaintext);
			const relays = community?.relays?.length ? community.relays : DEFAULT_COMMUNITY_RELAYS;
			const template = {
				kind: EVENT_KINDS.FORM_RESPONSE,
				content,
				tags: [
					['a', formAddress],
					['p', communityPubkey]
				],
				created_at: Math.floor(Date.now() / 1000)
			};
			const signed = await signEvent(template);
			await publishToRelays(relays, signed);
			joinModalOpen = false;
			joinMessage = '';
		} catch (e) {
			joinError = e?.message || 'Failed to submit';
		} finally {
			joinSubmitting = false;
		}
	}

	// Decode npub from param
	$effect(() => {
		if (!communityNpubParam || !browser) return;
		try {
			const decoded = nip19.decode(decodeURIComponent(communityNpubParam));
			if (decoded.type === 'npub') communityPubkey = decoded.data;
			else communityPubkey = '';
		} catch {
			communityPubkey = '';
		}
	});

	// Desktop: redirect to /communities?c=
	$effect(() => {
		if (!browser || !communityNpubParam) return;
		const mq = window.matchMedia('(min-width: 768px)');
		if (mq.matches) {
			goto(`/communities?c=${encodeURIComponent(communityNpubParam)}`, { replaceState: true });
		}
	});

	// Load community (10222) and profile (0)
	$effect(() => {
		if (!browser || !communityPubkey) return;
		const sub = liveQuery(async () => {
			const [commEvents, profileEvents] = await Promise.all([
				queryEvents({ kinds: [EVENT_KINDS.COMMUNITY], authors: [communityPubkey], limit: 1 }),
				queryEvents({ kinds: [EVENT_KINDS.PROFILE], authors: [communityPubkey], limit: 1 })
			]);
			const comm = commEvents[0] ? { raw: commEvents[0], ...parseCommunity(commEvents[0]) } : null;
			const profile = profileEvents[0];
			let profileData = null;
			if (profile?.content) {
				try {
					const j = JSON.parse(profile.content);
					profileData = { display_name: j.display_name ?? j.name, name: j.name, picture: j.picture };
				} catch {}
			}
			return { comm, profileData };
		}).subscribe({
			next: (val) => {
				if (val?.comm) community = val.comm;
				else community = null;
				if (val?.profileData) communityProfile = val.profileData;
				else communityProfile = null;
			},
			error: (e) => console.error('[Community] load error', e)
		});
		return () => sub.unsubscribe();
	});

	// Load profile list for Forum + forum posts
	$effect(() => {
		if (!browser || !community?.sections?.length) return;
		const forumSection = community.sections.find((s) => s.name?.toLowerCase() === 'forum');
		if (!forumSection?.profileListAddress) return;
		const relays = community.relays?.length ? community.relays : DEFAULT_COMMUNITY_RELAYS;
		const parts = forumSection.profileListAddress.split(':');
		const dTag = parts.length >= 3 ? parts.slice(2).join(':') : '';
		(async () => {
			let listEvent = await queryEvent({
				kinds: [EVENT_KINDS.PROFILE_LIST],
				authors: [communityPubkey],
				'#d': [dTag]
			});
			if (!listEvent) {
				listEvent = await fetchProfileListFromRelays(relays, forumSection.profileListAddress);
				if (listEvent) await putEvents([listEvent]);
			}
			profileListEvent = listEvent;
			const parsed = listEvent ? parseProfileList(listEvent) : null;
			forumMembers = parsed?.members || [];
			const authorPubkeys = forumMembers.length > 0 ? forumMembers : undefined;
			const posts = await fetchCommunityForumPosts(relays, communityPubkey, authorPubkeys);
			if (posts.length) await putEvents(posts);
			const unsub = subscribeCommunityForumPosts(relays, communityPubkey, forumMembers, (ev) => putEvents([ev]));
			forumUnsub = unsub;
		})();
		return () => {
			if (forumUnsub) {
				forumUnsub();
				forumUnsub = null;
			}
		};
	});

	// liveQuery forum posts
	$effect(() => {
		if (!browser || !communityPubkey || forumMembers.length === 0) return;
		const sub = liveQuery(async () => {
			const filter = {
				kinds: [EVENT_KINDS.FORUM_POST],
				'#h': [communityPubkey],
				limit: 100
			};
			if (forumMembers.length > 0) filter.authors = forumMembers;
			const events = await queryEvents(filter);
			return events.map((e) => parseForumPost(e)).filter(Boolean);
		}).subscribe({
			next: (val) => {
				forumPosts = val || [];
			},
			error: (e) => console.error('[Community] forum liveQuery error', e)
		});
		return () => sub.unsubscribe();
	});

	// Profiles for post authors
	$effect(() => {
		if (!browser || forumPosts.length === 0) return;
		const pubkeys = [...new Set(forumPosts.map((p) => p.pubkey))];
		const sub = liveQuery(async () => {
			const events = await queryEvents({ kinds: [EVENT_KINDS.PROFILE], authors: pubkeys, limit: 200 });
			const map = new Map();
			for (const e of events) {
				try {
					const p = parseProfile(e);
					map.set(e.pubkey, { ...p, content: e.content });
				} catch {
					map.set(e.pubkey, {});
				}
			}
			return map;
		}).subscribe({
			next: (val) => {
				profilesByPubkey = val || new Map();
			},
			error: () => {}
		});
		return () => sub.unsubscribe();
	});

	const isMember = $derived(currentPubkey && forumMembers.includes(currentPubkey));
	const hasForm = $derived(profileListEvent && parseProfileList(profileListEvent)?.form);
	const isAdmin = $derived(!!communityPubkey && !!currentPubkey && communityPubkey === currentPubkey);
	const displayName = $derived(
		communityProfile?.display_name ?? communityProfile?.name ?? 'Unnamed'
	);

	function formatDate(ts) {
		if (!ts) return '';
		return new Date(ts * 1000).toLocaleDateString(undefined, { dateStyle: 'short' });
	}
	function openPost(eventId) {
		goto(`/communities/${encodeURIComponent(communityNpubParam)}/forum/${eventId}`);
	}
</script>

<svelte:head>
	<title>{displayName} - Chateau</title>
</svelte:head>

{#if !community && communityPubkey}
	<main class="community-mobile-page">
		<EmptyState message="Loading…" minHeight={200} />
	</main>
{:else if !community}
	<main class="community-mobile-page">
		<EmptyState message="Community not found" minHeight={200} />
	</main>
{:else}
	<main class="community-mobile-page">
		<header class="panel-header">
			<div class="panel-header-row">
				<a href="/communities" class="back-link">
					<ChevronLeft size={24} />
				</a>
				<h1 class="community-display-name">{displayName}</h1>
			</div>
		</header>
		<div class="tab-row pills-row">
			{#each SECTION_PILLS as pill}
				<button
					type="button"
					class={selectedSection === pill.id ? 'btn-primary-small tab-selected' : 'btn-secondary-small'}
					onclick={() => (selectedSection = pill.id)}
				>
					{pill.label}
				</button>
			{/each}
		</div>
		<div class="panel-content">
			{#if selectedSection === 'forum'}
				{#if forumPosts.length === 0}
					<EmptyState message="No forum posts yet" minHeight={200} />
				{:else}
					{#each forumPosts as post}
						{@const authorProfile = profilesByPubkey.get(post.pubkey)}
						{@const authorContent = authorProfile?.content ? (() => { try { return JSON.parse(authorProfile.content); } catch { return {}; } })() : {}}
						<ForumPost
							author={{
								name: authorContent.display_name ?? authorContent.name,
								picture: authorContent.picture,
								npub: (() => { try { return nip19.npubEncode(post.pubkey); } catch { return ''; } })()
							}}
							title={post.title}
							content={post.content}
							timestamp={formatDate(post.createdAt)}
							labels={[]}
							onClick={() => openPost(post.id)}
						/>
					{/each}
				{/if}
			{:else}
				<EmptyState message="{SECTION_PILLS.find((p) => p.id === selectedSection)?.label ?? selectedSection} coming soon" minHeight={200} />
			{/if}
		</div>
		<CommunityBottomBar
			isMember={isMember}
			hasForm={hasForm}
			communityName={displayName}
			modalOpen={addPostModalOpen}
			onJoin={() => (joinModalOpen = true)}
			onComment={() => {}}
			onZap={() => {}}
			onAdd={openCreatePost}
		/>
	</main>
{/if}

<ForumPostModal
	bind:isOpen={addPostModalOpen}
	communityName={community?.displayName ?? community?.name ?? ''}
	getCurrentPubkey={getCurrentPubkey}
	onsubmit={handleForumPostSubmit}
	onclose={closeCreatePost}
/>

{#if joinModalOpen}
	<div
		class="join-modal-backdrop"
		role="button"
		tabindex="-1"
		onclick={() => (joinModalOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (joinModalOpen = false)}
	>
		<div class="join-modal" role="dialog" aria-modal="true" aria-labelledby="join-modal-title-m" tabindex="0" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<h3 id="join-modal-title-m">Join</h3>
			{#if !currentPubkey}
				<p class="text-sm text-muted-foreground">Add a profile to request access.</p>
				<button type="button" class="btn-secondary-small" onclick={() => (joinModalOpen = false)}>Close</button>
			{:else if joinError && !joinFormTemplate}
				<p class="text-sm text-red-500">{joinError}</p>
				<button type="button" class="btn-secondary-small" onclick={() => (joinModalOpen = false)}>Close</button>
			{:else if joinFormTemplate === null}
				<p class="text-sm text-muted-foreground">Loading form…</p>
				<button type="button" class="btn-secondary-small" onclick={() => (joinModalOpen = false)}>Cancel</button>
			{:else}
				{@const form = parseFormTemplate(joinFormTemplate)}
				{#if form?.name}
					<p class="text-sm text-muted-foreground">{form.name}</p>
				{/if}
				<form class="join-form" onsubmit={(e) => { e.preventDefault(); submitJoinForm(); }}>
					<label for="join-message-m" class="join-label">Message (optional)</label>
					<textarea id="join-message-m" class="join-textarea" placeholder="Why do you want to join?" bind:value={joinMessage} rows="3" disabled={joinSubmitting}></textarea>
					{#if joinError}
						<p class="text-sm text-red-500">{joinError}</p>
					{/if}
					<div class="join-modal-actions">
						<button type="button" class="btn-secondary-small" onclick={() => (joinModalOpen = false)} disabled={joinSubmitting}>Cancel</button>
						<button type="submit" class="btn-primary-small" disabled={joinSubmitting}>{joinSubmitting ? 'Submitting…' : 'Submit request'}</button>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}

<style>
	.community-mobile-page {
		display: flex;
		flex-direction: column;
		min-height: 100vh;
		min-height: 100dvh;
	}
	.panel-header {
		padding: 1rem 1.5rem;
		border-bottom: 1.4px solid hsl(var(--white11));
		flex-shrink: 0;
	}
	.panel-header-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}
	.back-link {
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--foreground));
		flex-shrink: 0;
	}
	.community-display-name {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tab-row.pills-row {
		display: flex;
		gap: 8px;
		padding: 0.75rem 1.5rem;
		border-bottom: 1px solid hsl(var(--white11));
		flex-shrink: 0;
	}
	.tab-row.pills-row :global(.tab-selected) {
		background-image: var(--gradient-blurple66);
	}
	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.5rem;
		padding-bottom: 100px;
	}
	.join-modal-backdrop {
		position: fixed;
		inset: 0;
		background: hsl(0 0% 0% / 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}
	.join-modal {
		background: hsl(var(--background));
		border: 0.33px solid hsl(var(--white16));
		border-radius: var(--radius-16);
		padding: 1.5rem;
		max-width: 400px;
		width: 90%;
	}
	.join-modal h3 { margin: 0 0 0.5rem; font-size: 1.25rem; }
	.join-form { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 0.5rem; }
	.join-label { font-size: 0.875rem; font-weight: 500; }
	.join-textarea {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 0.33px solid hsl(var(--white16));
		border-radius: var(--radius-16);
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
		resize: vertical;
	}
	.join-modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.25rem; }
	@media (min-width: 768px) {
		.community-mobile-page {
			/* Desktop: layout handled by redirect to /communities?c= */
			min-height: 0;
		}
	}
</style>

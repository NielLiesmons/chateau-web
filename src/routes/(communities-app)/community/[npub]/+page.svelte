<script module>
	// Module-level singleton: survives component unmount/remount within the same browser session.
	// Keyed by communityNpub so each community has its own entry.
	/** @type {Map<string, { selectedCommunity: any, forumPosts: any[], wikiEvents: any[], taskEvents: any[], projectEvents: any[], profilesByPubkey: Map<string, any> }>} */
	export const communityCache = new Map();
</script>

<script lang="js">
	// @ts-nocheck
	import { browser } from '$app/environment';
	import InputTextField from '$lib/components/common/InputTextField.svelte';
	import { page } from '$app/stores';
	import { goto, beforeNavigate } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import { navHandoff } from '$lib/navHandoff.js';
	import { nip19 } from 'nostr-tools';
	import { Plus } from '$lib/components/icons';
	import { liveQuery, queryEvents, queryEvent, putEvents } from '$lib/nostr';
	import {
		parseCommunity,
		parseProfileList,
		parseFormTemplate,
		parseForumPost,
		parseProfile,
		parseEventAddress
	} from '$lib/nostr';
	import {
		fetchEventsNoStore,
		fetchProfileListFromRelays,
		getLocalFormTemplate,
		fetchFreshFormTemplate,
		fetchCommunityForumPosts,
		subscribeCommunityForumPosts,
		subscribeForumPostComments,
		subscribeTaskComments,
		subscribeTaskStatuses,
		fetchFromRelays,
		fetchProfilesBatch,
		publishToRelays,
		fetchCommunityWikis,
		fetchCommunityProjects,
		fetchProjectMilestones,
		subscribeCommunityProjects,
		subscribeCommunityComments,
		parseProject,
		parseMilestone
	} from '$lib/nostr';
	import GetStartedModal from '$lib/components/modals/GetStartedModal.svelte';
	import SpinKeyModal from '$lib/components/modals/SpinKeyModal.svelte';
	import OnboardingBuildingModal from '$lib/components/modals/OnboardingBuildingModal.svelte';
	import {
		DEFAULT_COMMUNITY_RELAYS,
		COMMUNITY_WRITE_RELAYS,
		PROFILE_RELAYS,
		EVENT_KINDS
	} from '$lib/config';
	import { contentTypesFromKinds, CONTENT_TYPE_BY_SECTION } from '$lib/config/contentTypes.js';
	import { getCurrentPubkey, signEvent, encrypt44, decrypt44 } from '$lib/stores/auth.svelte.js';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import BackButton from '$lib/components/common/BackButton.svelte';
	import ForumPost from '$lib/components/ForumPostCard.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import CommunityBottomBar from '$lib/components/community/CommunityBottomBar.svelte';
	import WikiDetail from '$lib/components/community/WikiDetail.svelte';
	import ForumPostDetail from '$lib/components/community/ForumPostDetail.svelte';
	import TaskDetail from '$lib/components/community/TaskDetail.svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import ForumPostModal from '$lib/components/modals/ForumPostModal.svelte';
	import TaskModal from '$lib/components/modals/TaskModal.svelte';
	import WikiModal from '$lib/components/modals/WikiModal.svelte';
	import Checkbox from '$lib/components/common/Checkbox.svelte';
	import { Pen, Cross, Bell, ChevronRight, Crown } from '$lib/components/icons';
	import BadgeStack from '$lib/components/common/BadgeStack.svelte';
	import SingleBadge from '$lib/components/common/SingleBadge.svelte';
	import ProfilePicStack from '$lib/components/common/ProfilePicStack.svelte';
	import TaskCard from '$lib/components/TaskCard.svelte';
	import WikiCard from '$lib/components/WikiCard.svelte';
	import GeneralEventDetail from '$lib/components/community/GeneralEventDetail.svelte';
	import ProjectCard from '$lib/components/ProjectCard.svelte';
	import ProjectDetail from '$lib/components/community/ProjectDetail.svelte';
	import ProfileListDetail from '$lib/components/community/ProfileListDetail.svelte';
	import CommentCard from '$lib/components/community/CommentCard.svelte';
	import ListModal from '$lib/components/modals/ListModal.svelte';
	import ProjectModal from '$lib/components/modals/ProjectModal.svelte';

	const SECTION_PILLS = [
		{ id: 'forum', label: 'Forum', kinds: [11] },
		{ id: 'tasks', label: 'Tasks', kinds: [] },
		{ id: 'projects', label: 'Projects', kinds: [30315, 30316] },
		{ id: 'chat', label: 'Chat', kinds: [] },
		{ id: 'apps', label: 'Apps', kinds: [] }
	];

	/** Preset content sections for Admin tab: toggle on + set profile list address. Order: General first, then Forum, Chat, etc. */
	const ADMIN_SECTION_PRESETS = [
		{
			id: 'general',
			name: 'General',
			kinds: [1111, 7, 1985],
			description: 'Comments, reactions, labels'
		},
		{ id: 'forum', name: 'Forum', kinds: [11], description: 'Forum posts' },
		{ id: 'chat', name: 'Chat', kinds: [9], description: 'Chat messages' },
		{ id: 'tasks', name: 'Tasks', kinds: [30400], description: 'Tasks' },
		{
			id: 'projects',
			name: 'Projects',
			kinds: [30315, 30316],
			description: 'Projects & milestones'
		},
		{ id: 'apps', name: 'Apps', kinds: [32267], description: 'Apps' },
		{ id: 'docs', name: 'Docs', kinds: [30101], description: 'Docs' },
		{ id: 'wikis', name: 'Wikis', kinds: [30808], description: 'Wikis' },
		{ id: 'forms', name: 'Forms', kinds: [30168], description: 'Membership application forms' }
	];

	const communityNpub = $derived($page.params.npub || '');
	const openWikiSlug = $derived($page.url.searchParams.get('wiki') || '');
	// openPost/Task/Project/List are still supported as search params on /community/[npub]?wiki=slug etc.
	const openPostId = $derived($page.url.searchParams.get('post') || '');
	const openTaskId = $derived($page.url.searchParams.get('task') || '');
	const openProjectId = $derived($page.url.searchParams.get('project') || '');
	const openListAddr = $derived($page.url.searchParams.get('list') || '');

	// Community-agnostic event: cross-community ref opened via ?event=[naddr|nevent]
	const openEventEncoded = $derived($page.url.searchParams.get('event') || '');

	// wikiLinkFn: turns [[slug]] into a URL on this community page
	const wikiLinkFn = $derived(
		communityNpub
			? (/** @type {string} */ slug) =>
					`/community/${encodeURIComponent(communityNpub)}?wiki=${encodeURIComponent(slug)}`
			: undefined
	);

	const currentPubkey = $derived(getCurrentPubkey());

	// Synchronously read from module-level cache so frame-0 renders with real data.
	// onMount is too late — it fires AFTER the first render, causing a visible flash.
	const _initNpub = $page.params.npub ?? '';
	const _initCache = communityCache.get(_initNpub);

	let communities = $state([]);
	let profilesByPubkey = $state(_initCache ? new Map(_initCache.profilesByPubkey) : new Map());
	let selectedCommunity = $state(_initCache?.selectedCommunity ?? null);
	// Section is stored in the URL (?s=wikis) so browser back restores the exact tab.
	const selectedSection = $derived($page.url.searchParams.get('s') || 'forum');

	// --- Scroll-position save/restore ---
	// SvelteKit only restores window.scrollY; the actual scrollable element here is
	// .panel-content (overflow-y: auto inside the community page), so we do it manually.

	/** The scrollable content panel for the section list view. */
	function getScrollPanel() {
		return browser
			? /** @type {HTMLElement|null} */ (
					document.querySelector('.panel-content:not(.panel-content-detail)')
				)
			: null;
	}

	// Save scroll before navigating to a detail page (wiki / forum / task / project).
	beforeNavigate(({ to }) => {
		if (!browser) return;
		const toPath = to?.url?.pathname ?? '';
		const isDetailRoute =
			toPath.startsWith('/wiki/') ||
			toPath.startsWith('/forum/') ||
			toPath.startsWith('/task/') ||
			toPath.startsWith('/project/');
		if (!isDetailRoute) return;
		const panel = getScrollPanel();
		if (panel) {
			const key = `chateau-scroll:${$page.url.pathname}${$page.url.search}`;
			sessionStorage.setItem(key, String(panel.scrollTop));
		}
	});

	// Restore scroll position after browser back from a detail page.
	onMount(async () => {
		if (!browser) return;
		const scrollKey = `chateau-scroll:${$page.url.pathname}${$page.url.search}`;
		const saved = sessionStorage.getItem(scrollKey);
		if (!saved) return;
		const target = Number(saved);
		sessionStorage.removeItem(scrollKey);

		const tryRestore = () => {
			const panel = getScrollPanel();
			if (panel) panel.scrollTop = target;
		};

		await tick();
		tryRestore();
		setTimeout(tryRestore, 200);
	});

	let forumPosts = $state(_initCache ? [..._initCache.forumPosts] : []);
	let forumMembers = $state([]);
	/** @type {import('nostr-tools').NostrEvent[]} */
	let taskEvents = $state(_initCache ? [..._initCache.taskEvents] : []);
	let wikiEvents = $state(_initCache ? [..._initCache.wikiEvents] : []);
	/** @type {import('nostr-tools').NostrEvent[]} */
	let projectEvents = $state(_initCache ? [..._initCache.projectEvents] : []);
	/** @type {Map<string, import('nostr-tools').NostrEvent[]>} milestones keyed by project id */
	let milestonesByProjectId = $state(new Map());
	/** @type {Map<string, string>} milestone addr → normalised status string */
	let milestoneStatusMap = $state(new Map());
	/** @type {import('nostr-tools').NostrEvent[]} kind:1111 comments for the Activity tab */
	let activityComments = $state([]);
	/** @type {Map<string, import('nostr-tools').NostrEvent>} root event id/addr → root event */
	let activityRootEvents = $state(new Map());
	/** @type {Map<string, import('nostr-tools').NostrEvent>} comment id → comment event (for parent lookup) */
	let activityCommentMap = $derived.by(() => {
		const m = new Map();
		for (const ev of activityComments) m.set(ev.id, ev);
		return m;
	});

	let projectModalOpen = $state(false);
	/** @type {Map<string, import('nostr-tools').NostrEvent>} */
	let taskStatusMap = $state(new Map());
	let profileListEvent = $state(null);
	let forumUnsub = $state(null);
	let joinModalOpen = $state(false);
	let joinContext = $state(null); // section id ('forum', 'tasks', …) or null for generic
	let joinStep = $state('list'); // 'list' | 'form' | 'done'
	let joinableLists = $state([]);
	let selectedJoinList = $state(null); // { formAddress, listName }
	let joinFormTemplate = $state(null);
	let joinFormLoading = $state(false);
	let joinParsedForm = $state(/** @type {ReturnType<typeof parseFormTemplate>} */ (null));
	let joinMessage = $state('');
	/** @type {Record<string, string>} */
	let joinFieldValues = $state({});
	let joinConfirmationMessage = $state('');
	let joinSubmitting = $state(false);
	let joinError = $state('');
	/** @deprecated use joinFormLoading instead — kept for legacy guard compat */
	let joinFetched = $state(false);
	/** @type {Map<string, { pubkey: string; displayName?: string; avatarUrl?: string }[]>} */
	let commentersByPostId = $state(new Map());
	/** @type {Map<string, { pubkey: string; name?: string; pictureUrl?: string }[]>} */
	let commentersByTaskId = $state(new Map());
	/**
	 * Allowed commenter pubkeys from the General-section profile list.
	 * Mirrors ForumPostDetail.allowedCommenters so feed and detail filters are identical.
	 * undefined = still resolving; null = no filter (enforced relay / no General section); string[] = filter list.
	 */
	let generalMembers = $state(/** @type {string[] | null | undefined} */ (undefined));
	let communityInfoModalOpen = $state(false);
	let communityInfoShowDetails = $state(false);
	/** When community info modal is open, sections with list name for display */
	let communityModalSections = $state([]); // { sectionName, listName, listAddress }[]
	let communityEditModalOpen = $state(false);
	let communityEditTarget = $state(null); // 'picture' | 'name' | 'description' | 'relays' | 'section-N'
	let communityEditPicture = $state('');
	let communityEditName = $state('');
	let communityEditDescription = $state('');
	let communityEditRelays = $state('');
	let communityEditRelayEnforced = $state(false);
	let communityEditBlossom = $state('');
	let communityEditSectionName = $state('');
	let communityEditSectionListAddress = $state('');
	let communityEditSubmitting = $state(false);
	let communityEditError = $state('');
	let addPostModalOpen = $state(false);
	let addTaskModalOpen = $state(false);
	/** @type {string|null} status key to pre-select when opening TaskModal from a group header */
	let newTaskInitialStatus = $state(null);
	let addWikiModalOpen = $state(false);
	let addListModalOpen = $state(false);
	// Onboarding modals (for logged-out Get Started flow)
	let getStartedModalOpen = $state(false);
	let spinKeyModalOpen = $state(false);
	let onboardingBuildingModalOpen = $state(false);
	let onboardingProfileName = $state('');
	let newPostTitle = $state('');
	let newPostContent = $state('');
	let newPostLabels = $state([]);
	let newPostLabelInput = $state('');
	let newPostSubmitting = $state(false);
	let _newPostError = $state('');
	let membersListData = $state([]); // { listAddress, listEvent, parsed, sectionName }[] — loaded in background when Members tab selected
	let joinRequestsCount = $state(0);
	let joinRequestsModalOpen = $state(false);
	let listViewMoreModal = $state(null); // { listAddress, listEvent, parsed } or null
	let listViewMoreAddInput = $state('');
	let listViewMoreAddError = $state('');
	let listViewMoreAddSubmitting = $state(false);
	let _listViewMoreEditFormOpen = $state(false);
	let joinRequestsList = $state([]);
	let joinRequestsDecrypted = $state(new Map());
	let joinRequestsApprovingId = $state(null);
	/** Unified list form modal: null | { mode: 'add' } | { mode: 'edit', listAddress, listEvent, parsed }. Same fields for add and edit. */
	let listFormModal = $state(null);
	let listFormName = $state('');
	let listFormImage = $state('');
	let listFormDescription = $state('');
	let listFormFormAddress = $state('');
	let listFormSubmitting = $state(false);
	let listFormError = $state('');
	/** Admin tab: single-save form state */
	let adminPicture = $state('');
	let adminName = $state('');
	let adminDescription = $state('');
	let adminRelays = $state('');
	let adminRelayEnforced = $state(false);
	let adminBlossom = $state('');
	/** Preset id -> enabled (boolean) */
	let adminSectionEnabled = $state({});
	/** Preset id -> array of profile list addresses (30000:pubkey:d-tag) */
	let adminSectionListAddress = $state({});
	/** When set, list picker modal is open for this preset id */
	let adminListPickerPresetId = $state(null);
	let adminSaveSubmitting = $state(false);
	let adminSaveError = $state('');
	/** When on Admin tab, we only sync form from community when entering Admin or when community (pubkey) changes; avoids overwriting user edits when selectedCommunity updates reactively. */
	let lastAdminSyncedPubkey = $state(null);
	/** When on Admin tab, existing profile lists (kind 30000) by this community — for dropdown instead of pasting addresses. */
	let adminProfileLists = $state([]); // { listAddress, name, image?, listEvent?, parsed? }[]
	/** Preset id when section detail modal is open (list picker + delete); null when closed */
	let adminSectionModalPresetId = $state(null);
	/** When true, show "Add content section" modal (enable a preset or custom) */
	let adminAddSectionOpen = $state(false);


	// Form Template management (kind 30168)
	let adminFormTemplates = $state(
		/** @type {Array<{event: any, parsed: any, formAddr: string, linkedLists: string[]}>} */ ([])
	);
	let formTemplateModal = $state(
		/** @type {null | {mode: string, event?: any, parsed?: any}} */ (null)
	);
	let formTemplateName = $state('');
	let formTemplateDescription = $state('');
	let formTemplateDTag = $state('');
	let formTemplateConfirmMsg = $state('');
	let formTemplatePublic = $state(false);
	/** @type {Array<{id: string, type: string, label: string, defaultValue: string, required: boolean, placeholder: string, selectOptions: string[]}>} */
	let formTemplateFields = $state([]);
	let formTemplateSubmitting = $state(false);
	let formTemplateError = $state('');

	// Bootstrap: when landing directly on a community page with empty Dexie (fresh browser),
	// fetch that specific community by pubkey so the page loads without having to wait for the
	// global startLiveSubscriptions() subscription to discover it.
	// Runs only while communities list is empty; stops as soon as any community is in Dexie.
	$effect(() => {
		if (!browser || !communityNpub || communities.length > 0) return;
		let cancelled = false;
		try {
			const decoded = nip19.decode(communityNpub);
			if (decoded.type !== 'npub') return;
			const pubkey = decoded.data;
			fetchFromRelays(DEFAULT_COMMUNITY_RELAYS, {
				kinds: [EVENT_KINDS.COMMUNITY],
				authors: [pubkey],
				limit: 5
			})
				.then((events) => {
					if (cancelled || !events.length) return;
					putEvents(events);
				})
				.catch(() => {});
		} catch {
			/* invalid npub, ignore */
		}
		return () => {
			cancelled = true;
		};
	});

	// Resolve selected community (event + profile) from npub
	$effect(() => {
		if (!browser) return;
		if (!communityNpub) {
			selectedCommunity = null;
			return;
		}
		// If communities haven't loaded yet, keep any cached value to avoid a flash.
		if (communities.length === 0) return;
		try {
			const decoded = nip19.decode(communityNpub);
			if (decoded.type !== 'npub') return;
			const pubkey = decoded.data;
			const comm = communities.find((c) => c.pubkey === pubkey);
			const profile = profilesByPubkey.get(pubkey);
			selectedCommunity = comm
				? (() => {
						let content = {};
						try {
							content = profile?.content ? JSON.parse(profile.content || '{}') : {};
						} catch {}
						return {
							...comm,
							npub: communityNpub,
							displayName:
								profile?.display_name ??
								profile?.name ??
								content.display_name ??
								content.name ??
								null,
							name: profile?.name ?? content.name ?? null,
							picture: profile?.picture ?? content.picture ?? null,
							about: profile?.about ?? content.about ?? content.description ?? null
						};
					})()
				: null;
		} catch {
			selectedCommunity = null;
		}
	});

	// liveQuery: communities (10222) — last 30 days
	$effect(() => {
		if (!browser) return;
		const since = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
		const sub = liveQuery(async () => {
			const events = await queryEvents({
				kinds: [EVENT_KINDS.COMMUNITY],
				limit: 100,
				since
			});
			return events.map((e) => ({ raw: e, ...parseCommunity(e) })).filter(Boolean);
		}).subscribe({
			next: (val) => {
				communities = val || [];
			},
			error: (e) => console.error('[Communities] liveQuery error', e)
		});
		return () => sub.unsubscribe();
	});

	// Tracks all author/assignee pubkeys from forum posts + tasks, for profile fetching
	let contentPubkeys = $state(/** @type {Set<string>} */ (new Set()));
	// Tracks pubkeys already submitted to relay fetch (plain var — not reactive, survives re-renders)
	const _profileFetchQueue = new Set();

	// When forumPosts or taskEvents change, collect new pubkeys and fetch from relays if missing
	$effect(() => {
		if (!browser) return;
		const newPks = new Set();
		for (const p of forumPosts) if (p?.pubkey) newPks.add(p.pubkey);
		for (const t of taskEvents) {
			if (t?.pubkey) newPks.add(t.pubkey);
			for (const tag of t.tags ?? []) {
				if (tag[0] === 'p' && tag[1]) newPks.add(tag[1]);
			}
		}
		if (newPks.size === 0) return;
		let hasNew = false;
		for (const pk of newPks) {
			if (!contentPubkeys.has(pk)) {
				hasNew = true;
				break;
			}
		}
		if (!hasNew) return;
		contentPubkeys = new Set([...contentPubkeys, ...newPks]);
		const toFetch = [...newPks].filter((pk) => !_profileFetchQueue.has(pk));
		if (toFetch.length === 0) return;
		toFetch.forEach((pk) => _profileFetchQueue.add(pk));
		fetchProfilesBatch(toFetch)
			.then((results) => {
				const evs = [...results.values()].filter(Boolean);
				if (evs.length > 0) putEvents(evs);
			})
			.catch(() => {});
	});

	// When membersListData loads (community info modal open), fetch profiles for list members
	$effect(() => {
		if (!browser || membersListData.length === 0) return;
		const newPks = new Set();
		for (const item of membersListData) {
			for (const pk of item.parsed?.members ?? []) {
				if (pk) newPks.add(pk);
			}
		}
		if (newPks.size === 0) return;
		let hasNew = false;
		for (const pk of newPks) {
			if (!contentPubkeys.has(pk)) {
				hasNew = true;
				break;
			}
		}
		if (!hasNew) return;
		contentPubkeys = new Set([...contentPubkeys, ...newPks]);
		const toFetch = /** @type {string[]} */ (
			[...newPks].filter((pk) => !_profileFetchQueue.has(pk))
		);
		if (toFetch.length === 0) return;
		toFetch.forEach((pk) => _profileFetchQueue.add(pk));
		fetchProfilesBatch(toFetch)
			.then((results) => {
				const evs = [...results.values()].filter(Boolean);
				if (evs.length > 0) putEvents(evs);
			})
			.catch(() => {});
	});

	// liveQuery: profiles for community pubkeys + current user + content authors (kind 0)
	$effect(() => {
		if (!browser) return;
		const pubkeys = [
			...new Set([
				...communities.map((c) => c.pubkey),
				...(currentPubkey ? [currentPubkey] : []),
				...contentPubkeys
			])
		];
		if (pubkeys.length === 0) return;
		const sub = liveQuery(async () => {
			const events = await queryEvents({
				kinds: [EVENT_KINDS.PROFILE],
				authors: pubkeys,
				limit: 400
			});
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
			error: (e) => console.error('[Communities] profiles liveQuery error', e)
		});
		return () => sub.unsubscribe();
	});

	// When community selected: fetch profile list for Forum, then forum posts
	$effect(() => {
		if (!browser || !selectedCommunity) {
			if (forumUnsub) {
				forumUnsub();
				forumUnsub = null;
			}
			forumPosts = [];
			forumMembers = [];
			profileListEvent = null;
			return;
		}
		const comm = parseCommunity(selectedCommunity.raw || selectedCommunity);
		if (!comm?.sections?.length) return;
		const forumSection = comm.sections.find((s) => s.name?.toLowerCase() === 'forum');
		if (!forumSection?.profileListAddress) {
			forumPosts = [];
			forumMembers = [];
			return;
		}
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);
		const parts = forumSection.profileListAddress.split(':');
		const dTag = parts.length >= 3 ? parts.slice(2).join(':') : '';
		(async () => {
			let listEvent = await queryEvent({
				kinds: [EVENT_KINDS.PROFILE_LIST],
				authors: [selectedCommunity.pubkey],
				'#d': [dTag]
			});
			if (!listEvent) {
				listEvent = await fetchProfileListFromRelays(relays, forumSection.profileListAddress);
				if (listEvent) await putEvents([listEvent]);
			}
			profileListEvent = listEvent;
			const parsed = listEvent ? parseProfileList(listEvent) : null;
			const members = parsed?.members || [];
			forumMembers = members;

			const posts = await fetchCommunityForumPosts(relays, selectedCommunity.pubkey, members);
			if (posts.length) await putEvents(posts);

			const unsub = subscribeCommunityForumPosts(
				relays,
				selectedCommunity.pubkey,
				members,
				async (event) => {
					await putEvents([event]);
				}
			);
			forumUnsub = unsub;
		})();
		return () => {
			if (forumUnsub) {
				forumUnsub();
				forumUnsub = null;
			}
		};
	});

	// Resolve General-section profile list — same logic as ForumPostDetail.allowedCommenters.
	// undefined = community not yet loaded; null = no filter; string[] = member filter.
	$effect(() => {
		// Wait until community is actually loaded
		if (!selectedCommunity) {
			generalMembers = undefined;
			return;
		}
		const comm = parseCommunity(selectedCommunity.raw || selectedCommunity);
		// If we can't parse the community, don't block — just skip filtering
		if (!comm) {
			generalMembers = null;
			return;
		}
		// Enforced relay filters server-side — trust it, show all
		if (comm.mainRelayEnforced) {
			generalMembers = null;
			return;
		}
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);
		const generalSection = comm.sections?.find((s) => s.name?.toLowerCase() === 'general');
		if (!generalSection?.profileListAddress) {
			generalMembers = null;
			return;
		}
		const parts = generalSection.profileListAddress.split(':');
		const listPubkey = parts[1];
		const listDTag = parts.length >= 3 ? parts.slice(2).join(':') : '';
		generalMembers = undefined; // mark loading while fetching
		let cancelled = false;
		(async () => {
			let listEvent =
				listPubkey && listDTag
					? await queryEvent({
							kinds: [EVENT_KINDS.PROFILE_LIST],
							authors: [listPubkey],
							'#d': [listDTag]
						})
					: null;
			if (!listEvent)
				listEvent = await fetchProfileListFromRelays(relays, generalSection.profileListAddress);
			if (cancelled) return;
			const list = listEvent ? parseProfileList(listEvent) : null;
			generalMembers = list?.members?.length ? list.members : null;
		})();
		return () => {
			cancelled = true;
		};
	});

	let forumCommentsUnsub = null;
	// Subscribe + initial fetch for forum post comments so they land in Dexie before the liveQuery fires.
	// Does NOT wait for generalMembers — fires immediately when postIds are available so comment counts
	// appear as fast as possible. The liveQuery (below) applies the member filter client-side.
	// When generalMembers later resolves from undefined to a value, this effect re-runs and the
	// subscription is upgraded to use the authors filter, preventing stale/spammy comments going forward.
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey || !forumPosts?.length) {
			if (forumCommentsUnsub) {
				forumCommentsUnsub();
				forumCommentsUnsub = null;
			}
			return;
		}
		const postIds = forumPosts.map((p) => p.id).filter(Boolean);
		if (postIds.length === 0) return;
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);
		// Live subscription — use authors filter once generalMembers resolves, open without it while loading.
		forumCommentsUnsub = subscribeForumPostComments(relays, postIds, {
			authors: generalMembers === undefined ? null : generalMembers
		});
		// Explicit one-shot fetch so Dexie is populated immediately (WebSocket subscription alone is too slow).
		// No authors filter on the relay fetch: we want all comments in Dexie; the liveQuery filters client-side.
		fetchFromRelays(relays, { kinds: [1111], '#E': postIds, limit: 500 }).catch(() => {});
		fetchFromRelays(relays, { kinds: [1111], '#e': postIds, limit: 500 }).catch(() => {});
		return () => {
			if (forumCommentsUnsub) {
				forumCommentsUnsub();
				forumCommentsUnsub = null;
			}
		};
	});

	// liveQuery: forum posts for selected community (reactive from Dexie)
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey || forumMembers.length === 0) return;
		const sub = liveQuery(async () => {
			const filter = {
				kinds: [EVENT_KINDS.FORUM_POST],
				'#h': [selectedCommunity.pubkey],
				limit: 100
			};
			if (forumMembers.length > 0) filter.authors = forumMembers;
			const events = await queryEvents(filter);
			// Attach _raw so openPost() can hand the raw Nostr event to ForumPostDetail.
			return events
				.map((e) => {
					const p = parseForumPost(e);
					return p ? { ...p, _raw: e } : null;
				})
				.filter(Boolean);
		}).subscribe({
			next: (val) => {
				forumPosts = val || [];
			},
			error: (e) => console.error('[Communities] forum liveQuery error', e)
		});
		return () => sub.unsubscribe();
	});

	// liveQuery: NIP-1111 comments on forum posts → commenters per post
	// Mirror ForumPostDetail.allowedCommenters exactly: null = no filter (relay-enforced or open community).
	// Does NOT block on generalMembers === undefined — runs immediately and applies filter when available.
	$effect(() => {
		if (!browser || !forumPosts?.length) {
			commentersByPostId = new Map();
			return;
		}
		const postIds = forumPosts.map((p) => p.id).filter(Boolean);
		if (postIds.length === 0) {
			commentersByPostId = new Map();
			return;
		}
		// Same filter as ForumPostDetail: generalMembers (null = no client-side filter; string[] = whitelist).
		const allowedSet = generalMembers?.length ? new Set(generalMembers) : null;

		const sub = liveQuery(async () => {
			// Only #E (uppercase root-marker) — matches ForumPostDetail's liveQuery.
			// #e-only events are non-standard and also invisible in the detail view.
			const evs = await queryEvents({ kinds: [1111], '#E': postIds, limit: 500 });

			// Step 1: group allowed comments by post and resolve each comment's parentId.
			/** @type {Map<string, Array<{ev: import('nostr-tools').NostrEvent, parentId: string|null}>>} */
			const commentsByPost = new Map();
			for (const ev of evs) {
				if (allowedSet && !allowedSet.has(ev.pubkey)) continue;
				const rootTag = ev.tags?.find((t) => t[0] === 'E' && postIds.includes(t[1]));
				const postId = rootTag?.[1];
				if (!postId) continue;
				const eTags = ev.tags?.filter((t) => (t[0] === 'e' || t[0] === 'E') && t[1]) ?? [];
				const replyTag = eTags.find((t) => t[3] === 'reply');
				const parentId = replyTag?.[1] ?? eTags[eTags.length - 1]?.[1] ?? null;
				if (!commentsByPost.has(postId)) commentsByPost.set(postId, []);
				commentsByPost.get(postId).push({ ev, parentId });
			}

			// Step 2: per post, mirror ForumPostDetail._refreshComments iterative branch pruning:
			// a comment is only displayable if its parent is the post itself or another displayable comment.
			// This drops authorized comments that reply to hidden (unauthorized) parents.
			const byPostId = new Map();
			const allPubkeys = new Set();
			for (const [postId, items] of commentsByPost) {
				let displayable = items;
				let changed = true;
				while (changed) {
					const visibleIds = new Set(displayable.map((c) => c.ev.id));
					const next = displayable.filter(
						(c) => !c.parentId || c.parentId === postId || visibleIds.has(c.parentId)
					);
					changed = next.length !== displayable.length;
					displayable = next;
				}
				let count = 0;
				const treePubkeys = new Set();
				for (const { ev } of displayable) {
					count++;
					treePubkeys.add(ev.pubkey);
					allPubkeys.add(ev.pubkey);
				}
				if (count > 0) byPostId.set(postId, { count, treePubkeys });
			}

			const profileEvs =
				allPubkeys.size > 0
					? await queryEvents({
							kinds: [EVENT_KINDS.PROFILE],
							authors: [...allPubkeys],
							limit: 200
						})
					: [];
			const profileByPubkey = new Map();
			for (const e of profileEvs) {
				try {
					const p = parseProfile(e);
					profileByPubkey.set(e.pubkey, {
						displayName: p.displayName ?? p.name,
						avatarUrl: p.picture
					});
				} catch {
					profileByPubkey.set(e.pubkey, {});
				}
			}
			const out = new Map();
			for (const [pid, { count, treePubkeys }] of byPostId) {
				out.set(pid, {
					count,
					profiles: [...treePubkeys].map((pk) => {
						const prof = profileByPubkey.get(pk) || {};
						return { pubkey: pk, displayName: prof.displayName, avatarUrl: prof.avatarUrl };
					})
				});
			}
			return out;
		}).subscribe({
			next: (val) => {
				commentersByPostId = val ?? new Map();
			},
			error: (e) => console.error('[Communities] commenters liveQuery error', e)
		});
		return () => sub.unsubscribe();
	});

	// Subscribe + initial fetch for task comments so they land in Dexie before the liveQuery fires.
	// Uses all four NIP-1111 tag variants: #A/#a (NIP-33 addr) and #E/#e (event ID).
	let taskCommentsUnsub = null;
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey || !taskEvents?.length) {
			if (taskCommentsUnsub) {
				taskCommentsUnsub();
				taskCommentsUnsub = null;
			}
			return;
		}
		const taskAddrs = taskEvents
			.map((e) => {
				const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				return `${EVENT_KINDS.TASK}:${e.pubkey}:${d}`;
			})
			.filter(Boolean);
		const taskIds = taskEvents.map((e) => e.id).filter(Boolean);
		if (taskAddrs.length === 0 && taskIds.length === 0) return;
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);
		// Subscription for future/live events (all four tag variants)
		taskCommentsUnsub = subscribeTaskComments(relays, taskAddrs, taskIds);
		// Explicit fetch so Dexie is populated immediately (subscription return is async)
		const fetchFilters = [
			...(taskAddrs.length
				? [
						fetchFromRelays(relays, { kinds: [1111], '#A': taskAddrs, limit: 400 }),
						fetchFromRelays(relays, { kinds: [1111], '#a': taskAddrs, limit: 400 })
					]
				: []),
			...(taskIds.length
				? [
						fetchFromRelays(relays, { kinds: [1111], '#E': taskIds, limit: 400 }),
						fetchFromRelays(relays, { kinds: [1111], '#e': taskIds, limit: 400 })
					]
				: [])
		];
		Promise.all(fetchFilters)
			.then((results) => {
				const evs = results.flat();
				if (evs.length) putEvents(evs);
			})
			.catch(() => {});
		return () => {
			if (taskCommentsUnsub) {
				taskCommentsUnsub();
				taskCommentsUnsub = null;
			}
		};
	});

	// liveQuery: NIP-1111 comments on tasks → commenters per task (shape: {pubkey,name,pictureUrl} for TaskCard)
	// All four tag variants: #A/#a (NIP-33 addr) and #E/#e (event ID) — mirrors TaskDetail queries.
	// Does NOT block on generalMembers — runs immediately and applies filter when available.
	$effect(() => {
		if (!browser || !taskEvents?.length) {
			commentersByTaskId = new Map();
			return;
		}
		const taskAddrs = taskEvents
			.map((e) => {
				const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				return `${EVENT_KINDS.TASK}:${e.pubkey}:${d}`;
			})
			.filter(Boolean);
		const taskIds = taskEvents.map((e) => e.id).filter(Boolean);
		// addr → eventId and eventId → eventId (both keys resolve to the task's event ID)
		const taskRefToId = new Map([
			...taskEvents.map((e) => {
				const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				return [`${EVENT_KINDS.TASK}:${e.pubkey}:${d}`, e.id];
			}),
			...taskEvents.map((e) => [e.id, e.id])
		]);
		const taskRoots = new Set([...taskAddrs, ...taskIds]);
		// Use generalMembers filter when resolved; null = no filter (also used while still loading)
		const allowedSet = generalMembers && generalMembers.length ? new Set(generalMembers) : null;

		const sub = liveQuery(async () => {
			const results = await Promise.all([
				taskAddrs.length ? queryEvents({ kinds: [1111], '#A': taskAddrs, limit: 400 }) : [],
				taskAddrs.length ? queryEvents({ kinds: [1111], '#a': taskAddrs, limit: 400 }) : [],
				taskIds.length ? queryEvents({ kinds: [1111], '#E': taskIds, limit: 400 }) : [],
				taskIds.length ? queryEvents({ kinds: [1111], '#e': taskIds, limit: 400 }) : []
			]);
			const seen = new Set();
			const merged = [];
			for (const ev of results.flat()) {
				if (!seen.has(ev.id)) {
					seen.add(ev.id);
					merged.push(ev);
				}
			}
			const byTaskId = new Map();
			const allPubkeys = new Set();
			for (const ev of merged) {
				if (allowedSet && !allowedSet.has(ev.pubkey)) continue;
				// Find the task this comment belongs to — check A/a/E/e tags for any known task root
				const rootTag = ev.tags?.find(
					(t) => ['A', 'a', 'E', 'e'].includes(t[0]) && t[1] && taskRoots.has(t[1])
				);
				const tid = rootTag ? taskRefToId.get(rootTag[1]) : null;
				if (!tid) continue;
				if (!byTaskId.has(tid)) byTaskId.set(tid, { count: 0, rootPubkeys: new Set() });
				const entry = byTaskId.get(tid);
				// Total count all depths
				entry.count++;
				// Profile stack: only root-level comment authors (parentId is a task root)
				const pTags = ev.tags?.filter((t) => ['e', 'E', 'a', 'A'].includes(t[0]) && t[1]) ?? [];
				const replyTag = pTags.find((t) => t[3] === 'reply');
				const parentId = replyTag?.[1] ?? pTags[pTags.length - 1]?.[1] ?? null;
				if (taskRoots.has(parentId)) {
					entry.rootPubkeys.add(ev.pubkey);
					allPubkeys.add(ev.pubkey);
				}
			}
			const profileEvs =
				allPubkeys.size > 0
					? await queryEvents({
							kinds: [EVENT_KINDS.PROFILE],
							authors: [...allPubkeys],
							limit: 200
						})
					: [];
			const profileByPubkey = new Map();
			for (const e of profileEvs) {
				try {
					const p = parseProfile(e);
					profileByPubkey.set(e.pubkey, { name: p.displayName ?? p.name, pictureUrl: p.picture });
				} catch {
					profileByPubkey.set(e.pubkey, {});
				}
			}
			const out = new Map();
			for (const [tid, { rootPubkeys }] of byTaskId) {
				out.set(
					tid,
					[...rootPubkeys].map((pk) => {
						const prof = profileByPubkey.get(pk) || {};
						return { pubkey: pk, name: prof.name, pictureUrl: prof.pictureUrl };
					})
				);
			}
			return out;
		}).subscribe({
			next: (val) => {
				commentersByTaskId = val ?? new Map();
			},
			error: (e) => console.error('[Communities] task commenters liveQuery error', e)
		});
		return () => sub.unsubscribe();
	});

	// liveQuery: task events (kind 37060) for the selected community
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey) {
			taskEvents = [];
			return;
		}
		const communityPubkey = selectedCommunity.pubkey;
		const sub = liveQuery(async () => {
			return await queryEvents({
				kinds: [EVENT_KINDS.TASK],
				'#h': [communityPubkey],
				limit: 200
			});
		}).subscribe({
			next: (val) => {
				taskEvents = val || [];
			},
			error: (e) => console.error('[Tasks] liveQuery error', e)
		});
		// Also fetch from relays so we get tasks from other clients
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);
		fetchFromRelays(relays, { kinds: [EVENT_KINDS.TASK], '#h': [communityPubkey], limit: 200 })
			.then(async (events) => {
				if (events.length) await putEvents(events);
				// Fetch status events for all tasks (so deployed version with empty Dexie gets status)
				const addrs = events
					.map((e) => {
						const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
						return `${EVENT_KINDS.TASK}:${e.pubkey}:${d}`;
					})
					.filter(Boolean);
				if (addrs.length) {
					const statusEvs = await fetchFromRelays(relays, {
						kinds: [EVENT_KINDS.STATUS],
						'#a': addrs,
						limit: 1000
					});
					if (statusEvs.length) await putEvents(statusEvs);
				}
			})
			.catch(() => {});
		return () => sub.unsubscribe();
	});

	// liveQuery: latest status event (kind 1983) per task address
	$effect(() => {
		if (!browser || taskEvents.length === 0) {
			taskStatusMap = new Map();
			return;
		}
		const addresses = taskEvents
			.map((e) => {
				const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				return `${EVENT_KINDS.TASK}:${e.pubkey}:${d}`;
			})
			.filter(Boolean);
		if (addresses.length === 0) return;
		const sub = liveQuery(async () => {
			const events = await queryEvents({
				kinds: [EVENT_KINDS.STATUS],
				'#a': addresses,
				limit: 1000
			});
			/** @type {Map<string, import('nostr-tools').NostrEvent>} */
			const map = new Map();
			for (const e of events) {
				const aTag = e.tags?.find((t) => t[0] === 'a')?.[1];
				if (!aTag) continue;
				const prev = map.get(aTag);
				if (!prev || e.created_at > prev.created_at) map.set(aTag, e);
			}
			return map;
		}).subscribe({
			next: (val) => {
				taskStatusMap = val ?? new Map();
			},
			error: (e) => console.error('[Tasks] status liveQuery error', e)
		});
		return () => sub.unsubscribe();
	});

	// Live subscription for task status updates (kind 1983).
	// The one-shot fetch in the tasks $effect seeds Dexie on first load; this keeps statuses current
	// when other clients change a task's status while you have the page open.
	let taskStatusUnsub = null;
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey || !taskEvents?.length) {
			if (taskStatusUnsub) {
				taskStatusUnsub();
				taskStatusUnsub = null;
			}
			return;
		}
		const addrs = taskEvents
			.map((e) => {
				const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				return `${EVENT_KINDS.TASK}:${e.pubkey}:${d}`;
			})
			.filter(Boolean);
		if (!addrs.length) return;
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);
		taskStatusUnsub = subscribeTaskStatuses(relays, addrs);
		// One-shot fetch ensures we have the latest status events in Dexie immediately,
		// without waiting for the sequential task-relay-fetch chain to complete.
		// This is especially important when Dexie already has tasks from a previous session
		// so statuses load in parallel with tasks rather than after them.
		fetchFromRelays(relays, { kinds: [EVENT_KINDS.STATUS], '#a': addrs, limit: 1000 })
			.then((evs) => {
				if (evs.length) putEvents(evs);
			})
			.catch(() => {});
		return () => {
			if (taskStatusUnsub) {
				taskStatusUnsub();
				taskStatusUnsub = null;
			}
		};
	});

	// liveQuery: wiki events (kind 30818) for the selected community
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey) {
			wikiEvents = [];
			return;
		}
		const communityPubkey = selectedCommunity.pubkey;
		const sub = liveQuery(async () => {
			return await queryEvents({
				kinds: [EVENT_KINDS.WIKI],
				'#h': [communityPubkey],
				limit: 200
			});
		}).subscribe({
			next: (val) => {
				wikiEvents = val || [];
			},
			error: (e) => console.error('[Wikis] liveQuery error', e)
		});
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);
		fetchCommunityWikis(relays, communityPubkey)
			.then((events) => {
				if (events.length) putEvents(events);
			})
			.catch(() => {});
		return () => sub.unsubscribe();
	});

	// liveQuery: project events (kind 30315) for the selected community
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey) {
			projectEvents = [];
			return;
		}
		const communityPubkey = selectedCommunity.pubkey;
		const sub = liveQuery(async () => {
			return await queryEvents({
				kinds: [EVENT_KINDS.PROJECT],
				'#h': [communityPubkey],
				limit: 200
			});
		}).subscribe({
			next: (val) => {
				projectEvents = val || [];
			},
			error: (e) => console.error('[Projects] liveQuery error', e)
		});
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);
		fetchCommunityProjects(relays, communityPubkey)
			.then((evs) => {
				if (evs.length) putEvents(evs);
			})
			.catch(() => {});
		// Also subscribe for live updates
		const unsub = subscribeCommunityProjects(relays, communityPubkey);
		return () => {
			sub.unsubscribe();
			unsub();
		};
	});

	// liveQuery: milestone events (kind 30316) belonging to fetched projects
	$effect(() => {
		if (!browser || !projectEvents.length) {
			milestonesByProjectId = new Map();
			return;
		}
		const sub = liveQuery(async () => {
			const allProjectAddrs = projectEvents.map((e) => {
				const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				return `${EVENT_KINDS.PROJECT}:${e.pubkey}:${d}`;
			});
			const evs = await queryEvents({
				kinds: [EVENT_KINDS.MILESTONE],
				'#a': allProjectAddrs,
				limit: 500
			});
			const map = new Map();
			for (const e of evs) {
				const projAddr = e.tags?.find((t) => t[0] === 'a' && t[1]?.startsWith('30315:'))?.[1];
				if (!projAddr) continue;
				// Map to project event id
				const projEv = projectEvents.find((pe) => {
					const d = pe.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
					return `${EVENT_KINDS.PROJECT}:${pe.pubkey}:${d}` === projAddr;
				});
				if (!projEv) continue;
				if (!map.has(projEv.id)) map.set(projEv.id, []);
				map.get(projEv.id).push(e);
			}
			return map;
		}).subscribe({
			next: (val) => {
				milestonesByProjectId = val ?? new Map();
			},
			error: (e) => console.error('[Milestones] liveQuery error', e)
		});
		// Fetch milestones from relay
		const relays = selectedCommunity?.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);
		const allProjectAddrs = projectEvents.map((e) => {
			const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
			return `${EVENT_KINDS.PROJECT}:${e.pubkey}:${d}`;
		});
		if (allProjectAddrs.length && relays.length) {
			Promise.all(allProjectAddrs.map((addr) => fetchProjectMilestones(relays, [], addr)))
				.then((results) => {
					const evs = results.flat();
					if (evs.length) putEvents(evs);
				})
				.catch(() => {});
		}
		return () => sub.unsubscribe();
	});

	// liveQuery: latest status event per milestone address
	$effect(() => {
		if (!browser || !milestonesByProjectId.size) {
			milestoneStatusMap = new Map();
			return;
		}
		const allMs = [...milestonesByProjectId.values()].flat();
		const addrs = allMs.map((e) => {
			const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
			return `${EVENT_KINDS.MILESTONE}:${e.pubkey}:${d}`;
		});
		if (!addrs.length) return;
		const sub = liveQuery(async () => {
			const evs = await queryEvents({ kinds: [EVENT_KINDS.STATUS], '#a': addrs, limit: 1000 });
			const map = new Map();
			for (const e of evs) {
				const a = e.tags?.find((t) => t[0] === 'a')?.[1];
				if (!a) continue;
				const prev = map.get(a);
				if (!prev || e.created_at > prev.created_at) map.set(a, e);
			}
			const STATUS_MAP = {
				'in-progress': 'inProgress',
				'in-review': 'inReview',
				open: 'open',
				backlog: 'backlog',
				closed: 'closed',
				canceled: 'canceled'
			};
			const result = new Map();
			for (const [addr, ev] of map) {
				const raw = ev.tags?.find((t) => t[0] === 'status')?.[1] ?? 'open';
				result.set(addr, STATUS_MAP[raw] ?? raw);
			}
			return result;
		}).subscribe({
			next: (val) => {
				milestoneStatusMap = val ?? new Map();
			},
			error: (e) => console.error('[MilestoneStatus] liveQuery error', e)
		});
		return () => sub.unsubscribe();
	});

	// Tab-aware targeted refresh: when the user switches to a section, fire a fresh one-shot
	// relay fetch for that section so the feed is current.
	// Skips the very first run (initial community load already fetches everything).
	// Has a 60s per-section cooldown to prevent unnecessary Dexie writes (which trigger
	// liveQuery re-fires and cause profile pics to visually reload).
	// Forum is excluded: its persistent subscription (subscribeCommunityForumPosts) already
	// keeps that feed live, so re-fetching on tab switch is redundant.
	/** @type {Map<string, number>} section → last-refresh timestamp */
	// Activity tab: liveQuery kind:1111 comments that reference community content (forum posts,
	// tasks, projects). Uses root IDs/addresses for community-scoped Dexie queries.
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey) {
			activityComments = [];
			activityRootEvents = new Map();
			return;
		}

		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);

		// Root IDs from forum posts (non-replaceable, #e tag)
		const rootIds = forumPosts.map((p) => p.id).filter(Boolean);
		// Root addresses from tasks and projects (addressable, #a/#A tag)
		const taskAddrs = taskEvents
			.map((e) => {
				const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				return d ? `${EVENT_KINDS.TASK}:${e.pubkey}:${d}` : null;
			})
			.filter(Boolean);
		const projectAddrs = projectEvents
			.map((e) => {
				const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				return d ? `${EVENT_KINDS.PROJECT}:${e.pubkey}:${d}` : null;
			})
			.filter(Boolean);
		const rootAddrs = [...taskAddrs, ...projectAddrs];

		if (rootIds.length === 0 && rootAddrs.length === 0) {
			activityComments = [];
			return;
		}

		// liveQuery from Dexie — reacts to putEvents() from fetch + subscription below
		const sub = liveQuery(async () => {
			const queries = [];
			if (rootIds.length) {
				queries.push(queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#E': rootIds, limit: 300 }));
			}
			if (rootAddrs.length) {
				queries.push(queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#a': rootAddrs, limit: 300 }));
				queries.push(queryEvents({ kinds: [EVENT_KINDS.COMMENT], '#A': rootAddrs, limit: 300 }));
			}
			const results = await Promise.all(queries);
			const byId = new Map();
			for (const evs of results) {
				for (const ev of evs) byId.set(ev.id, ev);
			}
			return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
		}).subscribe({
			next: (val) => {
				activityComments = val || [];
				for (const ev of activityComments) {
					resolveActivityRootEvent(ev, relays);
					scheduleActivityProfileFetch(ev.pubkey);
				}
			},
			error: (e) => console.error('[Activity] liveQuery error', e)
		});

		// Initial fetch to populate Dexie with community comments
		if (rootIds.length) {
			fetchFromRelays(relays, { kinds: [EVENT_KINDS.COMMENT], '#E': rootIds, limit: 500 })
				.then((evs) => { if (evs?.length) putEvents(evs); })
				.catch(() => {});
		}
		if (rootAddrs.length) {
			fetchFromRelays(relays, { kinds: [EVENT_KINDS.COMMENT], '#a': rootAddrs, limit: 500 })
				.then((evs) => { if (evs?.length) putEvents(evs); })
				.catch(() => {});
			fetchFromRelays(relays, { kinds: [EVENT_KINDS.COMMENT], '#A': rootAddrs, limit: 500 })
				.then((evs) => { if (evs?.length) putEvents(evs); })
				.catch(() => {});
		}

		// Live subscription — writes to Dexie, liveQuery picks it up
		const unsub = subscribeCommunityComments(relays, {
			limit: 100,
			onEvent: (ev) => {
				if (ev?.id) putEvents([ev]).catch(() => {});
			}
		});

		return () => {
			sub.unsubscribe();
			unsub();
		};
	});

	/**
	 * Look up a comment's root event (uppercase E or A tag) from Dexie, then relay.
	 * @param {import('nostr-tools').NostrEvent} commentEvent
	 * @param {string[]} relays
	 */
	async function resolveActivityRootEvent(commentEvent, relays) {
		if (!commentEvent?.tags) return;
		const eRootTag = commentEvent.tags.find((t) => t[0] === 'E' && t[1]);
		const aRootTag = commentEvent.tags.find((t) => t[0] === 'A' && t[1]);
		const rootId = eRootTag?.[1] ?? null;
		const rootAddr = aRootTag?.[1] ?? null;
		const key = rootId ?? rootAddr;
		if (!key) return;
		if (activityRootEvents.has(key)) return;

		let rootEv = null;
		if (rootId) {
			rootEv = await queryEvent({ ids: [rootId] }).catch(() => null);
		} else if (rootAddr) {
			const parts = rootAddr.split(':');
			const kind = parseInt(parts[0], 10);
			const pubkey = parts[1];
			const dTag = parts.slice(2).join(':');
			if (kind && pubkey && dTag) {
				rootEv = await queryEvent({ kinds: [kind], authors: [pubkey], '#d': [dTag] }).catch(() => null);
			}
		}

		if (rootEv) {
			activityRootEvents = new Map(activityRootEvents).set(key, rootEv);
			return;
		}

		// Relay fallback when not in Dexie yet
		try {
			let arr = [];
			if (rootId) {
				arr = await fetchFromRelays(relays, { ids: [rootId], limit: 1 });
			} else if (rootAddr) {
				const parts = rootAddr.split(':');
				const kind = parseInt(parts[0], 10);
				const pubkey = parts[1];
				const dTag = parts.slice(2).join(':');
				arr = await fetchFromRelays(relays, { kinds: [kind], authors: [pubkey], '#d': [dTag], limit: 1 });
			}
			if (arr?.[0]) {
				await putEvents([arr[0]]);
				activityRootEvents = new Map(activityRootEvents).set(key, arr[0]);
			}
		} catch {
			// non-fatal
		}
	}

	/** Debounced profile fetcher for the Activity tab. */
	const _activityPendingProfiles = new Set();
	let _activityProfileTimer = null;
	function scheduleActivityProfileFetch(pubkey) {
		if (!pubkey || profilesByPubkey.has(pubkey)) return;
		_activityPendingProfiles.add(pubkey);
		if (_activityProfileTimer) return;
		_activityProfileTimer = setTimeout(async () => {
			_activityProfileTimer = null;
			const keys = [..._activityPendingProfiles];
			_activityPendingProfiles.clear();
			if (!keys.length) return;
			try {
				const evs = await fetchProfilesBatch(keys, PROFILE_RELAYS);
				for (const ev of evs) {
					profilesByPubkey = new Map(profilesByPubkey).set(ev.pubkey, ev);
				}
			} catch {
				// non-fatal
			}
		}, 200);
	}

	const _sectionRefreshTs = new Map();
	let _lastTabSection = /** @type {string|null} */ (null);
	$effect(() => {
		const section = selectedSection;
		const communityPubkey = selectedCommunity?.pubkey;
		if (!browser || !communityPubkey) {
			_lastTabSection = null;
			return;
		}
		// First run after community load: record the section, don't fetch (initial load covers it).
		if (_lastTabSection === null) {
			_lastTabSection = section;
			return;
		}
		if (_lastTabSection === section) return;
		_lastTabSection = section;

		// Respect 60s cooldown per section to avoid re-writing identical events to Dexie.
		const tsKey = `${communityPubkey}:${section}`;
		const now = Date.now();
		if (now - (_sectionRefreshTs.get(tsKey) ?? 0) < 60_000) return;
		_sectionRefreshTs.set(tsKey, now);

		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);

		if (section === 'tasks') {
			// Tasks have no persistent subscription; refresh tasks + statuses on tab switch.
			fetchFromRelays(relays, { kinds: [EVENT_KINDS.TASK], '#h': [communityPubkey], limit: 200 })
				.then(async (events) => {
					if (events.length) await putEvents(events);
					const addrs = events
						.map((e) => {
							const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
							return `${EVENT_KINDS.TASK}:${e.pubkey}:${d}`;
						})
						.filter(Boolean);
					if (addrs.length) {
						const statusEvs = await fetchFromRelays(relays, {
							kinds: [EVENT_KINDS.STATUS],
							'#a': addrs,
							limit: 1000
						});
						if (statusEvs.length) await putEvents(statusEvs);
					}
				})
				.catch(() => {});
		} else if (section === 'wikis') {
			fetchCommunityWikis(relays, communityPubkey)
				.then((events) => {
					if (events.length) putEvents(events);
				})
				.catch(() => {});
		} else if (section === 'projects') {
			fetchCommunityProjects(relays, communityPubkey)
				.then((evs) => {
					if (evs.length) putEvents(evs);
				})
				.catch(() => {});
		}
	});

	// Keep the module-level cache current so back-navigation shows data instantly.
	// Runs whenever any of the key state values change.
	$effect(() => {
		if (!browser || !communityNpub || !selectedCommunity) return;
		communityCache.set(communityNpub, {
			selectedCommunity,
			forumPosts: [...forumPosts],
			wikiEvents: [...wikiEvents],
			taskEvents: [...taskEvents],
			projectEvents: [...projectEvents],
			profilesByPubkey: new Map(profilesByPubkey)
		});
	});

	/** Helper: get parsed project info + milestone shapes for a project event */
	function getProjectCardData(projectEvent) {
		const parsed = parseProject(projectEvent);
		if (!parsed) return null;
		const mEvs = milestonesByProjectId.get(projectEvent.id) ?? [];
		const milestones = mEvs
			.map((me) => {
				const mp = parseMilestone(me);
				if (!mp) return null;
				const addr = `${EVENT_KINDS.MILESTONE}:${me.pubkey}:${mp.dTag}`;
				const msStatus = milestoneStatusMap.get(addr) ?? 'open';
				const msPct =
					msStatus === 'closed'
						? 100
						: msStatus === 'inProgress'
							? 50
							: msStatus === 'inReview'
								? 75
								: 0;
				return { id: me.id, title: mp.title, percentage: msPct };
			})
			.filter(Boolean);
		const closedMs = milestones.filter((m) => m.percentage === 100).length;
		const progress = milestones.length ? Math.round((closedMs / milestones.length) * 100) : 0;
		return { parsed, milestones, progress };
	}

	/**
	 * Open a project — navigates to /project/[naddr] (real SvelteKit route).
	 */
	function openProject(projEvent) {
		try {
			const dTag = projEvent.tags?.find((/** @type {string[]} */ t) => t[0] === 'd')?.[1] ?? '';
			const naddr = nip19.naddrEncode({
				kind: projEvent.kind,
				pubkey: projEvent.pubkey,
				identifier: dTag
			});
			navHandoff.set(naddr, {
				event: projEvent,
				communityNpub: selectedCommunity?.npub ?? communityNpub,
				profiles: handoffProfiles(projEvent.pubkey, selectedCommunity?.pubkey)
			});
			goto(`/project/${naddr}`);
		} catch {
			goto(
				`/community/${encodeURIComponent(selectedCommunity?.npub ?? communityNpub)}?project=${encodeURIComponent(projEvent.id)}`
			);
		}
	}
	function openList(listAddr) {
		if (!selectedCommunity?.npub || !listAddr) return;
		const url = new URL(window.location.href);
		url.searchParams.set('list', listAddr);
		goto(url.toString(), { replaceState: false });
	}

	/**
	 * @param {{ type: string, title: string, slug: string, text: string, emojiTags: any[], mentions: any[], labels: string[], status: string, projectAddr?: string, pendingMilestones?: { title: string }[], dTag?: string }} params
	 */
	async function handleProjectSubmit({
		type,
		title,
		slug,
		summary = '',
		text,
		emojiTags,
		mentions,
		labels,
		status,
		priority = 'none',
		startDate = '',
		dueDate = '',
		projectAddr,
		pendingMilestones,
		dTag
	}) {
		if (!selectedCommunity?.pubkey || !currentPubkey) throw new Error('Not signed in');
		const relays = selectedCommunity.relays?.length
			? selectedCommunity.relays
			: DEFAULT_COMMUNITY_RELAYS;
		const now = Math.floor(Date.now() / 1000);
		const finalDTag = dTag || `${slug}-${Date.now()}`;
		const STATUS_MAP = {
			open: 'open',
			backlog: 'backlog',
			inProgress: 'in-progress',
			inReview: 'in-review',
			closed: 'closed'
		};
		const kind = type === 'milestone' ? EVENT_KINDS.MILESTONE : EVENT_KINDS.PROJECT;

		/** @type {string[][]} */
		const tags = [
			['d', finalDTag],
			['title', title.trim()],
			['h', selectedCommunity.pubkey]
		];
		if (type === 'project' && summary?.trim()) tags.push(['summary', summary.trim()]);
		if (type === 'project' && priority && priority !== 'none') tags.push(['priority', priority]);
		if (type === 'project' && startDate) {
			const ts = Math.floor(new Date(startDate + 'T00:00:00').getTime() / 1000);
			if (!isNaN(ts)) tags.push(['start', String(ts)]);
		}
		if (type === 'project' && dueDate) {
			const ts = Math.floor(new Date(dueDate + 'T00:00:00').getTime() / 1000);
			if (!isNaN(ts)) tags.push(['due', String(ts)]);
		}
		if (type === 'milestone' && projectAddr) tags.push(['a', projectAddr]);
		labels?.forEach((l) => tags.push(['t', l]));
		emojiTags?.forEach((e) => tags.push(Array.isArray(e) ? e : ['emoji', e.shortcode, e.url]));

		// For projects: publish pending milestone events first, then add their a-tags
		const milestoneEvs = [];
		if (type === 'project' && pendingMilestones?.length) {
			const projAddr = `${EVENT_KINDS.PROJECT}:${currentPubkey}:${finalDTag}`;
			for (const ms of pendingMilestones) {
				const msDTag =
					ms.title
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, '-')
						.replace(/^-|-$/g, '')
						.slice(0, 40) +
					'-' +
					Date.now();
				/** @type {string[][]} */
				const msTags = [
					['d', msDTag],
					['title', ms.title],
					['h', selectedCommunity.pubkey],
					['a', projAddr]
				];
				// Due date: stored as YYYY-MM-DD, convert to Unix timestamp
				if (ms.due) {
					const dueTs = Math.floor(new Date(ms.due).getTime() / 1000);
					if (!isNaN(dueTs)) msTags.push(['due', String(dueTs)]);
				}
				const msEv = await signEvent({
					kind: EVENT_KINDS.MILESTONE,
					content: ms.content ?? '',
					tags: msTags,
					created_at: now
				});
				milestoneEvs.push({ ev: msEv, dTag: msDTag, msStatus: ms.status ?? 'open' });
				// Add back-reference in the project event
				tags.push(['a', `${EVENT_KINDS.MILESTONE}:${currentPubkey}:${msDTag}`]);
			}
		}

		const ev = await signEvent({ kind, content: text || '', tags, created_at: now });
		await putEvents([ev]);
		await publishToRelays(relays, ev);

		// Publish status event for the main item
		const addr = `${kind}:${currentPubkey}:${finalDTag}`;
		const statusEv = await signEvent({
			kind: EVENT_KINDS.STATUS,
			content: '',
			tags: [
				['a', addr],
				['status', STATUS_MAP[status ?? 'open'] ?? 'open']
			],
			created_at: now
		});
		await publishToRelays(relays, statusEv);

		// Publish milestone events + their status events
		for (const { ev: msEv, dTag: msDTag, msStatus } of milestoneEvs) {
			await putEvents([msEv]);
			await publishToRelays(relays, msEv);
			const msAddr = `${EVENT_KINDS.MILESTONE}:${currentPubkey}:${msDTag}`;
			const msStatusSpec = STATUS_MAP[msStatus] ?? 'open';
			const msStatusEv = await signEvent({
				kind: EVENT_KINDS.STATUS,
				content: '',
				tags: [
					['a', msAddr],
					['status', msStatusSpec]
				],
				created_at: now
			});
			await publishToRelays(relays, msStatusEv);
		}
	}

	/** @type {Record<string,string>} */
	const SPEC_STATUS_TO_CAMEL = {
		open: 'open',
		backlog: 'backlog',
		'in-progress': 'inProgress',
		'in-review': 'inReview',
		closed: 'closed'
	};

	/**
	 * @param {import('nostr-tools').NostrEvent} taskEvent
	 * @returns {{ status: string, priority: string }}
	 */
	function getTaskStatusAndPriority(taskEvent) {
		const d = taskEvent.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
		const addr = `${EVENT_KINDS.TASK}:${taskEvent.pubkey}:${d}`;
		const ev = taskStatusMap.get(addr);
		if (!ev) return { status: 'open', priority: 'none' };
		const specStatus = ev.tags?.find((t) => t[0] === 'status')?.[1] ?? 'open';
		const priority = ev.tags?.find((t) => t[0] === 'priority')?.[1] ?? 'none';
		return { status: SPEC_STATUS_TO_CAMEL[specStatus] ?? 'open', priority };
	}

	const isMember = $derived(
		selectedCommunity && currentPubkey && forumMembers.includes(currentPubkey)
	);
	const isCommunityAdmin = $derived(
		!!selectedCommunity?.pubkey && !!currentPubkey && selectedCommunity.pubkey === currentPubkey
	);

	/** Pills from community content sections + Profiles + Activity + Admin (for admin). General is never shown as a tab. */
	const sectionPills = $derived.by(() => {
		const comm = selectedCommunity?.raw ? parseCommunity(selectedCommunity.raw) : null;
		const sections = comm?.sections ?? [];
		const fromSections = sections
			.filter((s) => (s.name || '').toLowerCase() !== 'general')
			.map((s) => ({
				id: (s.name || '').toLowerCase().replace(/\s+/g, '-'),
				label: s.name || 'Section',
				kinds: s.kinds ?? []
			}));
		// Always show Profiles and Activity tabs
		const profilesPill = { id: 'profiles', label: 'Profiles', kinds: [] };
		const activityPill = { id: 'activity', label: 'Activity', kinds: [1111] };
		const adminPill = { id: 'admin', label: 'Admin', kinds: [], isAdmin: true };
		if (fromSections.length === 0 && sections.length === 0) {
			const base = SECTION_PILLS.filter((p) => p.id !== 'general');
			return isCommunityAdmin ? [...base, activityPill, adminPill] : [...base, activityPill];
		}
		return isCommunityAdmin
			? [...fromSections, profilesPill, activityPill, adminPill]
			: [...fromSections, profilesPill, activityPill];
	});
	const selectedSectionKinds = $derived(
		sectionPills.find((p) => p.id === selectedSection)?.kinds ?? []
	);
	const isForumSection = $derived(selectedSection === 'forum' || selectedSectionKinds.includes(11));
	const hasForm = $derived(profileListEvent && parseProfileList(profileListEvent)?.form);

	// Task list grouping — kept in script so the tasks section can use CSS hiding instead of {#if}.
	const TASK_STATUS_ORDER = ['inReview', 'inProgress', 'open', 'backlog', 'closed', 'canceled'];
	const TASK_STATUS_LABELS = /** @type {Record<string,string>} */ ({
		inReview: 'IN REVIEW',
		inProgress: 'IN PROGRESS',
		open: 'OPEN',
		backlog: 'BACKLOG',
		closed: 'CLOSED',
		canceled: 'CANCELED'
	});
	const tasksByStatus = $derived.by(() => {
		/** @type {Map<string, import('nostr-tools').NostrEvent[]>} */
		const map = new Map();
		for (const task of taskEvents.slice().sort((a, b) => b.created_at - a.created_at)) {
			const { status } = getTaskStatusAndPriority(task);
			const key = TASK_STATUS_ORDER.includes(status) ? status : 'open';
			if (!map.has(key)) map.set(key, []);
			map.get(key).push(task);
		}
		return map;
	});

	// When admin tab is entered, populate admin form from current community (only when first entering or community changes).
	$effect(() => {
		if (!browser || !selectedCommunity || selectedSection !== 'admin') return;
		const pubkey = selectedCommunity.pubkey;
		if (lastAdminSyncedPubkey !== pubkey) {
			lastAdminSyncedPubkey = pubkey;
			adminPicture = selectedCommunity.picture ?? '';
			adminName = selectedCommunity.displayName ?? selectedCommunity.name ?? '';
			adminDescription = selectedCommunity.about ?? selectedCommunity.description ?? '';
			adminRelays = (selectedCommunity.relays ?? []).join('\n');
			const firstRTag = (selectedCommunity.raw?.tags ?? []).find((t) => t[0] === 'r');
			adminRelayEnforced = firstRTag?.[2] === 'enforced';
			adminBlossom = (selectedCommunity.raw?.tags ?? [])
				.filter((t) => t[0] === 'blossom')
				.map((t) => t[1])
				.join('\n');
			const comm = parseCommunity(selectedCommunity.raw || selectedCommunity);
			const sections = comm?.sections ?? [];
			const enabled = {};
			const listAddress = {};
			for (const preset of ADMIN_SECTION_PRESETS) {
				const sec = sections.find(
					(s) => (s.name || '').toLowerCase() === preset.name.toLowerCase()
				);
				enabled[preset.id] = !!sec;
				const addrs =
					sec?.profileListAddresses ?? (sec?.profileListAddress ? [sec.profileListAddress] : []);
				listAddress[preset.id] = addrs;
			}
			adminSectionEnabled = enabled;
			adminSectionListAddress = listAddress;
		}
	});

	// When community info modal opens, load sections with list names for display
	$effect(() => {
		if (!browser || !communityInfoModalOpen || !selectedCommunity) {
			communityModalSections = [];
			return;
		}
		const comm = parseCommunity(selectedCommunity.raw || selectedCommunity);
		const sections = comm?.sections ?? [];
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);
		(async () => {
			const list = [];
			const addresses = (sec) =>
				sec.profileListAddresses ?? (sec.profileListAddress ? [sec.profileListAddress] : []);
			for (const sec of sections) {
				for (const listAddress of addresses(sec)) {
					if (!listAddress) continue;
					const parts = listAddress.split(':');
					const dTag = parts.length >= 3 ? parts.slice(2).join(':') : '';
					let listEv = await queryEvent({
						kinds: [EVENT_KINDS.PROFILE_LIST],
						authors: [selectedCommunity.pubkey],
						'#d': [dTag]
					});
					if (!listEv) {
						listEv = await fetchProfileListFromRelays(relays, listAddress);
						if (listEv) await putEvents([listEv]);
					}
					const parsed = listEv ? parseProfileList(listEv) : null;
					list.push({
						sectionName: sec.name || 'Section',
						listName: parsed?.name ?? sec.name ?? 'List',
						listAddress
					});
				}
			}
			communityModalSections = list;
		})();
	});

	// Load all profile lists for the list picker (admin + profiles tab)
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey || selectedSection !== 'profiles' && selectedSection !== 'admin')
			return;
		adminProfileLists = [];
		(async () => {
			const evs = await queryEvents({
				kinds: [EVENT_KINDS.PROFILE_LIST],
				authors: [selectedCommunity.pubkey],
				limit: 100
			});
			const list = evs.map((e) => {
				const parsed = parseProfileList(e);
				const dTag = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				const listAddress = `30000:${e.pubkey}:${dTag}`;
				return {
					listAddress,
					name: (parsed?.name ?? dTag) || 'List',
					image: parsed?.image ?? null,
					listEvent: e,
					parsed
				};
			});
			adminProfileLists = list;
		})();
	});

	// When community info modal opens or profiles/admin tab is active, load profile lists from sections in background.
	// Deduplicate by listAddress so one list assigned to multiple sections shows as one panel with "Can write in: A, B, C".
	$effect(() => {
		if (
			!browser ||
			!selectedCommunity ||
			(!communityInfoModalOpen && selectedSection !== 'profiles' && selectedSection !== 'admin')
		)
			return;
		const comm = parseCommunity(selectedCommunity.raw || selectedCommunity);
		const sections = comm?.sections ?? [];
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);
		membersListData = [];
		(async () => {
			// listAddress -> { names[], kindsSet }
			const listToSectionInfo = new Map();
			for (const sec of sections) {
				const addresses =
					sec.profileListAddresses ?? (sec.profileListAddress ? [sec.profileListAddress] : []);
				const sectionName = sec.name || 'Section';
				const kinds = sec.kinds ?? [];
				for (const listAddress of addresses) {
					if (!listAddress) continue;
					if (!listToSectionInfo.has(listAddress))
						listToSectionInfo.set(listAddress, { names: [], kindsSet: new Set() });
					const info = listToSectionInfo.get(listAddress);
					info.names.push(sectionName);
					kinds.forEach((k) => info.kindsSet.add(k));
				}
			}
			const list = [];
			for (const [listAddress, info] of listToSectionInfo) {
				const parts = listAddress.split(':');
				const listPubkey = parts[1] ?? selectedCommunity.pubkey;
				const dTag = parts.length >= 3 ? parts.slice(2).join(':') : '';
				// Use Dexie for an instant first render, but ALWAYS also fetch from
				// relay in the background so stale cached versions get updated.
				let listEv = await queryEvent({
					kinds: [EVENT_KINDS.PROFILE_LIST],
					authors: [listPubkey],
					'#d': [dTag]
				});
				// Background-check the relay for a newer version WITHOUT writing to
				// Dexie unconditionally — fetchEventsNoStore skips the internal putEvents
				// so it won't trigger liveQuery subscribers (zap counts, label counts, etc.)
				// in unrelated components. We only write if the relay has something newer.
				fetchEventsNoStore(relays, {
					kinds: [EVENT_KINDS.PROFILE_LIST],
					authors: [listPubkey],
					'#d': [dTag],
					limit: 1
				})
					.then(async (results) => {
						if (!results.length) return;
						const relayEv = results[0];
						if (!listEv || relayEv.created_at > listEv.created_at) {
							await putEvents([relayEv]);
							const freshParsed = parseProfileList(relayEv);
							membersListData = membersListData.map((item) =>
								item.listAddress === listAddress
									? { ...item, listEvent: relayEv, parsed: freshParsed ?? item.parsed }
									: item
							);
						}
					})
					.catch(() => {});
				if (!listEv) {
					listEv = await fetchProfileListFromRelays(relays, listAddress);
					if (listEv) await putEvents([listEv]);
				}
				const parsed = listEv ? parseProfileList(listEv) : null;
				list.push({
					listAddress,
					listEvent: listEv,
					parsed: parsed ?? { name: 'List', members: [], form: null, dTag },
					sectionName: info.names.join(', '),
					sectionKinds: [...info.kindsSet]
				});
			}
			membersListData = list;
		})();
	});

	// Load form templates (kind 30168) whenever the admin is viewing this community.
	// Checks local DB first (instant display), then fetches from relays to catch any
	// templates published from other clients that haven't been synced yet.
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey || !isCommunityAdmin) return;
		const pubkey = selectedCommunity.pubkey;
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);

		function buildTemplates(evs) {
			const allLists = membersListData.length > 0 ? membersListData : adminProfileLists;
			return evs.map((e) => {
				const parsed = parseFormTemplate(e);
				const dTag = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				const formAddr = `${EVENT_KINDS.FORM_TEMPLATE}:${e.pubkey}:${dTag}`;
				const linkedLists = allLists
					.filter((l) => l.parsed?.form?.trim() === formAddr)
					.map((l) => l.parsed?.name ?? l.sectionName ?? 'List');
				return { event: e, parsed, formAddr, linkedLists: [...new Set(linkedLists)] };
			});
		}

		(async () => {
			// 1. Render immediately from local DB
			const local = await queryEvents({
				kinds: [EVENT_KINDS.FORM_TEMPLATE],
				authors: [pubkey],
				limit: 100
			});
			if (local.length > 0) adminFormTemplates = buildTemplates(local);

			// 2. Fetch from relays — catches templates not yet in local DB
			try {
				const fromRelay = await fetchFromRelays(relays, {
					kinds: [EVENT_KINDS.FORM_TEMPLATE],
					authors: [pubkey],
					limit: 100
				});
				if (fromRelay?.length > 0) {
					await putEvents(fromRelay);
					// Merge: relay events take precedence (newer created_at wins)
					const byDTag = new Map();
					for (const e of [...local, ...fromRelay]) {
						const d = e.tags?.find((t) => t[0] === 'd')?.[1] ?? e.id;
						const existing = byDTag.get(d);
						if (!existing || e.created_at > existing.created_at) byDTag.set(d, e);
					}
					adminFormTemplates = buildTemplates([...byDTag.values()]);
				}
			} catch {
				/* relay fetch failed; local results already shown */
			}
		})();
	});

	// Admin: reactively track join requests count via liveQuery so it updates
	// whenever new form responses arrive in Dexie (same device or after relay fetch).
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey || !isCommunityAdmin) return;
		const communityPubkey = selectedCommunity.pubkey;
		const sub = liveQuery(async () => {
			const evs = await queryEvents({
				kinds: [EVENT_KINDS.FORM_RESPONSE],
				'#p': [communityPubkey],
				limit: 200
			});
			return evs.length;
		}).subscribe({
			next: (count) => {
				joinRequestsCount = count ?? 0;
			},
			error: (e) => console.error('[Admin] joinRequestsCount liveQuery error', e)
		});
		return () => sub.unsubscribe();
	});

	// When Join Requests modal opens: fetch from relay first (catches requests from
	// other devices not yet in local Dexie), then load and decrypt all.
	$effect(() => {
		if (!browser || !joinRequestsModalOpen || !isCommunityAdmin || !selectedCommunity?.pubkey)
			return;
		const communityPubkey = selectedCommunity.pubkey;
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS);
		(async () => {
			// Pull any unsynced requests from relay into Dexie first.
			// This also triggers the liveQuery above to update the badge count.
			try {
				await fetchFromRelays(
					relays,
					{
						kinds: [EVENT_KINDS.FORM_RESPONSE],
						'#p': [communityPubkey],
						limit: 200
					},
					{ timeout: 5000 }
				);
			} catch {
				/* non-fatal — local results shown regardless */
			}

			const evs = await queryEvents({
				kinds: [EVENT_KINDS.FORM_RESPONSE],
				'#p': [communityPubkey],
				limit: 200
			});
			joinRequestsList = evs;
			const next = new Map();
			for (const req of evs) {
				if (req.content?.trim()) {
					try {
						const plain = await decrypt44(req.pubkey, req.content);
						next.set(req.id, plain);
					} catch {
						next.set(req.id, '(private)');
					}
				}
			}
			joinRequestsDecrypted = next;
		})();
	});

	function getListByFormAddress(formAddress) {
		if (!formAddress?.trim()) return null;
		const item = membersListData.find((i) => i.parsed?.form?.trim() === formAddress.trim());
		return item?.listEvent ?? null;
	}

	async function approveJoinRequest(requestEvent) {
		const formATag = requestEvent.tags?.find((t) => t[0] === 'a')?.[1];
		if (!formATag) return;
		let listEv = getListByFormAddress(formATag);
		if (!listEv && selectedCommunity?.pubkey) {
			const parts = formATag.split(':');
			const dTag = parts.length >= 3 ? parts.slice(2).join(':') : '';
			listEv = await queryEvent({
				kinds: [EVENT_KINDS.PROFILE_LIST],
				authors: [selectedCommunity.pubkey],
				'#d': [dTag]
			});
		}
		if (!listEv) return;
		const parsed = parseProfileList(listEv);
		if (parsed?.members?.includes(requestEvent.pubkey)) {
			joinRequestsApprovingId = null;
			return;
		}
		joinRequestsApprovingId = requestEvent.id;
		try {
			const newMembers = [...(parsed?.members ?? []), requestEvent.pubkey].filter(Boolean);
			const rawTags = listEv.tags || [];
			const newTags = rawTags.filter((t) => t[0] !== 'p').map((t) => [...t]);
			newMembers.forEach((p) => newTags.push(['p', p]));
			const newEv = await signEvent({
				kind: EVENT_KINDS.PROFILE_LIST,
				content: String(listEv.content ?? ''),
				tags: newTags,
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([newEv]);
			const approveRelays = [
				...new Set([...(selectedCommunity?.relays ?? []), ...COMMUNITY_WRITE_RELAYS])
			];
			await publishToRelays(approveRelays, newEv);
			joinRequestsCount = Math.max(0, joinRequestsCount - 1);
			joinRequestsList = joinRequestsList.filter((r) => r.id !== requestEvent.id);
		} finally {
			joinRequestsApprovingId = null;
		}
	}

	async function addProfileToList(listEvent) {
		if (!listViewMoreAddInput.trim() || listViewMoreAddSubmitting || !listViewMoreModal) return;
		if (!listEvent) {
			listViewMoreAddError = 'List event not loaded yet. Close and reopen this panel.';
			return;
		}
		let pubkey = listViewMoreAddInput.trim();
		if (pubkey.startsWith('npub')) {
			try {
				const d = nip19.decode(pubkey);
				if (d?.type === 'npub') pubkey = d.data;
			} catch {
				listViewMoreAddError = 'Invalid npub';
				return;
			}
		}
		if (pubkey.length !== 64 || !/^[a-fA-F0-9]+$/.test(pubkey)) {
			listViewMoreAddError = 'Enter a valid npub or hex pubkey';
			return;
		}
		const parsed = parseProfileList(listEvent);
		if (parsed?.members?.includes(pubkey)) {
			listViewMoreAddError = 'Already a member';
			return;
		}
		listViewMoreAddError = '';
		listViewMoreAddSubmitting = true;
		try {
			const newMembers = [...(parsed?.members ?? []), pubkey];
			const rawTags = listEvent.tags || [];
			const newTags = rawTags.filter((t) => t[0] !== 'p').map((t) => [...t]);
			newMembers.forEach((p) => newTags.push(['p', p]));
			const newEv = await signEvent({
				kind: listEvent.kind ?? EVENT_KINDS.PROFILE_LIST,
				content: String(listEvent.content ?? ''),
				tags: newTags,
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([newEv]);
			const addRelays = [
				...new Set([...(selectedCommunity?.relays ?? []), ...COMMUNITY_WRITE_RELAYS])
			];
			await publishToRelays(addRelays, newEv);
			const newParsed = parseProfileList(newEv);
			const addr = listViewMoreModal.listAddress;
			listViewMoreModal = { ...listViewMoreModal, listEvent: newEv, parsed: newParsed };
			adminProfileLists = adminProfileLists.map((l) =>
				l.listAddress === addr ? { ...l, listEvent: newEv, parsed: newParsed } : l
			);
			membersListData = membersListData.map((l) =>
				l.listAddress === addr ? { ...l, listEvent: newEv, parsed: newParsed } : l
			);
			listViewMoreAddInput = '';
		} catch (e) {
			listViewMoreAddError = e?.message || 'Failed to add';
		} finally {
			listViewMoreAddSubmitting = false;
		}
	}

	async function removeProfileFromList(listEvent, memberPubkey) {
		const parsed = parseProfileList(listEvent);
		if (!parsed?.members?.length) return;
		const newMembers = parsed.members.filter((p) => p !== memberPubkey);
		const rawTags = listEvent.tags || [];
		const newTags = rawTags.filter((t) => t[0] !== 'p').map((t) => [...t]);
		newMembers.forEach((p) => newTags.push(['p', p]));
		try {
			const newEv = await signEvent({
				kind: EVENT_KINDS.PROFILE_LIST,
				content: String(listEvent.content ?? ''),
				tags: newTags,
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([newEv]);
			const removeRelays = [
				...new Set([...(selectedCommunity?.relays ?? []), ...COMMUNITY_WRITE_RELAYS])
			];
			await publishToRelays(removeRelays, newEv);
			if (listViewMoreModal?.listEvent?.id === listEvent.id) {
				listViewMoreModal = {
					...listViewMoreModal,
					listEvent: newEv,
					parsed: { ...parseProfileList(newEv), members: newMembers }
				};
			}
			membersListData = membersListData.map((item) =>
				item.listEvent?.id === listEvent.id
					? { ...item, listEvent: newEv, parsed: parseProfileList(newEv) }
					: item
			);
		} catch {
			/* ignore */
		}
	}

	/** Save list edits; overrides = { name, image, description, form } from unified list form.
	 *  Pure save — caller is responsible for managing listFormSubmitting / listFormError. */
	async function saveListEdits(listEvent, overrides) {
		if (!overrides) return;
		// Publish to both community relays and global write relays so the list
		// is reachable even if community-specific relays reject the write.
		const writeRelays = [
			...new Set([...(selectedCommunity?.relays ?? []), ...COMMUNITY_WRITE_RELAYS])
		];
		const rawTags = listEvent.tags || [];
		const newTags = rawTags
			.filter((t) => t[0] !== 'name' && t[0] !== 'form' && t[0] !== 'image')
			.map((t) => [...t]);
		newTags.push(['name', (overrides.name || '').trim() || 'List']);
		const formVal = (overrides.form || '').trim();
		if (formVal) newTags.push(['form', formVal]);
		const imageVal = (overrides.image || '').trim();
		if (imageVal) newTags.push(['image', imageVal]);
		const newEv = await signEvent({
			kind: EVENT_KINDS.PROFILE_LIST,
			content: String(overrides.description ?? ''),
			tags: newTags,
			created_at: Math.floor(Date.now() / 1000)
		});
		await putEvents([newEv]);
		await publishToRelays(writeRelays, newEv);
		// Re-publish the linked form template so it is findable by joining users on the relay.
		if (formVal) {
			const fParts = formVal.split(':');
			const fPubkey = fParts[1];
			const fD = fParts.length >= 3 ? fParts.slice(2).join(':') : '';
			if (fPubkey && fD) {
				try {
					const formEv = await queryEvent({
						kinds: [EVENT_KINDS.FORM_TEMPLATE],
						authors: [fPubkey],
						'#d': [fD]
					});
					if (formEv) await publishToRelays(writeRelays, formEv);
				} catch {
					/* non-fatal */
				}
			}
		}
		const newParsed = parseProfileList(newEv);
		const editedDTag = listEvent.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
		const editedListAddress = `${EVENT_KINDS.PROFILE_LIST}:${listEvent.pubkey}:${editedDTag}`;
		if (listViewMoreModal?.listEvent?.id === listEvent.id) {
			listViewMoreModal = { ...listViewMoreModal, listEvent: newEv, parsed: newParsed };
		}
		membersListData = membersListData.map((item) =>
			item.listEvent?.id === listEvent.id || item.listAddress === editedListAddress
				? { ...item, listEvent: newEv, parsed: newParsed }
				: item
		);
		adminProfileLists = adminProfileLists.map((entry) =>
			entry.listEvent?.id === listEvent.id || entry.listAddress === editedListAddress
				? {
						...entry,
						listEvent: newEv,
						parsed: newParsed,
						name: newParsed?.name ?? entry.name,
						image: newParsed?.image ?? null
					}
				: entry
		);
		listFormModal = null;
	}

	function openViewMoreModal(item) {
		listViewMoreModal = {
			listAddress: item.listAddress,
			listEvent: item.listEvent,
			parsed: item.parsed
		};
	}
	function openEditListModal(item) {
		openListFormModal('edit', item);
	}
	function openListFormModal(mode, item) {
		listFormModal =
			mode === 'add'
				? { mode: 'add' }
				: {
						mode: 'edit',
						listAddress: item.listAddress,
						listEvent: item.listEvent,
						parsed: item.parsed
					};
		listFormError = '';
		if (mode === 'add') {
			listFormName = '';
			listFormImage = '';
			listFormDescription = '';
			listFormFormAddress = '';
		} else {
			listFormName = item.parsed?.name ?? '';
			listFormImage = item.parsed?.image ?? '';
			listFormDescription = item.parsed?.content ?? item.listEvent?.content ?? '';
			listFormFormAddress = item.parsed?.form ?? '';
		}
	}
	async function submitListForm() {
		if (!listFormModal || listFormSubmitting) return;
		listFormError = '';
		listFormSubmitting = true;
		try {
			if (listFormModal.mode === 'add') {
				if (!selectedCommunity?.pubkey) throw new Error('No community');
				const listName = (listFormName || '').trim() || 'List';
				const dTag =
					listName
						.toLowerCase()
						.replace(/\s+/g, '-')
						.replace(/[^a-z0-9-]/g, '') || 'list';
				const tags = [
					['d', dTag],
					['name', listName],
					['p', selectedCommunity.pubkey]
				];
				const imageVal = (listFormImage || '').trim();
				if (imageVal) tags.push(['image', imageVal]);
				const formVal = (listFormFormAddress || '').trim();
				if (formVal) tags.push(['form', formVal]);
				const listEv = await signEvent({
					kind: EVENT_KINDS.PROFILE_LIST,
					content: String(listFormDescription ?? ''),
					tags,
					created_at: Math.floor(Date.now() / 1000)
				});
				await putEvents([listEv]);
				const relays = selectedCommunity.relays?.length
					? selectedCommunity.relays
					: COMMUNITY_WRITE_RELAYS;
				await publishToRelays(relays, listEv);
				const newParsed = parseProfileList(listEv);
				const newListItem = {
					listAddress: `30000:${listEv.pubkey}:${dTag}`,
					name: newParsed?.name ?? listName,
					image: newParsed?.image ?? null,
					listEvent: listEv,
					parsed: newParsed
				};
				adminProfileLists = [...adminProfileLists, newListItem];
				listFormModal = null;
			} else {
				await saveListEdits(listFormModal.listEvent, {
					name: listFormName,
					image: listFormImage,
					description: listFormDescription,
					form: listFormFormAddress
				});
			}
		} catch (e) {
			listFormError =
				e?.message ?? (listFormModal.mode === 'add' ? 'Failed to add list' : 'Failed to save list');
		} finally {
			listFormSubmitting = false;
		}
	}
	function _openListPickerForPreset(presetId) {
		adminListPickerPresetId = presetId;
	}

	// When Join modal opens, load joinable lists (profile lists with form that user is not in)
	$effect(() => {
		if (!joinModalOpen || !selectedCommunity?.pubkey || !currentPubkey) return;
		if (joinStep !== 'list') return;
		const comm = parseCommunity(selectedCommunity.raw || selectedCommunity);
		const sections = comm?.sections ?? [];
		// Per spec: check community's own declared relays first; fall back to write-safe relays.
		const relays = selectedCommunity.mainRelay
			? [selectedCommunity.mainRelay]
			: (selectedCommunity.relays?.length ? selectedCommunity.relays : COMMUNITY_WRITE_RELAYS);
		let cancelled = false;
		(async () => {
			// Aggregate sectionNames + sectionKinds from ALL sections per list address
			// (a list may be shared across multiple sections — same logic as membersListData).
			const addrs = (sec) =>
				sec.profileListAddresses ?? (sec.profileListAddress ? [sec.profileListAddress] : []);
			const listToSectionInfo = new Map(); // listAddress -> { names[], kindsSet }
			for (const sec of sections) {
				for (const listAddress of addrs(sec)) {
					if (!listAddress) continue;
					if (!listToSectionInfo.has(listAddress))
						listToSectionInfo.set(listAddress, { names: [], kindsSet: new Set() });
					const info = listToSectionInfo.get(listAddress);
					info.names.push(sec.name ?? '');
					(sec.kinds ?? []).forEach((k) => info.kindsSet.add(k));
				}
			}
			const list = [];
			for (const [listAddress, sectionInfo] of listToSectionInfo) {
				if (cancelled) return;
				const { dTag = '' } = parseEventAddress(listAddress) ?? {};
				let listEv = await queryEvent({
					kinds: [EVENT_KINDS.PROFILE_LIST],
					authors: [selectedCommunity.pubkey],
					'#d': [dTag]
				});
				if (cancelled) return;
				if (!listEv) {
					listEv = await fetchProfileListFromRelays(relays, listAddress);
					if (listEv) await putEvents([listEv]);
				}
				if (cancelled) return;
				const parsed = listEv ? parseProfileList(listEv) : null;
				if (!parsed?.form) continue;
				if (parsed.members?.includes(currentPubkey)) continue;
				// Pre-fetch & cache the form template so it's ready when the user taps.
				try {
					await fetchFreshFormTemplate(parsed.form, relays);
				} catch {
					/* non-fatal */
				}
				if (cancelled) return;
				list.push({
					formAddress: parsed.form,
					listName: parsed.name || sectionInfo.names[0] || '',
					listDescription: parsed.content ?? '',
					listAddress,
					image: parsed.image ?? null,
					sectionName: sectionInfo.names.join(', '),
					sectionKinds: [...sectionInfo.kindsSet],
					members: parsed.members ?? []
				});
			}
			if (!cancelled) joinableLists = list;
		})();
		return () => {
			cancelled = true;
		};
	});

	/**
	 * Load the form template for the selected join list.
	 * Shows local immediately, then updates with the freshest version from relay
	 * (local cache may be stale — missing fields added after the last sync).
	 *
	 * IMPORTANT: joinFieldValues must be initialised for every field before the template
	 * renders them with bind:value. Svelte 5 throws props_invalid_value if bind:value
	 * receives undefined when the prop has a fallback, which breaks the entire runtime.
	 */
	async function fetchJoinForm(formAddressVal) {
		joinFormTemplate = null;
		joinParsedForm = null;
		joinFieldValues = {};
	if (!formAddressVal) return;
	const relays = selectedCommunity?.mainRelay
		? [selectedCommunity.mainRelay]
		: (selectedCommunity?.relays?.length ? selectedCommunity.relays : COMMUNITY_WRITE_RELAYS);

	/** Apply a parsed form and ensure every field has a defined (non-undefined) value. */
		function applyForm(parsed) {
			joinParsedForm = parsed;
			if (parsed?.fields?.length) {
				const vals = {};
				for (const f of parsed.fields) {
					// Preserve any value the user already typed; fall back to field default then ''.
					vals[f.id] = joinFieldValues[f.id] ?? f.defaultValue ?? '';
				}
				joinFieldValues = vals;
			}
		}

		const local = await getLocalFormTemplate(formAddressVal);
		if (local) {
			joinFormTemplate = local;
			applyForm(parseFormTemplate(local));
		}

		try {
			const fresh = await fetchFreshFormTemplate(formAddressVal, relays);
			if (fresh && (!local || fresh.created_at >= local.created_at)) {
				joinFormTemplate = fresh;
				applyForm(parseFormTemplate(fresh));
			}
		} catch (e) {
			console.error('[fetchJoinForm] relay error:', e);
		}
	}

	async function submitJoinForm() {
		const formAddr = selectedJoinList?.formAddress;
		if (!formAddr || !selectedCommunity?.pubkey || !currentPubkey) return;
		const parsed = joinParsedForm;
		// Validate required fields
		for (const field of parsed?.fields ?? []) {
			if (field.required && !(joinFieldValues[field.id] ?? '').trim()) {
				joinError = `"${field.label}" is required.`;
				return;
			}
		}
		joinSubmitting = true;
		joinError = '';
		try {
			const relays = selectedCommunity.relays?.length
				? selectedCommunity.relays
				: DEFAULT_COMMUNITY_RELAYS;
			const isPublic = parsed?.isPublic ?? false;
			// Build response tags: one per field + fallback message field
			const hasFields = (parsed?.fields?.length ?? 0) > 0;
			/** @type {string[][]} */
			const responseTags = hasFields
				? (parsed?.fields ?? []).map((f) => ['response', f.id, joinFieldValues[f.id] ?? ''])
				: [['response', 'message', joinMessage.trim() || ' ']];
			let eventContent = '';
			/** @type {string[][]} */
			const eventTags = [
				['a', formAddr],
				['p', selectedCommunity.pubkey]
			];
			if (isPublic) {
				responseTags.forEach((t) => eventTags.push(t));
			} else {
				try {
					eventContent = await encrypt44(selectedCommunity.pubkey, JSON.stringify(responseTags));
					eventTags.push(['encrypted']);
				} catch (encErr) {
					// NIP-44 not supported by this signer — send as plaintext instead
					if (String(encErr?.message).includes('not supported')) {
						responseTags.forEach((t) => eventTags.push(t));
					} else {
						throw encErr;
					}
				}
			}
			const signed = await signEvent({
				kind: EVENT_KINDS.FORM_RESPONSE,
				content: eventContent,
				tags: eventTags,
				created_at: Math.floor(Date.now() / 1000)
			});
			await publishToRelays(relays, signed);
			joinConfirmationMessage = parsed?.confirmationMessage ?? '';
			joinStep = 'done';
		} catch (e) {
			joinError = e?.message || 'Failed to submit';
		} finally {
			joinSubmitting = false;
		}
	}
	function closeJoinModal() {
		joinModalOpen = false;
		joinContext = null;
		joinStep = 'list';
		selectedJoinList = null;
		joinableLists = [];
		joinFormTemplate = null;
		joinParsedForm = null;
		joinFormLoading = false;
		joinFetched = false;
		joinMessage = '';
		joinFieldValues = {};
		joinConfirmationMessage = '';
		joinError = '';
	}

	async function saveCommunityEditPicture() {
		if (!selectedCommunity?.pubkey || communityEditSubmitting) return;
		communityEditError = '';
		communityEditSubmitting = true;
		try {
			const pubkey = selectedCommunity.pubkey;
			const content = JSON.stringify({
				display_name: selectedCommunity.displayName ?? selectedCommunity.name ?? '',
				name: selectedCommunity.name ?? selectedCommunity.displayName ?? '',
				about: selectedCommunity.about ?? '',
				picture: communityEditPicture.trim(),
				community: `10222:${pubkey}:`
			});
			const ev = await signEvent({
				kind: EVENT_KINDS.PROFILE,
				content,
				tags: [['community', `10222:${pubkey}:`]],
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([ev]);
			await publishToRelays(
				selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS,
				ev
			);
			communityEditModalOpen = false;
			communityEditTarget = null;
		} catch (e) {
			communityEditError = e?.message ?? 'Failed to save';
		} finally {
			communityEditSubmitting = false;
		}
	}

	async function saveCommunityEditName() {
		if (!selectedCommunity?.pubkey || communityEditSubmitting) return;
		communityEditError = '';
		communityEditSubmitting = true;
		try {
			const pubkey = selectedCommunity.pubkey;
			const name = communityEditName.trim() || 'Unnamed';
			const content = JSON.stringify({
				display_name: name,
				name,
				about: selectedCommunity.about ?? '',
				picture: selectedCommunity.picture ?? '',
				community: `10222:${pubkey}:`
			});
			const ev = await signEvent({
				kind: EVENT_KINDS.PROFILE,
				content,
				tags: [['community', `10222:${pubkey}:`]],
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([ev]);
			await publishToRelays(
				selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS,
				ev
			);
			communityEditModalOpen = false;
			communityEditTarget = null;
		} catch (e) {
			communityEditError = e?.message ?? 'Failed to save';
		} finally {
			communityEditSubmitting = false;
		}
	}

	async function saveCommunityEditDescription() {
		if (!selectedCommunity?.pubkey || communityEditSubmitting) return;
		communityEditError = '';
		communityEditSubmitting = true;
		try {
			const pubkey = selectedCommunity.pubkey;
			const content = JSON.stringify({
				display_name: selectedCommunity.displayName ?? selectedCommunity.name ?? '',
				name: selectedCommunity.name ?? selectedCommunity.displayName ?? '',
				about: communityEditDescription.trim(),
				picture: selectedCommunity.picture ?? '',
				community: `10222:${pubkey}:`
			});
			const ev = await signEvent({
				kind: EVENT_KINDS.PROFILE,
				content,
				tags: [['community', `10222:${pubkey}:`]],
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([ev]);
			await publishToRelays(
				selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS,
				ev
			);
			communityEditModalOpen = false;
			communityEditTarget = null;
		} catch (e) {
			communityEditError = e?.message ?? 'Failed to save';
		} finally {
			communityEditSubmitting = false;
		}
	}

	async function saveCommunityEditServers() {
		if (!selectedCommunity?.raw || communityEditSubmitting) return;
		communityEditError = '';
		communityEditSubmitting = true;
		try {
			const raw = selectedCommunity.raw;
			const relayList = communityEditRelays
				.split(/[\n,]+/)
				.map((r) => r.trim())
				.filter(Boolean);
			const blossomList = communityEditBlossom
				.split(/[\n,]+/)
				.map((b) => b.trim())
				.filter(Boolean);
			const newTags = [];
			for (const t of raw.tags ?? []) {
				if (t[0] !== 'r' && t[0] !== 'blossom') newTags.push([...t]);
			}
			relayList.forEach((r, i) => {
				if (i === 0 && communityEditRelayEnforced) newTags.push(['r', r, 'enforced']);
				else newTags.push(['r', r]);
			});
			blossomList.forEach((b) => newTags.push(['blossom', b]));
			const ev = await signEvent({
				kind: EVENT_KINDS.COMMUNITY,
				content: raw.content ?? '',
				tags: newTags,
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([ev]);
			await publishToRelays(relayList.length > 0 ? relayList : DEFAULT_COMMUNITY_RELAYS, ev);
			communityEditModalOpen = false;
			communityEditTarget = null;
		} catch (e) {
			communityEditError = e?.message ?? 'Failed to save';
		} finally {
			communityEditSubmitting = false;
		}
	}

	async function saveCommunityAdminAll() {
		if (!selectedCommunity?.pubkey || adminSaveSubmitting) return;
		adminSaveError = '';
		adminSaveSubmitting = true;
		const pubkey = selectedCommunity.pubkey;
		const relayList = adminRelays
			.split(/[\n,]+/)
			.map((r) => r.trim())
			.filter(Boolean);
		const relays = relayList.length > 0 ? relayList : DEFAULT_COMMUNITY_RELAYS;
		try {
			// 1. Kind 0 profile (name, picture, about)
			const profileContent = JSON.stringify({
				display_name: adminName.trim() || 'Unnamed',
				name: adminName.trim() || 'Unnamed',
				about: adminDescription.trim(),
				picture: adminPicture.trim(),
				community: `10222:${pubkey}:`
			});
			const profileEv = await signEvent({
				kind: EVENT_KINDS.PROFILE,
				content: profileContent,
				tags: [['community', `10222:${pubkey}:`]],
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([profileEv]);
			await publishToRelays(relays, profileEv);

			// 2. Kind 10222 community (r, blossom, content sections)
			const blossomList = adminBlossom
				.split(/[\n,]+/)
				.map((b) => b.trim())
				.filter(Boolean);
			const newTags = [];
			relayList.forEach((r, i) => {
				if (i === 0 && adminRelayEnforced) newTags.push(['r', r, 'enforced']);
				else newTags.push(['r', r]);
			});
			blossomList.forEach((b) => newTags.push(['blossom', b]));
		for (const preset of ADMIN_SECTION_PRESETS) {
			if (!adminSectionEnabled[preset.id]) continue;
			const addrs = Array.isArray(adminSectionListAddress[preset.id])
				? adminSectionListAddress[preset.id].filter((a) => (a || '').trim())
				: (adminSectionListAddress[preset.id] || '').trim()
					? [adminSectionListAddress[preset.id].trim()]
					: [];
			newTags.push(['content', preset.name]);
			(preset.kinds ?? []).forEach((k) => newTags.push(['k', String(k)]));
			addrs.forEach((addr) => newTags.push(['a', addr]));
		}
			const communityEv = await signEvent({
				kind: EVENT_KINDS.COMMUNITY,
				content: '',
				tags: newTags,
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([communityEv]);
			await publishToRelays(relays, communityEv);
			// Allow form to re-sync when updated community/profile data arrives
			lastAdminSyncedPubkey = null;
		} catch (e) {
			adminSaveError = e?.message ?? 'Failed to save';
		} finally {
			adminSaveSubmitting = false;
		}
	}

	async function saveCommunityEditSection() {
		if (!selectedCommunity?.raw || communityEditSubmitting) return;
		const match = communityEditTarget && String(communityEditTarget).match(/^section-(\d+)$/);
		const idx = match ? parseInt(match[1], 10) : -1;
		const comm = parseCommunity(selectedCommunity.raw);
		const sections = comm?.sections ?? [];
		if (idx < 0 || idx >= sections.length) return;
		communityEditError = '';
		communityEditSubmitting = true;
		try {
			const raw = selectedCommunity.raw;
			const sectionName = communityEditSectionName.trim() || sections[idx]?.name || 'Section';
			const listAddress =
				communityEditSectionListAddress.trim() || sections[idx]?.profileListAddress || '';
			const updatedSections = sections.map((sec, i) =>
				i === idx
					? {
							...sec,
							name: sectionName,
							profileListAddress: listAddress || sec.profileListAddress,
							profileListAddresses: listAddress ? [listAddress] : []
						}
					: sec
			);
			const newTags = (raw.tags ?? []).filter(
				(t) => t[0] !== 'content' && t[0] !== 'k' && t[0] !== 'a'
			);
			for (const sec of updatedSections) {
				newTags.push(['content', sec.name]);
				(sec.kinds ?? []).forEach((k) => newTags.push(['k', String(k)]));
				const addrs =
					sec.profileListAddresses ?? (sec.profileListAddress ? [sec.profileListAddress] : []);
				addrs.forEach((a) => newTags.push(['a', a]));
			}
			const ev = await signEvent({
				kind: EVENT_KINDS.COMMUNITY,
				content: raw.content ?? '',
				tags: newTags,
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([ev]);
			await publishToRelays(
				selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS,
				ev
			);
			communityEditModalOpen = false;
			communityEditTarget = null;
		} catch (e) {
			communityEditError = e?.message ?? 'Failed to save';
		} finally {
			communityEditSubmitting = false;
		}
	}

	function openFormTemplateModal(mode, item = null) {
		if (mode === 'edit' && item) {
			const parsed = item.parsed;
			formTemplateName = parsed?.name ?? '';
			formTemplateDescription =
				parsed?.description ?? item.event?.tags?.find((t) => t[0] === 'description')?.[1] ?? '';
			formTemplateDTag = parsed?.dTag ?? '';
			formTemplateConfirmMsg = parsed?.confirmationMessage ?? '';
			formTemplatePublic = parsed?.isPublic ?? false;
			formTemplateFields = (parsed?.fields ?? []).map((f) => ({
				...f,
				optionsStr: (f.selectOptions ?? []).join(', ')
			}));
			formTemplateModal = { mode: 'edit', event: item.event, parsed };
		} else {
			formTemplateName = '';
			formTemplateDescription = '';
			formTemplateDTag = '';
			formTemplateConfirmMsg = '';
			formTemplatePublic = false;
			formTemplateFields = [];
			formTemplateModal = { mode: 'add' };
		}
		formTemplateError = '';
	}

	function addFormField() {
		formTemplateFields = [
			...formTemplateFields,
			{
				id: '',
				type: 'text',
				label: '',
				defaultValue: '',
				required: false,
				placeholder: '',
				optionsStr: ''
			}
		];
	}
	function removeFormField(idx) {
		formTemplateFields = formTemplateFields.filter((_, i) => i !== idx);
	}
	function updateFormField(idx, key, value) {
		formTemplateFields = formTemplateFields.map((f, i) => (i === idx ? { ...f, [key]: value } : f));
	}

	async function saveFormTemplate() {
		if (!formTemplateName.trim() || !formTemplateDTag.trim()) {
			formTemplateError = 'Name and form ID are required.';
			return;
		}
		formTemplateSubmitting = true;
		formTemplateError = '';
		try {
			// Per the community spec, all community content must go to the community's own declared relays.
			// If the community has no declared relays, fall back to COMMUNITY_WRITE_RELAYS (excludes
			// relay.primal.net which is read-only and silently drops all write attempts).
			const relays = selectedCommunity?.relays?.length
				? selectedCommunity.relays
				: COMMUNITY_WRITE_RELAYS;
			// Preserve unrelated existing tags (auto_response, etc.); drop fields we now manage
			const managedKeys = new Set([
				'name',
				'description',
				'd',
				'field',
				'confirmation_message',
				'public'
			]);
			const existingTags =
				formTemplateModal?.mode === 'edit'
					? (formTemplateModal.event?.tags ?? []).filter((t) => !managedKeys.has(t[0]))
					: [];
			const fieldTags = formTemplateFields
				.filter((f) => f.label.trim())
				.map((f) => {
					// Auto-generate an ID from the label if the admin left it blank
					const id =
						f.id.trim() ||
						f.label
							.trim()
							.toLowerCase()
							.replace(/[^a-z0-9]+/g, '-')
							.replace(/^-|-$/g, '');
					const opts = {};
					if (f.required) opts.required = true;
					if (f.placeholder) opts.placeholder = f.placeholder;
					if (f.selectOptions?.length) opts.options = f.selectOptions;
					return ['field', id, f.type, f.label.trim(), f.defaultValue ?? '', JSON.stringify(opts)];
				});
		const tags = [
			['d', formTemplateDTag.trim()],
			['name', formTemplateName.trim()],
			...(selectedCommunity?.pubkey ? [['h', selectedCommunity.pubkey]] : []),
			...(formTemplateDescription.trim()
				? [['description', formTemplateDescription.trim()]]
				: []),
			...fieldTags,
			...(formTemplateConfirmMsg.trim()
				? [['confirmation_message', formTemplateConfirmMsg.trim()]]
				: []),
			...(formTemplatePublic ? [['public']] : []),
			...existingTags.filter((t) => t[0] !== 'h')
		];
			const ev = await signEvent({
				kind: EVENT_KINDS.FORM_TEMPLATE,
				tags,
				content: formTemplateModal?.mode === 'edit' ? (formTemplateModal.event?.content ?? '') : '',
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([ev]);
			await publishToRelays(relays, ev);
			formTemplateModal = null;
			// Refresh list — newly saved event is already in local DB via putEvents
			const fresh = await queryEvents({
				kinds: [EVENT_KINDS.FORM_TEMPLATE],
				authors: [selectedCommunity.pubkey],
				limit: 100
			});
			const allLists = membersListData.length > 0 ? membersListData : adminProfileLists;
			adminFormTemplates = fresh.map((e) => {
				const parsed = parseFormTemplate(e);
				const dTag = e.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				const formAddr = `${EVENT_KINDS.FORM_TEMPLATE}:${e.pubkey}:${dTag}`;
				const linkedLists = allLists
					.filter((l) => l.parsed?.form?.trim() === formAddr)
					.map((l) => l.parsed?.name ?? l.sectionName ?? 'List');
				return { event: e, parsed, formAddr, linkedLists: [...new Set(linkedLists)] };
			});
		} catch (e) {
			formTemplateError = e?.message ?? 'Failed to save form template.';
		} finally {
			formTemplateSubmitting = false;
		}
	}

	function openCommunityEdit(target) {
		communityEditTarget = target;
		communityEditError = '';
		if (target === 'picture' || target === 'full')
			communityEditPicture = selectedCommunity?.picture ?? '';
		if (target === 'name' || target === 'full')
			communityEditName = selectedCommunity?.displayName ?? selectedCommunity?.name ?? '';
		if (target === 'description' || target === 'full')
			communityEditDescription = selectedCommunity?.about ?? selectedCommunity?.description ?? '';
		if (target === 'relays' || target === 'full') {
			communityEditRelays = (selectedCommunity?.relays ?? []).join('\n');
			const _editFirstRTag = (selectedCommunity?.raw?.tags ?? []).find((t) => t[0] === 'r');
			communityEditRelayEnforced = _editFirstRTag?.[2] === 'enforced';
			communityEditBlossom = (selectedCommunity?.raw?.tags ?? [])
				.filter((t) => t[0] === 'blossom')
				.map((t) => t[1])
				.join('\n');
		}
		const sectionMatch = target && String(target).match(/^section-(\d+)$/);
		if (sectionMatch) {
			const i = parseInt(sectionMatch[1], 10);
			const sec = communityModalSections[i];
			if (sec) {
				communityEditSectionName = sec.sectionName ?? '';
				communityEditSectionListAddress = sec.listAddress ?? '';
			}
		}
		communityEditModalOpen = true;
	}

	/**
	 * Open a wiki article — navigates to /wiki/[naddr] (real SvelteKit route).
	 */
	/** Build a profiles snapshot for the two pubkeys that matter in a detail header. */
	function handoffProfiles(...pubkeys) {
		const m = new Map();
		for (const pk of pubkeys) {
			if (pk) {
				const ev = profilesByPubkey.get(pk);
				if (ev) m.set(pk, ev);
			}
		}
		return m;
	}

	function openWiki(wikiEvent, slug) {
		try {
			const naddr = nip19.naddrEncode({ kind: 30818, pubkey: wikiEvent.pubkey, identifier: slug });
			navHandoff.set(naddr, {
				event: wikiEvent,
				communityNpub: selectedCommunity?.npub ?? communityNpub,
				profiles: handoffProfiles(wikiEvent.pubkey, selectedCommunity?.pubkey)
			});
			goto(`/wiki/${naddr}`);
		} catch {
			goto(
				`/community/${encodeURIComponent(selectedCommunity?.npub ?? communityNpub)}?wiki=${encodeURIComponent(slug)}`
			);
		}
	}

	/**
	 * Open a forum post — navigates to /forum/[nevent] (real SvelteKit route).
	 */
	function openPost(post) {
		try {
			const nevent = nip19.neventEncode({ id: post.id, author: post.pubkey });
			// post._raw is the raw Nostr event; ForumPostDetail needs the raw event, not the parsed shape.
			const rawEvent = post._raw ?? post;
			navHandoff.set(nevent, {
				event: rawEvent,
				communityNpub: selectedCommunity?.npub ?? communityNpub,
				profiles: handoffProfiles(post.pubkey, selectedCommunity?.pubkey)
			});
			goto(`/forum/${nevent}`);
		} catch {
			goto(
				`/community/${encodeURIComponent(selectedCommunity?.npub ?? communityNpub)}?post=${encodeURIComponent(post.id)}`
			);
		}
	}

	/**
	 * Open a task — navigates to /task/[naddr] (real SvelteKit route).
	 */
	function openTask(task) {
		try {
			const dTag = task.tags?.find((/** @type {string[]} */ t) => t[0] === 'd')?.[1] ?? '';
			const naddr = nip19.naddrEncode({ kind: task.kind, pubkey: task.pubkey, identifier: dTag });
			navHandoff.set(naddr, {
				event: task,
				communityNpub: selectedCommunity?.npub ?? communityNpub,
				profiles: handoffProfiles(task.pubkey, selectedCommunity?.pubkey)
			});
			goto(`/task/${naddr}`);
		} catch {
			goto(
				`/community/${encodeURIComponent(selectedCommunity?.npub ?? communityNpub)}?task=${encodeURIComponent(task.id)}`
			);
		}
	}
	function openCreatePost() {
		addPostModalOpen = true;
		newPostTitle = '';
		newPostContent = '';
		newPostLabels = [];
		newPostLabelInput = '';
		_newPostError = '';
	}
	function closeCreatePost() {
		addPostModalOpen = false;
		newPostTitle = '';
		newPostContent = '';
		newPostLabels = [];
		newPostLabelInput = '';
		_newPostError = '';
		newPostSubmitting = false;
	}
	function closeCreateTask() {
		addTaskModalOpen = false;
	}
	function closeCreateWiki() {
		addWikiModalOpen = false;
	}
	function handleGetStartedStart(/** @type {{ profileName: string }} */ event) {
		onboardingProfileName = event.profileName;
		spinKeyModalOpen = true;
		setTimeout(() => {
			getStartedModalOpen = false;
		}, 80);
	}
	function handleSpinComplete() {
		spinKeyModalOpen = false;
		setTimeout(() => {
			onboardingBuildingModalOpen = true;
		}, 150);
	}
	function handleUseExistingKey() {
		spinKeyModalOpen = false;
		getStartedModalOpen = true;
	}
	function _addPostLabel() {
		const v = newPostLabelInput.trim();
		if (!v || newPostLabels.includes(v)) return;
		newPostLabels = [...newPostLabels, v];
		newPostLabelInput = '';
	}
	function _removePostLabel(label) {
		newPostLabels = newPostLabels.filter((l) => l !== label);
	}
	async function _submitNewPost() {
		if (!selectedCommunity?.pubkey || !currentPubkey || newPostSubmitting) return;
		if (!newPostTitle.trim()) {
			_newPostError = 'Title is required';
			return;
		}
		const title = newPostTitle.trim();
		_newPostError = '';
		newPostSubmitting = true;
		try {
			const tagTags = (newPostLabels || []).map((l) => ['t', String(l).trim()]).filter((t) => t[1]);
			const ev = await signEvent({
				kind: EVENT_KINDS.FORUM_POST,
				content: newPostContent.trim(),
				tags: [['h', selectedCommunity.pubkey], ['title', title], ...tagTags],
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([ev]);
			await publishToRelays(
				selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS,
				ev
			);
			closeCreatePost();
		} catch (e) {
			_newPostError = e?.message || 'Failed to publish';
		} finally {
			newPostSubmitting = false;
		}
	}
	async function handleForumPostSubmit({ title, text, labels = /** @type {string[]} */ ([]) }) {
		if (!selectedCommunity?.pubkey || !currentPubkey) throw new Error('Not signed in');
		const ev = await signEvent({
			kind: EVENT_KINDS.FORUM_POST,
			content: text,
			tags: [
				['h', selectedCommunity.pubkey],
				['title', title],
				...labels.map((l) => /** @type {[string, string]} */ (['t', l]))
			],
			created_at: Math.floor(Date.now() / 1000)
		});
		await putEvents([ev]);
		await publishToRelays(
			selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS,
			ev
		);
	}

	/** @type {Record<string, string>} */
	const TASK_STATUS_MAP = {
		open: 'open',
		backlog: 'backlog',
		inProgress: 'in-progress',
		inReview: 'in-review',
		closed: 'closed'
	};

	/**
	 * @param {{ title?: string, status?: string, priority?: string, text?: string, emojiTags?: string[][], mentions?: string[], labels?: string[], assignees?: string[] }} params
	 */
	async function handleTaskSubmit({
		title = '',
		status = 'open',
		priority = 'none',
		text = '',
		emojiTags = [],
		mentions = [],
		labels = [],
		assignees = []
	}) {
		if (!selectedCommunity?.pubkey || !currentPubkey) throw new Error('Not signed in');

		const slug =
			title
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '')
				.slice(0, 40) || 'task';
		const dTag = `${slug}-${Date.now()}`;
		const relays = /** @type {string[]} */ (
			selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS
		);

		/** @type {string[][]} */
		const taskTags = [
			['d', dTag],
			['title', title.trim()],
			['h', selectedCommunity.pubkey]
		];
		assignees.forEach((pk) => taskTags.push(['p', pk, 'assignee']));
		mentions.forEach((pk) => {
			if (!assignees.includes(pk)) taskTags.push(['p', pk]);
		});
		labels.forEach((l) => taskTags.push(['t', l]));
		// emojiTags from ShortTextInput.getSerializedContent() are { shortcode, url } objects; convert to Nostr tag arrays
		emojiTags.forEach((e) => taskTags.push(Array.isArray(e) ? e : ['emoji', e.shortcode, e.url]));

		console.log('[TaskPublish] relays:', relays);

		const taskEvent = await signEvent({
			kind: EVENT_KINDS.TASK,
			content: text,
			tags: taskTags,
			created_at: Math.floor(Date.now() / 1000)
		});
		await publishToRelays(relays, taskEvent);
		console.log('[TaskPublish] task published', taskEvent.id);

		const statusValue = TASK_STATUS_MAP[status] ?? 'open';
		/** @type {string[][]} */
		const statusTags = [
			['a', `37060:${currentPubkey}:${dTag}`],
			['status', statusValue]
		];
		if (priority && priority !== 'none') statusTags.push(['priority', priority]);

		const statusEvent = await signEvent({
			kind: EVENT_KINDS.STATUS,
			content: '',
			tags: statusTags,
			created_at: Math.floor(Date.now() / 1000)
		});
		await publishToRelays(relays, statusEvent);
		console.log('[TaskPublish] status published', statusEvent.id);
	}

	/**
	 * @param {{ title: string, slug: string, summary: string, text: string, emojiTags: string[][], mentions: string[], labels: string[] }} params
	 */
	async function handleWikiSubmit({
		title,
		slug,
		summary,
		text,
		emojiTags = [],
		mentions = [],
		labels = []
	}) {
		if (!selectedCommunity?.pubkey || !currentPubkey) throw new Error('Not signed in');

		const relays = /** @type {string[]} */ (
			selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS
		);

		/** @type {string[][]} */
		const tags = [
			['d', slug],
			['title', title.trim()],
			['h', selectedCommunity.pubkey]
		];
		if (summary.trim()) tags.push(['summary', summary.trim()]);
		labels.forEach((l) => tags.push(['t', l]));
		mentions.forEach((pk) => tags.push(['p', pk]));
		emojiTags.forEach((e) => tags.push(Array.isArray(e) ? e : ['emoji', e.shortcode, e.url]));

		const ev = await signEvent({
			kind: EVENT_KINDS.WIKI,
			content: text,
			tags,
			created_at: Math.floor(Date.now() / 1000)
		});
		await publishToRelays(relays, ev);
		console.log('[WikiPublish] published', ev.id);
	}

	function formatDate(ts) {
		if (!ts) return '';
		const d = new Date(ts * 1000);
		return d.toLocaleDateString(undefined, { dateStyle: 'short' });
	}
</script>

<svelte:head>
	<title>Communities - Chateau</title>
	<meta name="description" content="Browse and join Nostr communities" />
</svelte:head>

{#if openEventEncoded}
	<div class="panel-content panel-content-detail">
		<GeneralEventDetail encoded={openEventEncoded} onBack={() => history.back()} />
	</div>
{:else if !selectedCommunity}
	<div class="panel-placeholder">
		<EmptyState message="Select a community" minHeight={280} />
	</div>
{:else if openWikiSlug}
	<div class="panel-content panel-content-detail">
		<WikiDetail
			slug={openWikiSlug}
			communityNpub={selectedCommunity.npub}
			wikiLinkFn={wikiLinkFn ?? ((s) => `#${s}`)}
			onBack={() => history.back()}
		/>
	</div>
{:else if openPostId}
	<div class="panel-content panel-content-detail">
		<ForumPostDetail
			eventId={openPostId}
			communityNpub={selectedCommunity.npub}
			onBack={() => history.back()}
			{isMember}
			onJoinRequired={() => {
				joinContext = 'forum';
				joinModalOpen = true;
			}}
		/>
	</div>
{:else if openTaskId}
	<div class="panel-content panel-content-detail">
		<TaskDetail
			eventId={openTaskId}
			communityNpub={selectedCommunity.npub}
			onBack={() => history.back()}
			{isMember}
			onJoinRequired={() => {
				joinContext = 'tasks';
				joinModalOpen = true;
			}}
		/>
	</div>
{:else if openProjectId}
	<div class="panel-content panel-content-detail">
		<ProjectDetail
			eventId={openProjectId}
			communityNpub={selectedCommunity.npub}
			onBack={() => history.back()}
		/>
	</div>
{:else if openListAddr}
	{@const listItem = [...membersListData, ...adminProfileLists].find(
		(l) => l.listAddress === openListAddr
	)}
	<div class="panel-content panel-content-detail">
		<ProfileListDetail
			listAddress={openListAddr}
			communityNpub={selectedCommunity.npub}
			communityRelays={selectedCommunity.relays ?? []}
			{isCommunityAdmin}
			sectionKinds={listItem?.sectionKinds ?? []}
			catalogs={[
				{
					name: selectedCommunity.displayName || selectedCommunity.name || 'Community',
					pictureUrl: selectedCommunity.picture || undefined,
					pubkey: selectedCommunity.pubkey
				}
			]}
			formTemplates={adminFormTemplates}
			onBack={() => history.back()}
			{getCurrentPubkey}
		/>
	</div>
{:else}
	<div class="right-header-block">
		<div class="right-header-row1">
			<span class="mobile-community-back">
				<BackButton onBack={() => goto('/communities', { replaceState: true })} />
			</span>
			<button
				type="button"
				class="community-info-row-tap"
				onclick={() => (communityInfoModalOpen = true)}
				aria-label="Community info"
			>
				<ProfilePic
					pictureUrl={selectedCommunity.picture}
					name={selectedCommunity.displayName || selectedCommunity.name}
					pubkey={selectedCommunity.pubkey}
					size="bubble"
				/>
				<h1 class="community-display-name">
					{selectedCommunity.displayName || selectedCommunity.name || 'Unnamed'}
				</h1>
			</button>
			<div class="header-icon-group">
				<button
					type="button"
					class="notifications-btn bell-btn"
					aria-label="Notifications"
					onclick={() => (joinRequestsModalOpen = true)}
				>
					<Bell variant="fill" size={16} color="hsl(var(--white33))" />
					{#if isCommunityAdmin && joinRequestsCount > 0}
						<span class="bell-badge">{joinRequestsCount}</span>
					{/if}
				</button>
			</div>
		</div>
		<div class="pills-row-wrap">
			<div class="tab-row pills-row-under">
				{#each sectionPills.filter((p) => !p.isAdmin) as pill}
					<button
						type="button"
						class={selectedSection === pill.id
							? 'btn-primary-small tab-selected'
							: 'btn-secondary-small'}
						onclick={() =>
							goto(`/community/${encodeURIComponent(communityNpub)}?s=${pill.id}`, {
								replaceState: true,
								noScroll: true,
								keepFocus: true
							})}
					>
						{pill.label}
					</button>
				{/each}
			</div>
			{#if isCommunityAdmin}
				<button
					type="button"
					class="tab-admin-fixed-pill {selectedSection === 'admin'
						? 'tab-admin-fixed-pill-selected'
						: ''}"
					onclick={() =>
						goto(`/community/${encodeURIComponent(communityNpub)}?s=admin`, {
							replaceState: true,
							noScroll: true,
							keepFocus: true
						})}
					aria-label="Admin"
				>
					<Crown
					variant="fill"
					size={14}
					color={selectedSection === 'admin'
						? 'hsl(var(--goldColor))'
						: 'hsl(var(--goldColor66))'}
				/>
					<span>Admin</span>
				</button>
			{/if}
		</div>
	</div>
	<div class="panel-content">
		<!-- forum, tasks, projects, wikis are always in DOM (CSS hidden when inactive) so
		     profile images stay loaded across tab switches. Profiles/forms/admin are lazy. -->
		<div class="forum-list" class:section-hidden={!isForumSection}>
			{#if forumPosts.length === 0}
				<EmptyState message="No Forum Posts yet" minHeight={600} />
			{:else}
				{#each forumPosts as post (post.id)}
						{@const authorProfile = profilesByPubkey.get(post.pubkey)}
						{@const authorContent = authorProfile?.content
							? (() => {
									try {
										return JSON.parse(authorProfile.content);
									} catch {
										return {};
									}
								})()
							: {}}
						{@const postCommenters = commentersByPostId.get(post.id)}
						<ForumPost
							author={{
								name: authorContent.display_name ?? authorContent.name,
								picture: authorContent.picture,
								npub: (() => {
									try {
										return nip19.npubEncode(post.pubkey);
									} catch {
										return '';
									}
								})()
							}}
							title={post.title}
							content={post.content}
							timestamp={post.createdAt}
							labels={post.labels ?? []}
							commenters={postCommenters?.profiles ?? []}
							commentCount={postCommenters?.count ?? 0}
							onClick={() => openPost(post)}
						/>
				{/each}
		{/if}
		</div>
		<div class="tasks-list" class:section-hidden={selectedSection !== 'tasks'}>
			{#if taskEvents.length === 0}
				<EmptyState message="No Tasks yet" minHeight={600} />
			{:else}
				{#each TASK_STATUS_ORDER as statusKey}
					{@const group = tasksByStatus.get(statusKey) ?? []}
					{#if group.length > 0}
						<div class="task-group-header">
							<span class="eyebrow-label-xs">{TASK_STATUS_LABELS[statusKey]}</span>
							<span class="task-group-count">{group.length}</span>
							<button
								type="button"
								class="task-group-add-btn"
								aria-label="Add task with status {TASK_STATUS_LABELS[statusKey]}"
									onclick={() => {
										newTaskInitialStatus = statusKey;
										addTaskModalOpen = true;
									}}
								>
									<Plus size={12} color="hsl(var(--white33))" variant="outline" strokeWidth={2} />
								</button>
							</div>
						{#each group as task (task.id)}
							{@const { status, priority } = getTaskStatusAndPriority(task)}
								{@const title = task.tags?.find((t) => t[0] === 'title')?.[1] ?? ''}
								{@const taskLabels = task.tags?.filter((t) => t[0] === 't').map((t) => t[1]) ?? []}
								{@const assigneePubkeys =
									task.tags?.filter((t) => t[0] === 'p' && t[2] === 'assignee').map((t) => t[1]) ??
									[]}
								{@const authorProfile = profilesByPubkey.get(task.pubkey)}
								{@const authorContent = authorProfile?.content
									? (() => {
											try {
												return JSON.parse(authorProfile.content);
											} catch {
												return {};
											}
										})()
									: {}}
								<TaskCard
									{title}
									{status}
									{priority}
									labels={taskLabels}
									createdAt={task.created_at}
									author={{
										pubkey: task.pubkey,
										name: authorContent.display_name ?? authorContent.name,
										pictureUrl: authorContent.picture
									}}
									assignees={assigneePubkeys.map((pk) => {
										const p = profilesByPubkey.get(pk);
										const c = p?.content
											? (() => {
													try {
														return JSON.parse(p.content);
													} catch {
														return {};
													}
												})()
											: {};
										return { pubkey: pk, name: c.display_name ?? c.name, pictureUrl: c.picture };
									})}
									commenters={commentersByTaskId.get(task.id) ?? []}
									onClick={() => openTask(task)}
								/>
							{/each}
						{/if}
					{/each}
				{/if}
			</div>
		<div class="projects-list" class:section-hidden={selectedSection !== 'projects'}>
			{#if projectEvents.length === 0}
				<EmptyState message="No Projects yet" minHeight={600} />
			{:else}
				{#each projectEvents.slice().sort((a, b) => b.created_at - a.created_at) as projEv (projEv.id)}
						{@const pData = getProjectCardData(projEv)}
						{@const pAuthor = profilesByPubkey.get(projEv.pubkey)}
						{@const pAuthorContent = pAuthor?.content
							? (() => {
									try {
										return JSON.parse(pAuthor.content);
									} catch {
										return {};
									}
								})()
							: {}}
						{#if pData}
							<ProjectCard
								title={pData.parsed.title}
								summary={pData.parsed.summary}
								percentage={pData.progress}
								milestones={pData.milestones}
								author={{
									pubkey: projEv.pubkey,
									name: pAuthorContent.display_name ?? pAuthorContent.name,
									pictureUrl: pAuthorContent.picture
								}}
								due={pData.parsed.due}
								onClick={() => openProject(projEv)}
							/>
						{/if}
					{/each}
				{/if}
			</div>
		<div class="wiki-list" class:section-hidden={selectedSection !== 'wikis'}>
			{#if wikiEvents.length === 0}
				<EmptyState message="No Wiki Articles yet" minHeight={600} />
			{:else}
				{#each wikiEvents.slice().sort((a, b) => b.created_at - a.created_at) as wiki (wiki.id)}
						{@const wTitle = wiki.tags?.find((t) => t[0] === 'title')?.[1] ?? 'Untitled'}
						{@const wSummary = wiki.tags?.find((t) => t[0] === 'summary')?.[1] ?? ''}
						{@const wSlug = wiki.tags?.find((t) => t[0] === 'd')?.[1] ?? wiki.id}
						{@const wLabels = wiki.tags?.filter((t) => t[0] === 't').map((t) => t[1]) ?? []}
						{@const wAuthor = profilesByPubkey.get(wiki.pubkey)}
						{@const wAuthorContent = wAuthor?.content
							? (() => {
									try {
										return JSON.parse(wAuthor.content);
									} catch {
										return {};
									}
								})()
							: {}}
						<WikiCard
							title={wTitle}
							summary={wSummary}
							slug={wSlug}
							labels={wLabels}
							author={{
								name: wAuthorContent.display_name ?? wAuthorContent.name,
								picture: wAuthorContent.picture,
								pubkey: wiki.pubkey
							}}
							createdAt={wiki.created_at}
							onClick={() => openWiki(wiki, wSlug)}
						/>
					{/each}
				{/if}
			</div>
		{#if selectedSection === 'activity'}
		<div class="activity-list">
			{#if activityComments.length === 0}
				<EmptyState message="No Activity yet" minHeight={600} />
			{:else}
				{#each activityComments as commentEv (commentEv.id)}
					{@const authorEv = profilesByPubkey.get(commentEv.pubkey)}
					{@const authorContent = authorEv?.content
						? (() => { try { return JSON.parse(authorEv.content); } catch { return {}; } })()
						: {}}
					{@const authorProfile = { name: authorContent.display_name ?? authorContent.name, picture: authorContent.picture, pubkey: commentEv.pubkey }}
					{@const eRootTag = commentEv.tags?.find((t) => t[0] === 'E' && t[1])}
					{@const aRootTag = commentEv.tags?.find((t) => t[0] === 'A' && t[1])}
					{@const rootKey = eRootTag?.[1] ?? aRootTag?.[1] ?? null}
					{@const rootEvent = rootKey ? activityRootEvents.get(rootKey) ?? null : null}
					{@const eParentTag = commentEv.tags?.find((t) => t[0] === 'e' && t[1])}
					{@const parentId = eParentTag?.[1] && eParentTag[1] !== rootKey ? eParentTag[1] : null}
					{@const parentComment = parentId ? activityCommentMap.get(parentId) ?? null : null}
					{@const parentAuthorEv = parentComment ? profilesByPubkey.get(parentComment.pubkey) : null}
					{@const parentAuthorContent = parentAuthorEv?.content
						? (() => { try { return JSON.parse(parentAuthorEv.content); } catch { return {}; } })()
						: {}}
					{@const parentCommentAuthor = parentComment
						? { name: parentAuthorContent.display_name ?? parentAuthorContent.name, picture: parentAuthorContent.picture, pubkey: parentComment.pubkey }
						: null}
					{@const authorNpub = (() => { try { return nip19.npubEncode(commentEv.pubkey); } catch { return ''; } })()}
					<div class="activity-item">
						<CommentCard
							event={commentEv}
							{authorProfile}
							{rootEvent}
							{parentComment}
							{parentCommentAuthor}
							profileUrl={authorNpub ? `/profile/${authorNpub}` : ''}
							{wikiLinkFn}
							resolveMentionLabel={(pk) => profilesByPubkey.get(pk)?.display_name ?? profilesByPubkey.get(pk)?.name ?? pk.slice(0, 8)}
						/>
					</div>
				{/each}
			{/if}
		</div>
	{/if}
		{#if selectedSection === 'profiles'}
			<div class="profiles-list">
				{#if membersListData.length === 0}
					<EmptyState message="No Profile Lists yet" minHeight={200} />
				{:else}
					{#each membersListData as item}
						{@const listMembers = item.parsed?.members ?? []}
						{@const infoWriteTypes = contentTypesFromKinds(item.sectionKinds ?? [])}
						<div class="info-list-panel">
							<div class="list-panel-section">
								<SingleBadge
									image={item.parsed?.image ?? null}
									name={item.parsed?.name ?? item.sectionName}
									sizePx={52}
								/>
								<div class="list-panel-meta">
									<span class="list-panel-name">{item.parsed?.name ?? item.sectionName}</span>
									{#if item.parsed?.content}
										<span class="list-panel-desc">{item.parsed.content}</span>
									{/if}
								</div>
							</div>
							{#if infoWriteTypes.length > 0}
								<div class="list-panel-divider"></div>
								<div class="list-panel-section list-panel-section-write">
									<p class="list-panel-write-label">CAN WRITE</p>
									<div class="list-panel-type-pills">
										{#each infoWriteTypes as ct}
											<span class="list-panel-type-pill">
												<img src={ct.emoji} alt="" class="list-panel-type-emoji" />
												<span>{ct.label}</span>
											</span>
										{/each}
									</div>
								</div>
							{/if}
							<div class="list-panel-divider"></div>
							<div class="list-panel-section list-panel-section-profiles">
								{#if listMembers.length > 0}
									<ul class="info-list-members-list">
										{#each listMembers.slice(0, 4) as pk}
											{@const p = profilesByPubkey.get(pk)}
											<li class="info-list-member-row">
												{#if p?.picture}
													<img src={p.picture} alt="" class="info-list-member-avatar" />
												{:else}
													<div
														class="info-list-member-avatar info-list-member-avatar-placeholder"
													></div>
												{/if}
												<span class="info-list-member-name"
													>{p?.displayName ?? p?.name ?? pk.slice(0, 8) + '…'}</span
												>
											</li>
										{/each}
									</ul>
								{/if}
								<div class="info-list-actions">
									<button
										type="button"
										class="btn-view-more"
										onclick={() => openList(item.listAddress)}>View All</button
									>
									<div class="info-list-actions-right">
										{#if isCommunityAdmin}
											<button
												type="button"
												class="btn-primary-small info-list-action-btn"
												aria-label="Edit list"
												onclick={() => openList(item.listAddress)}
											>
												<Pen variant="fill" size={13} color="hsl(var(--white66))" />
												<span>Edit</span>
											</button>
										{/if}
										{#if item.parsed?.form && !listMembers.includes(currentPubkey)}
											<button
												type="button"
												class="btn-primary-small info-list-action-btn"
												onclick={() => {
													selectedJoinList = {
														formAddress: item.parsed.form,
														listName: item.parsed?.name,
														listAddress: item.listAddress
													};
													joinModalOpen = true;
												}}>Join</button
											>
										{/if}
									</div>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{:else if selectedSection === 'forms'}
			<div class="crown-forms-tab"><!-- forms is lazy; no profile images -->
				{#if formTemplateModal}
					<form
						class="join-form ft-form"
						onsubmit={(e) => {
							e.preventDefault();
							saveFormTemplate();
						}}
					>
						<div class="ft-inline-back">
							<button
								type="button"
								class="ft-back-btn"
								onclick={() => {
									formTemplateModal = null;
									formTemplateError = '';
								}}>← Back</button
							>
							<span class="ft-inline-title"
								>{formTemplateModal.mode === 'edit' ? 'Edit form' : 'New form'}</span
							>
						</div>
						<div class="join-form-field">
							<label class="labels-label" for="ft-name">Form name</label>
							<InputTextField
								bind:value={formTemplateName}
								placeholder="e.g. Membership Application"
								singleLine={true}
								id="ft-name"
								oninput={() => {}}
								onkeydown={() => {}}
								onfocus={() => {}}
								onblur={() => {}}
							/>
						</div>
						{#if formTemplateModal.mode === 'add'}
							<div class="join-form-field">
								<label class="labels-label" for="ft-dtag">Form ID (slug)</label>
								<InputTextField
									bind:value={formTemplateDTag}
									placeholder="e.g. membership-application"
									singleLine={true}
									id="ft-dtag"
									oninput={() => {}}
									onkeydown={() => {}}
									onfocus={() => {}}
									onblur={() => {}}
								/>
							</div>
						{:else}
							<p class="ft-id-display">ID: <code>{formTemplateDTag}</code></p>
						{/if}
						<div class="join-form-field">
							<label class="labels-label" for="ft-description">Description</label>
							<InputTextField
								bind:value={formTemplateDescription}
								placeholder="What is this form for?"
								singleLine={false}
								size="medium"
								id="ft-description"
								oninput={() => {}}
								onkeydown={() => {}}
								onfocus={() => {}}
								onblur={() => {}}
							/>
						</div>
						<div class="ft-section-header">
							<span class="labels-label">Fields</span>
							<button type="button" class="ft-add-field-btn" onclick={addFormField}
								>+ Add field</button
							>
						</div>
						{#each formTemplateFields as field, idx}
							<div class="ft-field-row">
								<div class="ft-field-top">
									<InputTextField
										bind:value={formTemplateFields[idx].id}
										placeholder="field-id"
										singleLine={true}
										oninput={() => {}}
										onkeydown={() => {}}
										onfocus={() => {}}
										onblur={() => {}}
									/>
									<select
										class="ft-type-select"
										value={field.type}
										onchange={(e) => updateFormField(idx, 'type', e.currentTarget.value)}
									>
										<option value="text">Text</option>
										<option value="textarea">Textarea</option>
										<option value="number">Number</option>
										<option value="email">Email</option>
										<option value="url">URL</option>
										<option value="select">Select</option>
										<option value="checkbox">Checkbox</option>
										<option value="radio">Radio</option>
										<option value="date">Date</option>
									</select>
									<button
										type="button"
										class="ft-remove-btn"
										onclick={() => removeFormField(idx)}
										aria-label="Remove field">×</button
									>
								</div>
								<div class="ft-field-bottom">
									<InputTextField
										bind:value={formTemplateFields[idx].label}
										placeholder="Label shown to user"
										singleLine={true}
										oninput={() => {}}
										onkeydown={() => {}}
										onfocus={() => {}}
										onblur={() => {}}
									/>
									<InputTextField
										bind:value={formTemplateFields[idx].placeholder}
										placeholder="Placeholder hint"
										singleLine={true}
										oninput={() => {}}
										onkeydown={() => {}}
										onfocus={() => {}}
										onblur={() => {}}
									/>
									<label class="ft-required-label">
										<input
											type="checkbox"
											checked={field.required}
											onchange={(e) =>
												updateFormField(idx, 'required', e.currentTarget.checked)}
										/>
										Required
									</label>
								</div>
								{#if field.type === 'select' || field.type === 'radio'}
									<div class="ft-field-options">
										<InputTextField
											value={field.selectOptions.join(', ')}
											placeholder="Options, comma-separated"
											singleLine={true}
											oninput={(e) =>
												updateFormField(
													idx,
													'selectOptions',
													e.currentTarget.value
														.split(',')
														.map((s) => s.trim())
														.filter(Boolean)
												)}
											onkeydown={() => {}}
											onfocus={() => {}}
											onblur={() => {}}
										/>
									</div>
								{/if}
							</div>
						{/each}
						{#if formTemplateFields.length === 0}
							<p class="ft-no-fields">No fields yet. Add one above.</p>
						{/if}
						<div class="join-form-field">
							<label class="labels-label" for="ft-confirm-msg">Confirmation message</label>
							<InputTextField
								bind:value={formTemplateConfirmMsg}
								placeholder="Shown to users after they submit"
								singleLine={false}
								size="medium"
								id="ft-confirm-msg"
								oninput={() => {}}
								onkeydown={() => {}}
								onfocus={() => {}}
								onblur={() => {}}
							/>
						</div>
						<label class="ft-public-label">
							<input type="checkbox" bind:checked={formTemplatePublic} />
							Public responses (unencrypted)
						</label>
						{#if formTemplateError}<p class="text-sm text-red-500">{formTemplateError}</p>{/if}
						<div class="join-modal-actions" style="margin-top: 0.75rem;">
							<button
								type="button"
								class="btn-secondary-small"
								onclick={() => {
									formTemplateModal = null;
									formTemplateError = '';
								}}>Cancel</button
							>
							<button type="submit" class="btn-primary-small" disabled={formTemplateSubmitting}
								>{formTemplateSubmitting ? 'Saving…' : 'Save'}</button
							>
						</div>
					</form>
				{:else}
					{#if adminFormTemplates.length === 0}
						<EmptyState message="No Forms yet" minHeight={200} />
					{:else}
						{#each adminFormTemplates as item}
							<div class="info-list-panel crown-form-panel">
								<div class="info-list-panel-meta" style="padding: 0;">
									<span class="info-list-panel-name"
										>{item.parsed?.name || item.parsed?.dTag || 'Untitled form'}</span
									>
									{#if item.linkedLists.length > 0}
										<span class="info-list-panel-desc"
											>Used by: {item.linkedLists.join(', ')}</span
										>
									{:else}
										<span class="info-list-panel-desc crown-form-address">{item.formAddr}</span>
									{/if}
								</div>
								{#if isCommunityAdmin}
									<div class="info-list-actions" style="margin-top: 0.5rem;">
										<button
											type="button"
											class="btn-primary-small info-list-action-btn"
											onclick={() => openFormTemplateModal('edit', item)}
										>
											<Pen variant="fill" size={13} color="hsl(var(--white66))" />
											<span>Edit</span>
										</button>
									</div>
								{/if}
							</div>
						{/each}
					{/if}
					{#if isCommunityAdmin}
						<div class="admin-section-add-row">
							<button
								type="button"
								class="admin-section-add-btn"
								onclick={() => openFormTemplateModal('add')}
							>
								<Plus variant="outline" size={18} color="hsl(var(--white66))" />
								<span>New form template</span>
							</button>
						</div>
					{/if}
				{/if}
			</div>
		{:else if selectedSection === 'admin' && isCommunityAdmin}
			<div class="admin-tab-page">
				<div class="admin-page-section">
					<h3 class="admin-page-section-title">Community info</h3>
					<div class="admin-form-section">
						<label class="labels-label" for="admin-tab-picture">Picture URL</label>
						<InputTextField
							bind:value={adminPicture}
							placeholder="https://…"
							singleLine={true}
							id="admin-tab-picture"
							oninput={() => {}}
							onkeydown={() => {}}
							onfocus={() => {}}
							onblur={() => {}}
						/>
					</div>
					<div class="admin-form-section">
						<label class="labels-label" for="admin-tab-name">Community name</label>
						<InputTextField
							bind:value={adminName}
							placeholder="Name"
							singleLine={true}
							id="admin-tab-name"
							oninput={() => {}}
							onkeydown={() => {}}
							onfocus={() => {}}
							onblur={() => {}}
						/>
					</div>
					<div class="admin-form-section">
						<label class="labels-label" for="admin-tab-desc">Description</label>
						<InputTextField
							bind:value={adminDescription}
							placeholder="Description"
							singleLine={false}
							size="medium"
							id="admin-tab-desc"
							oninput={() => {}}
							onkeydown={() => {}}
							onfocus={() => {}}
							onblur={() => {}}
						/>
					</div>
				</div>

				<div class="admin-page-section">
					<h3 class="admin-page-section-title">Content sections</h3>
					<div class="crown-content-tab">
						{#each ADMIN_SECTION_PRESETS.filter((p) => adminSectionEnabled[p.id]) as preset}
							{@const addrs = Array.isArray(adminSectionListAddress[preset.id])
								? adminSectionListAddress[preset.id]
								: adminSectionListAddress[preset.id]
									? [adminSectionListAddress[preset.id]]
									: []}
							{@const listItems = adminProfileLists
								.filter((l) => addrs.includes(l.listAddress))
								.map((l) => ({ image: l.image, name: l.name }))}
							<button
								type="button"
								class="admin-section-row admin-section-row-clickable"
								onclick={() => (adminSectionModalPresetId = preset.id)}
							>
								<span class="admin-section-emoji-slot"></span>
								<span class="admin-section-name">{preset.name}</span>
								<span class="admin-section-badges-wrap">
									<BadgeStack items={listItems} maxDisplay={3} overlapPx={16} badgeSizePx={32} />
									<ChevronRight
										variant="outline"
										size={16}
										color="hsl(var(--white33))"
										className="admin-section-chevron"
									/>
								</span>
							</button>
						{/each}
						<div class="admin-section-add-row">
							<button
								type="button"
								class="admin-section-add-btn"
								onclick={() => (adminAddSectionOpen = true)}
								aria-label="Add content section"
							>
								<Plus variant="outline" size={18} color="hsl(var(--white66))" />
								<span>Add content section</span>
							</button>
						</div>
					</div>
				</div>

				<div class="admin-page-section">
					<h3 class="admin-page-section-title">Hosting</h3>
					<div class="admin-form-section">
						<label class="labels-label" for="admin-tab-relays"
							>Relays (one per line or comma-separated)</label
						>
						<InputTextField
							bind:value={adminRelays}
							placeholder="wss://…"
							singleLine={false}
							size="medium"
							id="admin-tab-relays"
							oninput={() => {}}
							onkeydown={() => {}}
							onfocus={() => {}}
							onblur={() => {}}
						/>
						<label class="relay-enforced-label">
							<input type="checkbox" bind:checked={adminRelayEnforced} />
							Main relay is enforced
						</label>
					</div>
					<div class="admin-form-section">
						<label class="labels-label" for="admin-tab-blossom">Blossom servers</label>
						<InputTextField
							bind:value={adminBlossom}
							placeholder="https://…"
							singleLine={false}
							size="medium"
							id="admin-tab-blossom"
							oninput={() => {}}
							onkeydown={() => {}}
							onfocus={() => {}}
							onblur={() => {}}
						/>
					</div>
				</div>

				{#if adminSaveError}<p class="text-sm text-red-500">{adminSaveError}</p>{/if}
				<div class="join-modal-actions crown-save-row">
					<button
						type="button"
						class="btn-primary-small"
						disabled={adminSaveSubmitting}
						onclick={() => saveCommunityAdminAll()}
					>
						{adminSaveSubmitting ? 'Saving…' : 'Save'}
					</button>
				</div>
			</div>
		{:else if !isForumSection && selectedSection !== 'tasks' && selectedSection !== 'projects' && selectedSection !== 'wikis'}
		<EmptyState
			message="No {sectionPills.find((p) => p.id === selectedSection)?.label ?? selectedSection} yet"
			minHeight={200}
		/>
		{/if}
	</div>
	{#if selectedCommunity && !openWikiSlug && !openPostId && !openTaskId && !openProjectId && !openListAddr && !openEventEncoded}
		<CommunityBottomBar
			{isMember}
			{hasForm}
			showFeedBar={selectedSection !== 'profiles'}
			showMembersBar={selectedSection === 'profiles' && isCommunityAdmin}
			onAddList={() => (addListModalOpen = true)}
			showAdminSave={false}
			communityName={selectedCommunity.displayName || selectedCommunity.name || ''}
			{selectedSection}
			modalOpen={addPostModalOpen || addTaskModalOpen || addWikiModalOpen || projectModalOpen}
			onJoin={() => {
				joinContext = selectedSection;
				joinModalOpen = true;
			}}
			onComment={() => {}}
			onZap={() => {}}
			onAdd={() => {
				if (selectedSection === 'tasks') addTaskModalOpen = true;
				else if (selectedSection === 'wikis') addWikiModalOpen = true;
				else if (selectedSection === 'projects') {
					projectModalOpen = true;
				} else openCreatePost();
			}}
			onSearch={() => {
				/* TODO: section search */
			}}
		/>
	{/if}
{/if}
<!-- Modals and overlays scoped to right page (inside viewport containing block) -->
<Modal
	open={communityInfoModalOpen}
	onClose={() => {
		communityInfoModalOpen = false;
		communityEditModalOpen = false;
		communityInfoShowDetails = false;
	}}
	ariaLabel="Community info"
	padContent={true}
>
	{#if communityInfoModalOpen && selectedCommunity}
		{@const commTags = selectedCommunity.raw?.tags ?? []}
		{@const blossomUrls = commTags
			.filter((t) => t[0] === 'blossom')
			.map((t) => t[1])
			.filter(Boolean)}
		{@const relayUrls = selectedCommunity.relays ?? []}
		<div class="community-info-modal">
			<div class="community-info-pic-wrap">
				<ProfilePic
					pictureUrl={selectedCommunity.picture}
					name={selectedCommunity.displayName || selectedCommunity.name}
					pubkey={selectedCommunity.pubkey}
					size="2xl"
				/>
			</div>
			<h2 class="community-info-name">
				{selectedCommunity.displayName || selectedCommunity.name || 'Unnamed'}
			</h2>
			{#if selectedCommunity.about ?? selectedCommunity.description}
				<p class="community-info-about">
					{selectedCommunity.about ?? selectedCommunity.description}
				</p>
			{/if}
			<button
				type="button"
				class="btn-more-details"
				onclick={() => (communityInfoShowDetails = !communityInfoShowDetails)}
			>
				{communityInfoShowDetails ? 'Less details' : 'More details'}
			</button>
			{#if communityInfoShowDetails}
				<div class="community-info-details-wrap">
					{#if relayUrls.length > 0 || blossomUrls.length > 0}
						<h3 class="community-info-section-label">Servers</h3>
						<div class="community-info-servers-list">
							{#each relayUrls as url}
								<span class="community-info-server">{url}</span>
							{/each}
							{#each blossomUrls as url}
								<span class="community-info-server community-info-blossom">{url}</span>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
			<div class="community-info-profiles-section">
				<h3 class="community-info-profiles-label">PROFILES</h3>
				{#if isCommunityAdmin && joinRequestsCount > 0}
					<button
						type="button"
						class="members-join-requests-panel"
						onclick={() => (joinRequestsModalOpen = true)}
					>
						<span class="members-panel-label">Join Requests</span>
						<span class="members-panel-count">{joinRequestsCount}</span>
					</button>
				{/if}
				{#if membersListData.length === 0}
					<p class="community-info-profiles-empty">No profile lists found.</p>
				{/if}
				{#each membersListData as item}
					{@const listMembers = item.parsed?.members ?? []}
					{@const infoWriteTypes = contentTypesFromKinds(item.sectionKinds ?? [])}
					<div class="info-list-panel">
						<!-- Section 1: badge + name + description -->
						<div class="list-panel-section">
							<SingleBadge
								image={item.parsed?.image ?? null}
								name={item.parsed?.name ?? item.sectionName}
								sizePx={52}
							/>
							<div class="list-panel-meta">
								<span class="list-panel-name">{item.parsed?.name ?? item.sectionName}</span>
								{#if item.parsed?.content}
									<span class="list-panel-desc">{item.parsed.content}</span>
								{/if}
							</div>
						</div>
						{#if infoWriteTypes.length > 0 || item.sectionName}
							<div class="list-panel-divider"></div>
							<!-- Section 2: CAN WRITE -->
							<div class="list-panel-section list-panel-section-write">
								<p class="list-panel-write-label">CAN WRITE</p>
								<div class="list-panel-type-pills">
									{#if infoWriteTypes.length > 0}
										{#each infoWriteTypes as ct}
											<span class="list-panel-type-pill">
												<img src={ct.emoji} alt="" class="list-panel-type-emoji" />
												<span>{ct.label}</span>
											</span>
										{/each}
									{:else if item.sectionName}
										<span class="list-panel-type-pill">
											<span>{item.sectionName}</span>
										</span>
									{/if}
								</div>
							</div>
						{/if}
						<div class="list-panel-divider"></div>
						<!-- Section 3: profile list rows + actions -->
						<div class="list-panel-section list-panel-section-profiles">
							{#if listMembers.length > 0}
								<ul class="info-list-members-list">
									{#each listMembers.slice(0, 5) as pk}
										{@const p = profilesByPubkey.get(pk)}
										<li class="info-list-member-row">
											{#if p?.picture}
												<img src={p.picture} alt="" class="info-list-member-avatar" />
											{:else}
												<div
													class="info-list-member-avatar info-list-member-avatar-placeholder"
												></div>
											{/if}
											<span class="info-list-member-name"
												>{p?.name ?? p?.display_name ?? pk.slice(0, 8) + '…'}</span
											>
										</li>
									{/each}
								</ul>
							{/if}
							<div class="info-list-actions">
								<button
									type="button"
									class="btn-view-more"
									onclick={() => {
										communityInfoModalOpen = false;
										openList(item.listAddress);
									}}>View All</button
								>
								<div class="info-list-actions-right">
									{#if isCommunityAdmin}
										<button
											type="button"
											class="btn-primary-small info-list-action-btn"
											aria-label="Edit list"
											onclick={() => {
												communityInfoModalOpen = false;
												openList(item.listAddress);
											}}
										>
											<Pen variant="fill" size={13} color="hsl(var(--white66))" />
											<span>Edit</span>
										</button>
									{/if}
									{#if item.parsed?.form && !listMembers.includes(currentPubkey)}
										<button
											type="button"
											class="btn-primary-small info-list-action-btn"
											onclick={() => {
												selectedJoinList = {
													formAddress: item.parsed.form,
													listName: item.parsed?.name,
													listAddress: item.listAddress
												};
												joinModalOpen = true;
											}}>Join</button
										>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
		{#if communityEditModalOpen}
			<Modal
				open={true}
				onClose={() => {
					communityEditModalOpen = false;
					communityEditTarget = null;
					communityEditError = '';
				}}
				ariaLabel="Edit community"
				zIndex={51}
				padContent={true}
			>
				{#if communityEditTarget === 'picture'}
					<h2 class="join-modal-title">Edit picture</h2>
					<form
						class="join-form"
						onsubmit={(e) => {
							e.preventDefault();
							saveCommunityEditPicture();
						}}
					>
						<div class="join-form-field">
							<label class="labels-label" for="edit-community-picture">Picture URL</label>
							<InputTextField
								bind:value={communityEditPicture}
								placeholder="https://…"
								singleLine={true}
								id="edit-community-picture"
								oninput={() => {}}
								onkeydown={() => {}}
								onfocus={() => {}}
								onblur={() => {}}
							/>
						</div>
						{#if communityEditError}<p class="text-sm text-red-500">
								{communityEditError}
							</p>{/if}
						<div class="join-modal-actions">
							<button
								type="button"
								class="btn-secondary-small"
								onclick={() => {
									communityEditModalOpen = false;
									communityEditTarget = null;
								}}>Cancel</button
							>
							<button type="submit" class="btn-primary-small" disabled={communityEditSubmitting}
								>{communityEditSubmitting ? 'Saving…' : 'Save'}</button
							>
						</div>
					</form>
				{:else if communityEditTarget === 'name'}
					<h2 class="join-modal-title">Edit name</h2>
					<form
						class="join-form"
						onsubmit={(e) => {
							e.preventDefault();
							saveCommunityEditName();
						}}
					>
						<div class="join-form-field">
							<label class="labels-label" for="edit-community-name">Community name</label>
							<InputTextField
								bind:value={communityEditName}
								placeholder="Name"
								singleLine={true}
								id="edit-community-name"
								oninput={() => {}}
								onkeydown={() => {}}
								onfocus={() => {}}
								onblur={() => {}}
							/>
						</div>
						{#if communityEditError}<p class="text-sm text-red-500">
								{communityEditError}
							</p>{/if}
						<div class="join-modal-actions">
							<button
								type="button"
								class="btn-secondary-small"
								onclick={() => {
									communityEditModalOpen = false;
									communityEditTarget = null;
								}}>Cancel</button
							>
							<button type="submit" class="btn-primary-small" disabled={communityEditSubmitting}
								>{communityEditSubmitting ? 'Saving…' : 'Save'}</button
							>
						</div>
					</form>
				{:else if communityEditTarget === 'description'}
					<h2 class="join-modal-title">Edit description</h2>
					<form
						class="join-form"
						onsubmit={(e) => {
							e.preventDefault();
							saveCommunityEditDescription();
						}}
					>
						<div class="join-form-field">
							<label class="labels-label" for="edit-community-desc">Description</label>
							<InputTextField
								bind:value={communityEditDescription}
								placeholder="Description"
								singleLine={false}
								size="medium"
								id="edit-community-desc"
								oninput={() => {}}
								onkeydown={() => {}}
								onfocus={() => {}}
								onblur={() => {}}
							/>
						</div>
						{#if communityEditError}<p class="text-sm text-red-500">
								{communityEditError}
							</p>{/if}
						<div class="join-modal-actions">
							<button
								type="button"
								class="btn-secondary-small"
								onclick={() => {
									communityEditModalOpen = false;
									communityEditTarget = null;
								}}>Cancel</button
							>
							<button type="submit" class="btn-primary-small" disabled={communityEditSubmitting}
								>{communityEditSubmitting ? 'Saving…' : 'Save'}</button
							>
						</div>
					</form>
				{:else if communityEditTarget === 'relays'}
					<h2 class="join-modal-title">Edit servers</h2>
					<form
						class="join-form"
						onsubmit={(e) => {
							e.preventDefault();
							saveCommunityEditServers();
						}}
					>
						<div class="join-form-field">
							<label class="labels-label" for="edit-community-relays"
								>Relays (one per line or comma-separated)</label
							>
							<InputTextField
								bind:value={communityEditRelays}
								placeholder="wss://…"
								singleLine={false}
								size="medium"
								id="edit-community-relays"
								oninput={() => {}}
								onkeydown={() => {}}
								onfocus={() => {}}
								onblur={() => {}}
							/>
							<label class="relay-enforced-label">
								<input type="checkbox" bind:checked={communityEditRelayEnforced} />
								Main relay is enforced (relay filters membership — skip client-side author filter)
							</label>
						</div>
						<div class="join-form-field">
							<label class="labels-label" for="edit-community-blossom"
								>Blossom servers (one per line or comma-separated)</label
							>
							<InputTextField
								bind:value={communityEditBlossom}
								placeholder="https://…"
								singleLine={false}
								size="medium"
								id="edit-community-blossom"
								oninput={() => {}}
								onkeydown={() => {}}
								onfocus={() => {}}
								onblur={() => {}}
							/>
						</div>
						{#if communityEditError}<p class="text-sm text-red-500">
								{communityEditError}
							</p>{/if}
						<div class="join-modal-actions">
							<button
								type="button"
								class="btn-secondary-small"
								onclick={() => {
									communityEditModalOpen = false;
									communityEditTarget = null;
								}}>Cancel</button
							>
							<button type="submit" class="btn-primary-small" disabled={communityEditSubmitting}
								>{communityEditSubmitting ? 'Saving…' : 'Save'}</button
							>
						</div>
					</form>
				{:else if communityEditTarget && String(communityEditTarget).startsWith('section-')}
					<h2 class="join-modal-title">Edit content section</h2>
					<form
						class="join-form"
						onsubmit={(e) => {
							e.preventDefault();
							saveCommunityEditSection();
						}}
					>
						<div class="join-form-field">
							<label class="labels-label" for="edit-section-name">Section name</label>
							<InputTextField
								bind:value={communityEditSectionName}
								placeholder="e.g. Forum, Chat"
								singleLine={true}
								id="edit-section-name"
								oninput={() => {}}
								onkeydown={() => {}}
								onfocus={() => {}}
								onblur={() => {}}
							/>
						</div>
						<div class="join-form-field">
							<label class="labels-label" for="edit-section-list"
								>Profile list address (who can write)</label
							>
							<InputTextField
								bind:value={communityEditSectionListAddress}
								placeholder="30000:pubkey:d-tag"
								singleLine={true}
								id="edit-section-list"
								oninput={() => {}}
								onkeydown={() => {}}
								onfocus={() => {}}
								onblur={() => {}}
							/>
						</div>
						{#if communityEditError}<p class="text-sm text-red-500">
								{communityEditError}
							</p>{/if}
						<div class="join-modal-actions">
							<button
								type="button"
								class="btn-secondary-small"
								onclick={() => {
									communityEditModalOpen = false;
									communityEditTarget = null;
								}}>Cancel</button
							>
							<button type="submit" class="btn-primary-small" disabled={communityEditSubmitting}
								>{communityEditSubmitting ? 'Saving…' : 'Save'}</button
							>
						</div>
					</form>
				{:else if communityEditTarget === 'full'}
					<h2 class="join-modal-title">Edit community</h2>
					<div class="community-edit-full">
						<section class="community-edit-full-section">
							<h3 class="community-edit-full-section-title">Picture</h3>
							<div class="join-form-field">
								<label class="labels-label" for="edit-full-picture">Picture URL</label>
								<InputTextField
									bind:value={communityEditPicture}
									placeholder="https://…"
									singleLine={true}
									id="edit-full-picture"
									oninput={() => {}}
									onkeydown={() => {}}
									onfocus={() => {}}
									onblur={() => {}}
								/>
							</div>
							<button
								type="button"
								class="btn-secondary-small"
								onclick={() => saveCommunityEditPicture()}
								disabled={communityEditSubmitting}>Save picture</button
							>
						</section>
						<section class="community-edit-full-section">
							<h3 class="community-edit-full-section-title">Name</h3>
							<div class="join-form-field">
								<label class="labels-label" for="edit-full-name">Community name</label>
								<InputTextField
									bind:value={communityEditName}
									placeholder="Name"
									singleLine={true}
									id="edit-full-name"
									oninput={() => {}}
									onkeydown={() => {}}
									onfocus={() => {}}
									onblur={() => {}}
								/>
							</div>
							<button
								type="button"
								class="btn-secondary-small"
								onclick={() => saveCommunityEditName()}
								disabled={communityEditSubmitting}>Save name</button
							>
						</section>
						<section class="community-edit-full-section">
							<h3 class="community-edit-full-section-title">Description</h3>
							<div class="join-form-field">
								<label class="labels-label" for="edit-full-desc">Description</label>
								<InputTextField
									bind:value={communityEditDescription}
									placeholder="Description"
									singleLine={false}
									size="medium"
									id="edit-full-desc"
									oninput={() => {}}
									onkeydown={() => {}}
									onfocus={() => {}}
									onblur={() => {}}
								/>
							</div>
							<button
								type="button"
								class="btn-secondary-small"
								onclick={() => saveCommunityEditDescription()}
								disabled={communityEditSubmitting}>Save description</button
							>
						</section>
						<section class="community-edit-full-section">
							<h3 class="community-edit-full-section-title">Servers</h3>
							<div class="join-form-field">
								<label class="labels-label" for="edit-full-relays"
									>Relays (one per line or comma-separated)</label
								>
								<InputTextField
									bind:value={communityEditRelays}
									placeholder="wss://…"
									singleLine={false}
									size="medium"
									id="edit-full-relays"
									oninput={() => {}}
									onkeydown={() => {}}
									onfocus={() => {}}
									onblur={() => {}}
								/>
								<label class="relay-enforced-label">
									<input type="checkbox" bind:checked={communityEditRelayEnforced} />
									Main relay is enforced (relay filters membership — skip client-side author filter)
								</label>
							</div>
							<div class="join-form-field">
								<label class="labels-label" for="edit-full-blossom">Blossom servers</label>
								<InputTextField
									bind:value={communityEditBlossom}
									placeholder="https://…"
									singleLine={false}
									size="medium"
									id="edit-full-blossom"
									oninput={() => {}}
									onkeydown={() => {}}
									onfocus={() => {}}
									onblur={() => {}}
								/>
							</div>
							<button
								type="button"
								class="btn-secondary-small"
								onclick={() => saveCommunityEditServers()}
								disabled={communityEditSubmitting}>Save servers</button
							>
						</section>
						<section class="community-edit-full-section">
							<h3 class="community-edit-full-section-title">Content sections</h3>
							<p class="community-edit-full-section-desc">
								Name + profile list (who can write) per section.
							</p>
							<ul class="community-edit-full-sections-list">
								{#each communityModalSections as sec, i}
									<li class="community-edit-full-section-item">
										<span class="community-edit-full-section-name">{sec.sectionName}</span>
										<span class="community-edit-full-section-list-label">{sec.listName}</span>
										<button
											type="button"
											class="btn-secondary-small"
											onclick={() => openCommunityEdit(`section-${i}`)}>Edit</button
										>
									</li>
								{/each}
							</ul>
						</section>
						{#if communityEditError}<p class="text-sm text-red-500">
								{communityEditError}
							</p>{/if}
						<div class="join-modal-actions" style="margin-top: 1rem;">
							<button
								type="button"
								class="btn-secondary-small"
								onclick={() => {
									communityEditModalOpen = false;
									communityEditTarget = null;
									communityInfoModalOpen = false;
								}}>Done</button
							>
						</div>
					</div>
				{:else}
					<p class="community-edit-placeholder">Unknown edit.</p>
				{/if}
			</Modal>
		{/if}
	{/if}
</Modal>

<!-- crown admin modal removed — admin UI is now the inline Admin tab -->


<Modal
	open={joinRequestsModalOpen}
	onClose={() => (joinRequestsModalOpen = false)}
	ariaLabel="Join requests"
	padContent={true}
>
	{#if joinRequestsModalOpen}
		<h2 class="join-modal-title">Join requests</h2>
		{#if joinRequestsList.length === 0}
			<p class="text-sm text-muted-foreground">No pending requests.</p>
		{:else}
			<ul class="requests-list">
				{#each joinRequestsList as req}
					{@const listEv = getListByFormAddress(req.tags?.find((t) => t[0] === 'a')?.[1])}
					{@const alreadyMember = listEv && parseProfileList(listEv)?.members?.includes(req.pubkey)}
					<li class="request-item request-item-row">
						<ProfilePic pubkey={req.pubkey} size="sm" />
						<div class="request-meta">
							<span class="request-pubkey">{req.pubkey.slice(0, 12)}…</span>
							<span class="request-date">{formatDate(req.created_at)}</span>
							{#if joinRequestsDecrypted.get(req.id)}
								{@const raw = joinRequestsDecrypted.get(req.id)}
								{@const parsed = (() => {
									try {
										return JSON.parse(raw);
									} catch {
										return null;
									}
								})()}
								{#if Array.isArray(parsed)}
									{#each parsed.filter((t) => t[0] === 'response' && t[1]) as entry}
										<p class="request-field">
											<span class="request-field-label">{entry[1]}:</span>
											{entry[2] ?? ''}
										</p>
									{/each}
								{:else}
									<p class="request-message">{raw}</p>
								{/if}
							{/if}
						</div>
						{#if !alreadyMember}
							<button
								type="button"
								class="btn-primary-small"
								disabled={joinRequestsApprovingId === req.id}
								onclick={() => approveJoinRequest(req)}
							>
								{joinRequestsApprovingId === req.id ? 'Adding…' : 'Approve'}
							</button>
						{:else}
							<span class="text-muted-foreground text-sm">Member</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</Modal>

{#key listViewMoreModal?.listAddress ?? 'closed'}
	<Modal
		open={!!listViewMoreModal}
		onClose={() => {
			listViewMoreModal = null;
			listViewMoreAddInput = '';
			listViewMoreAddError = '';
		}}
		ariaLabel="List members"
		maxWidth="max-w-md"
		padContent={true}
	>
		{#if listViewMoreModal}
			{@const listEvent = listViewMoreModal.listEvent}
			{@const parsed = listViewMoreModal.parsed ?? parseProfileList(listEvent)}
			{@const members = parsed?.members ?? []}
			<div class="list-form-modal-content">
				<h2 class="join-modal-title">{parsed?.name ?? 'List'}</h2>
				{#if isCommunityAdmin}
					<div class="list-modal-add-wrap">
						<InputTextField
							bind:value={listViewMoreAddInput}
							placeholder="npub or hex pubkey to add"
							singleLine={true}
							onkeydown={({ key }) => key === 'Enter' && addProfileToList(listEvent)}
							oninput={() => {}}
							onfocus={() => {}}
							onblur={() => {}}
						/>
						<button
							type="button"
							class="btn-primary-small"
							disabled={listViewMoreAddSubmitting || !listViewMoreAddInput.trim()}
							onclick={() => addProfileToList(listEvent)}
						>
							{listViewMoreAddSubmitting ? 'Adding…' : 'Add'}
						</button>
						<button
							type="button"
							class="list-panel-edit-btn"
							aria-label="Edit list"
							onclick={() => openListFormModal('edit', listViewMoreModal)}>Edit</button
						>
					</div>
					{#if listViewMoreAddError}
						<p class="text-sm text-red-500">{listViewMoreAddError}</p>
					{/if}
				{/if}
			</div>
			<ul class="list-modal-members">
				{#each members as pubkey}
					<li class="list-modal-member-row">
						<ProfilePic {pubkey} size="sm" />
						<span class="list-modal-member-pubkey">{pubkey.slice(0, 16)}…</span>
						{#if isCommunityAdmin}
							<button
								type="button"
								class="list-modal-remove-btn"
								onclick={() => removeProfileFromList(listEvent, pubkey)}
								aria-label="Remove"
							>
								<Cross variant="outline" size={14} strokeWidth={1.4} color="hsl(var(--white66))" />
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</Modal>
{/key}

{#key listFormModal ? (listFormModal.mode === 'edit' ? listFormModal.listAddress : 'add') : 'closed'}
	<Modal
		open={!!listFormModal}
		onClose={() => {
			listFormModal = null;
			listFormError = '';
		}}
		ariaLabel="List form"
		maxWidth="max-w-md"
		padContent={true}
	>
		{#if listFormModal}
			<div class="list-form-modal-content">
				<h2 class="join-modal-title">
					{listFormModal.mode === 'edit' ? 'Edit list' : 'Add list'}
				</h2>
				<form
					class="join-form"
					onsubmit={(e) => {
						e.preventDefault();
						submitListForm();
					}}
				>
					<div class="join-form-field">
						<label class="labels-label" for="list-form-name">Name</label>
						<InputTextField
							bind:value={listFormName}
							placeholder="List name"
							singleLine={true}
							id="list-form-name"
							oninput={() => {}}
							onkeydown={() => {}}
							onfocus={() => {}}
							onblur={() => {}}
						/>
					</div>
					<div class="join-form-field">
						<label class="labels-label" for="list-form-image">Image URL</label>
						<InputTextField
							bind:value={listFormImage}
							placeholder="https://… (optional)"
							singleLine={true}
							id="list-form-image"
							oninput={() => {}}
							onkeydown={() => {}}
							onfocus={() => {}}
							onblur={() => {}}
						/>
					</div>
					<div class="join-form-field">
						<label class="labels-label" for="list-form-description">Description</label>
						<InputTextField
							bind:value={listFormDescription}
							placeholder="Description (optional)"
							singleLine={false}
							size="medium"
							id="list-form-description"
							oninput={() => {}}
							onkeydown={() => {}}
							onfocus={() => {}}
							onblur={() => {}}
						/>
					</div>
					<div class="join-form-field">
						<label class="labels-label" for="list-form-join">Join form</label>
						{#if adminFormTemplates.length > 0}
							<select
								id="list-form-join"
								class="list-form-select"
								value={listFormFormAddress}
								onchange={(e) => {
									listFormFormAddress = e.currentTarget.value;
								}}
							>
								<option value="">— No form —</option>
								{#each adminFormTemplates as tpl (tpl.formAddr)}
									<option value={tpl.formAddr}>{tpl.parsed?.name ?? tpl.formAddr}</option>
								{/each}
							</select>
						{:else}
							<InputTextField
								bind:value={listFormFormAddress}
								placeholder="30168:pubkey:d-tag (optional)"
								singleLine={true}
								id="list-form-join"
								oninput={() => {}}
								onkeydown={() => {}}
								onfocus={() => {}}
								onblur={() => {}}
							/>
							<p class="list-form-hint">No forms found — create one in the Forms tab first.</p>
						{/if}
					</div>
					{#if listFormError}
						<p class="text-sm text-red-500">{listFormError}</p>
					{/if}
					<div class="join-modal-actions">
						<button
							type="button"
							class="btn-secondary-small"
							onclick={() => {
								listFormModal = null;
								listFormError = '';
							}}>Cancel</button
						>
						<button type="submit" class="btn-primary-small" disabled={listFormSubmitting}
							>{listFormSubmitting
								? listFormModal.mode === 'edit'
									? 'Saving…'
									: 'Adding…'
								: listFormModal.mode === 'edit'
									? 'Save'
									: 'Add list'}</button
						>
					</div>
				</form>
			</div>
		{/if}
	</Modal>
{/key}

<!-- ListModal: create new list from the Profiles section BottomBar -->
<ListModal
	bind:isOpen={addListModalOpen}
	formTemplates={adminFormTemplates}
	onsubmit={async ({ name, image, description, formAddress, dTag }) => {
		if (!selectedCommunity?.pubkey) throw new Error('No community');
		const tags = [
			['d', dTag],
			['name', name],
			['p', selectedCommunity.pubkey]
		];
		if (image) tags.push(['image', image]);
		if (formAddress) tags.push(['form', formAddress]);
		const listEv = await signEvent({
			kind: EVENT_KINDS.PROFILE_LIST,
			content: description ?? '',
			tags,
			created_at: Math.floor(Date.now() / 1000)
		});
		const relays = [...new Set([...(selectedCommunity.relays ?? []), ...COMMUNITY_WRITE_RELAYS])];
		await putEvents([listEv]);
		await publishToRelays(relays, listEv);
		const newParsed = parseProfileList(listEv);
		const newListItem = {
			listAddress: `30000:${listEv.pubkey}:${dTag}`,
			name: newParsed?.name ?? name,
			image: newParsed?.image ?? null,
			listEvent: listEv,
			parsed: newParsed
		};
		adminProfileLists = [...adminProfileLists, newListItem];
	}}
	onclose={() => (addListModalOpen = false)}
/>

{#key adminListPickerPresetId ?? 'closed'}
	<Modal
		open={adminListPickerPresetId != null}
		onClose={() => (adminListPickerPresetId = null)}
		ariaLabel="Choose lists for section"
		maxWidth="max-w-md"
		padContent={true}
	>
		{#if adminListPickerPresetId}
			{@const presetId = adminListPickerPresetId}
			{@const preset = ADMIN_SECTION_PRESETS.find((p) => p.id === presetId)}
			<h2 class="join-modal-title">Choose lists for {preset?.name ?? presetId}</h2>
			<p class="list-picker-desc">
				Who can write in this section. Select one or more profile lists.
			</p>
			<div class="list-picker-list">
				{#each adminProfileLists as list (list.listAddress)}
					{@const addrs = Array.isArray(adminSectionListAddress[presetId])
						? adminSectionListAddress[presetId]
						: adminSectionListAddress[presetId]
							? [adminSectionListAddress[presetId]]
							: []}
					{@const selected = addrs.includes(list.listAddress)}
					<label class="list-picker-row">
						<Checkbox
							checked={selected}
							onChanged={(val) => {
								const arr = [...addrs];
								if (val) arr.push(list.listAddress);
								else {
									const i = arr.indexOf(list.listAddress);
									if (i !== -1) arr.splice(i, 1);
								}
								adminSectionListAddress = { ...adminSectionListAddress, [presetId]: arr };
							}}
						/>
						<span class="list-picker-name">{list.name}</span>
					</label>
				{/each}
			</div>
			{#if adminProfileLists.length === 0}
				<p class="text-sm text-muted-foreground">
					No profile lists yet. Create one with Add List in the Members tab.
				</p>
			{/if}
			<div class="join-modal-actions">
				<button
					type="button"
					class="btn-primary-small"
					onclick={() => (adminListPickerPresetId = null)}>Done</button
				>
			</div>
		{/if}
	</Modal>
{/key}

{#key adminSectionModalPresetId ?? 'closed'}
	<Modal
		open={adminSectionModalPresetId != null}
		onClose={() => (adminSectionModalPresetId = null)}
		ariaLabel="Section details"
		maxWidth="max-w-md"
		padContent={true}
	>
		{#if adminSectionModalPresetId}
			{@const presetId = adminSectionModalPresetId}
			{@const preset = ADMIN_SECTION_PRESETS.find((p) => p.id === presetId)}
			<h2 class="join-modal-title">{preset?.name ?? presetId}</h2>
			{#if preset?.kinds?.length}
				<p class="admin-section-modal-kinds">
					Kinds that can be written: {preset.kinds.join(', ')}
				</p>
			{/if}
			<p class="list-picker-desc">
				Who can write in this section. Select one or more profile lists.
			</p>
			<div class="list-picker-list">
				{#each adminProfileLists as list (list.listAddress)}
					{@const addrs = Array.isArray(adminSectionListAddress[presetId])
						? adminSectionListAddress[presetId]
						: adminSectionListAddress[presetId]
							? [adminSectionListAddress[presetId]]
							: []}
					{@const selected = addrs.includes(list.listAddress)}
					<label class="list-picker-row">
						<Checkbox
							checked={selected}
							onChanged={(val) => {
								const arr = [...addrs];
								if (val) arr.push(list.listAddress);
								else {
									const i = arr.indexOf(list.listAddress);
									if (i !== -1) arr.splice(i, 1);
								}
								adminSectionListAddress = { ...adminSectionListAddress, [presetId]: arr };
							}}
						/>
						<span class="list-picker-name">{list.name}</span>
					</label>
				{/each}
			</div>
			{#if adminProfileLists.length === 0}
				<p class="text-sm text-muted-foreground">
					No profile lists yet. Create one with Add List in the Members tab.
				</p>
			{/if}
			<div class="join-modal-actions admin-section-modal-actions">
				<button
					type="button"
					class="btn-danger-small"
					onclick={() => {
						adminSectionEnabled = { ...adminSectionEnabled, [presetId]: false };
						adminSectionListAddress = { ...adminSectionListAddress, [presetId]: [] };
						adminSectionModalPresetId = null;
					}}>Delete section</button
				>
				<button
					type="button"
					class="btn-primary-small"
					onclick={() => (adminSectionModalPresetId = null)}>Done</button
				>
			</div>
		{/if}
	</Modal>
{/key}

{#key adminAddSectionOpen ? 'open' : 'closed'}
	<Modal
		open={adminAddSectionOpen}
		onClose={() => (adminAddSectionOpen = false)}
		ariaLabel="Add content section"
		maxWidth="max-w-md"
		padContent={true}
	>
		{#if adminAddSectionOpen}
			<h2 class="join-modal-title">Add content section</h2>
			<p class="list-picker-desc">
				Enable a section from presets. Only disabled sections are listed.
			</p>
			<div class="list-picker-list">
				{#each ADMIN_SECTION_PRESETS.filter((p) => !adminSectionEnabled[p.id]) as preset}
					<button
						type="button"
						class="admin-add-section-preset-row"
						onclick={() => {
							adminSectionEnabled = { ...adminSectionEnabled, [preset.id]: true };
							adminAddSectionOpen = false;
						}}
					>
						<span>{preset.name}</span>
					</button>
				{/each}
			</div>
			{#if ADMIN_SECTION_PRESETS.every((p) => adminSectionEnabled[p.id])}
				<p class="text-sm text-muted-foreground">All preset sections are already enabled.</p>
			{/if}
			<div class="join-modal-actions">
				<button
					type="button"
					class="btn-secondary-small"
					onclick={() => (adminAddSectionOpen = false)}>Cancel</button
				>
			</div>
		{/if}
	</Modal>
{/key}

<ForumPostModal
	bind:isOpen={addPostModalOpen}
	communityName={selectedCommunity?.name ?? ''}
	{getCurrentPubkey}
	onsubmit={handleForumPostSubmit}
	onclose={closeCreatePost}
/>

<TaskModal
	bind:isOpen={addTaskModalOpen}
	communityName={selectedCommunity?.name ?? ''}
	{getCurrentPubkey}
	initialData={newTaskInitialStatus ? { status: newTaskInitialStatus } : null}
	onsubmit={handleTaskSubmit}
	onclose={() => {
		newTaskInitialStatus = null;
		closeCreateTask();
	}}
/>

<WikiModal
	bind:isOpen={addWikiModalOpen}
	communityName={selectedCommunity?.name ?? ''}
	{getCurrentPubkey}
	onsubmit={handleWikiSubmit}
	onclose={closeCreateWiki}
/>

<ProjectModal
	bind:isOpen={projectModalOpen}
	communityName={selectedCommunity?.name ?? ''}
	{getCurrentPubkey}
	onsubmit={handleProjectSubmit}
	onclose={() => {
		projectModalOpen = false;
	}}
/>

<GetStartedModal
	bind:open={getStartedModalOpen}
	onstart={handleGetStartedStart}
	onconnected={() => {
		getStartedModalOpen = false;
	}}
/>
<SpinKeyModal
	bind:open={spinKeyModalOpen}
	profileName={onboardingProfileName}
	zIndex={55}
	onspinComplete={handleSpinComplete}
	onuseExistingKey={handleUseExistingKey}
/>
<OnboardingBuildingModal bind:open={onboardingBuildingModalOpen} zIndex={56} />

<Modal
	open={joinModalOpen}
	onClose={closeJoinModal}
	ariaLabel="Join community"
	title={joinStep === 'list'
		? `Join ${selectedCommunity?.displayName || selectedCommunity?.name || 'Community'}`
		: null}
	description={joinStep === 'list'
		? joinContext && CONTENT_TYPE_BY_SECTION[joinContext]
			? `To write ${CONTENT_TYPE_BY_SECTION[joinContext].label} you need to be part of one of these lists.`
			: 'What list do you want to join?'
		: null}
	closeButtonMobile={true}
	padContent={true}
>
	{#if joinModalOpen}
		{#if !currentPubkey}
			<p class="text-sm text-muted-foreground">Add a profile to request access.</p>
			<div class="join-modal-actions">
				<button type="button" class="btn-secondary-small" onclick={closeJoinModal}>Close</button>
			</div>
		{:else if joinStep === 'list'}
			{#if joinableLists.length === 0}
				<p class="text-sm" style="color: hsl(var(--white33));">Loading…</p>
			{:else}
				<div class="join-list-panels">
					{#each joinableLists as item}
						{@const stackProfiles = (item.members ?? []).slice(0, 3).map((pk) => {
							const p = profilesByPubkey.get(pk);
							return {
								pubkey: pk,
								name: p?.name ?? p?.display_name ?? '',
								pictureUrl: p?.picture ?? ''
							};
						})}
						{@const joinWriteTypes = contentTypesFromKinds(item.sectionKinds ?? [])}
						<div class="join-list-panel">
							<!-- Section 1: badge + name + description -->
							<div class="list-panel-section">
								<SingleBadge image={item.image} name={item.listName} sizePx={52} />
								<div class="list-panel-meta">
									<span class="list-panel-name">{item.listName}</span>
									{#if item.listDescription}
										<span class="list-panel-desc">{item.listDescription}</span>
									{/if}
								</div>
							</div>
							{#if joinWriteTypes.length > 0 || item.sectionName}
								<div class="list-panel-divider"></div>
								<!-- Section 2: CAN WRITE -->
								<div class="list-panel-section list-panel-section-write">
									<p class="list-panel-write-label">CAN WRITE</p>
									<div class="list-panel-type-pills">
										{#if joinWriteTypes.length > 0}
											{#each joinWriteTypes as ct}
												<span class="list-panel-type-pill">
													<img src={ct.emoji} alt="" class="list-panel-type-emoji" />
													<span>{ct.label}</span>
												</span>
											{/each}
										{:else if item.sectionName}
											<span class="list-panel-type-pill">
												<span>{item.sectionName}</span>
											</span>
										{/if}
									</div>
								</div>
							{/if}
							<div class="list-panel-divider"></div>
							<!-- Section 3: profile stack + Join button -->
							<div class="list-panel-section list-panel-section-actions">
								{#if item.members?.length > 0}
									<ProfilePicStack
										profiles={stackProfiles}
										size="sm"
										text="{item.members.length} Profiles"
									/>
								{:else}
									<span></span>
								{/if}
								<button
									type="button"
									class="btn-primary-small"
									onclick={() => {
										selectedJoinList = item;
										joinStep = 'form';
										fetchJoinForm(item.formAddress);
									}}>Join</button
								>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else if joinStep === 'form'}
			<div class="join-form-header">
				<p class="join-eyebrow">JOIN FORM</p>
				{#if joinParsedForm?.name}
					<h2 class="join-modal-title">{joinParsedForm.name}</h2>
				{/if}
			</div>
			<form
				class="join-form"
				onsubmit={(e) => {
					e.preventDefault();
					submitJoinForm();
				}}
			>
				{#if joinParsedForm?.fields?.length}
					{#each joinParsedForm.fields as field (field.id)}
						<div class="join-form-field">
							<label class="labels-label" for="jf-{field.id}"
								>{field.label}{#if field.required}<span class="join-required">*</span>{/if}</label
							>
							{#if field.type === 'textarea'}
								<InputTextField
									bind:value={joinFieldValues[field.id]}
									placeholder={field.placeholder || field.defaultValue || ''}
									singleLine={false}
									size="medium"
									id="jf-{field.id}"
									oninput={() => {}}
									onkeydown={() => {}}
									onfocus={() => {}}
									onblur={() => {}}
								/>
							{:else if field.type === 'select' && field.selectOptions?.length}
								<select
									class="join-select"
									id="jf-{field.id}"
									bind:value={joinFieldValues[field.id]}
								>
									<option value="">— Select —</option>
									{#each field.selectOptions as opt}
										<option value={opt}>{opt}</option>
									{/each}
								</select>
							{:else if field.type === 'checkbox'}
								<label class="join-checkbox-label">
									<input
										type="checkbox"
										id="jf-{field.id}"
										checked={joinFieldValues[field.id] === 'true'}
										onchange={(e) => {
											joinFieldValues[field.id] = e.currentTarget.checked ? 'true' : 'false';
										}}
									/>
									{field.placeholder || ''}
								</label>
							{:else}
								<InputTextField
									bind:value={joinFieldValues[field.id]}
									placeholder={field.placeholder || field.defaultValue || ''}
									singleLine={true}
									id="jf-{field.id}"
									oninput={() => {}}
									onkeydown={() => {}}
									onfocus={() => {}}
									onblur={() => {}}
								/>
							{/if}
						</div>
					{/each}
				{:else}
					<div class="join-form-field">
						<InputTextField
							bind:value={joinMessage}
							title="Message (optional)"
							placeholder="Why do you want to join?"
							singleLine={false}
							size="medium"
							id="join-message"
							oninput={() => {}}
							onkeydown={() => {}}
							onfocus={() => {}}
							onblur={() => {}}
						/>
					</div>
				{/if}
				{#if joinError}
					<p class="text-sm text-red-500">{joinError}</p>
				{/if}
				<button type="submit" class="btn-primary-large w-full" disabled={joinSubmitting}>
					{joinSubmitting ? 'Submitting…' : 'Join'}
				</button>
			</form>
		{:else if joinStep === 'done'}
			<div class="join-done-wrap">
				{#if joinConfirmationMessage}
					<p class="join-confirm-msg">{joinConfirmationMessage}</p>
				{:else}
					<p class="join-confirm-msg">Your request has been submitted!</p>
				{/if}
				<div class="join-modal-actions">
					<button type="button" class="btn-primary-small" onclick={closeJoinModal}>Close</button>
				</div>
			</div>
		{/if}
	{/if}
</Modal>

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
		padding: 16px 16px 16px 16px;
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
		border-radius: 50%;
		transition: opacity 0.15s ease;
	}

	.profile-menu-btn:hover {
		opacity: 0.85;
	}
	.profile-menu-btn:active {
		opacity: 0.7;
	}

	.profile-menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 99;
	}

	.profile-menu {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		z-index: 100;
		min-width: 200px;
		background: hsl(var(--gray33));
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 0.33px solid hsl(var(--white33));
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 8px 32px hsl(var(--black33));
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
		transition:
			background 0.1s ease,
			color 0.1s ease;
	}

	.profile-menu-item:hover {
		background: hsl(var(--white4));
		color: hsl(var(--white));
	}

	.profile-menu-item--danger {
		color: hsl(var(--destructive));
	}

	.profile-menu-item--danger:hover {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
	}

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
	.left-search-wrap:hover {
		background: transparent;
	}
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
		text-decoration: none;
		flex-shrink: 0;
		cursor: pointer;
		color: inherit;
	}
	.plus-btn:hover {
		background: hsl(var(--card));
	}
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
	.right-column {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		position: relative;
	}
	/* Viewport creates containing block: fixed modals/bars are scoped and centered to this column */
	.right-page-viewport {
		position: relative;
		transform: translateZ(0);
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.tab-row.pills-row-under :global(.tab-selected) {
		background-image: var(--gradient-blurple66);
	}
	.panel-placeholder {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		min-height: 200px;
	}
	.mobile-community-back {
		display: none;
	}
	.right-header-block {
		flex-shrink: 0;
		padding: 16px 16px 12px 16px;
		border-bottom: 1px solid hsl(var(--white11));
	}
	.right-header-row1 {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 32px;
	}
	.right-header-row1 .community-display-name {
		flex: 1;
		min-width: 0;
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.2;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.notifications-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: none;
		border-radius: 9999px;
		background: hsl(var(--card));
		color: hsl(var(--white33));
		flex-shrink: 0;
		cursor: pointer;
	}
	.notifications-btn:hover {
		background: hsl(var(--card));
	}
	.header-icon-group {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}
	/* Bell badge — absolutely positioned, never pushes layout */
	.bell-btn {
		position: relative;
		overflow: visible;
	}
	.bell-badge {
		position: absolute;
		top: -5px;
		right: -5px;
		min-width: 15px;
		height: 15px;
		padding: 0 3px;
		border-radius: 999px;
		background: hsl(var(--blurpleColor));
		color: white;
		font-size: 9px;
		font-weight: 700;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		z-index: 10;
	}
	.crown-content-tab {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.crown-save-row {
		margin-top: 0.5rem;
		justify-content: flex-end;
	}
	.crown-form-panel {
		gap: 0.375rem;
	}
	.crown-form-address {
		font-family: monospace;
		font-size: 0.75rem;
		word-break: break-all;
		opacity: 0.6;
	}
	.ft-id-display {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}
	.ft-id-display code {
		font-family: monospace;
		background: hsl(var(--white8));
		padding: 1px 5px;
		border-radius: 4px;
	}
	.ft-form {
		padding-bottom: 4px;
	}
	.ft-inline-back {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 4px;
	}
	.ft-back-btn {
		background: none;
		border: none;
		color: hsl(var(--white66));
		font-size: 0.8125rem;
		cursor: pointer;
		padding: 0;
	}
	.ft-back-btn:hover {
		color: hsl(var(--foreground));
	}
	.ft-inline-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}
	.ft-section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 6px;
	}
	.ft-add-field-btn {
		font-size: 0.75rem;
		color: hsl(var(--blurpleLightColor));
		background: none;
		border: none;
		cursor: pointer;
		padding: 2px 4px;
	}
	.ft-add-field-btn:hover {
		opacity: 0.8;
	}
	.ft-field-row {
		background: hsl(var(--white5));
		border: 1px solid hsl(var(--white11));
		border-radius: 8px;
		padding: 8px 10px;
		margin-bottom: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.ft-field-top {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.ft-field-top :global(.input-wrapper) {
		flex: 1;
	}
	.ft-type-select {
		background: hsl(var(--white8));
		border: 1px solid hsl(var(--white22));
		border-radius: 6px;
		color: hsl(var(--foreground));
		font-size: 0.8125rem;
		padding: 4px 8px;
		cursor: pointer;
	}
	.ft-remove-btn {
		background: none;
		border: none;
		color: hsl(var(--white33));
		font-size: 1.1rem;
		cursor: pointer;
		padding: 0 4px;
		line-height: 1;
	}
	.ft-remove-btn:hover {
		color: hsl(var(--white66));
	}
	.ft-field-bottom {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.ft-field-bottom :global(.input-wrapper) {
		flex: 1;
		min-width: 100px;
	}
	.ft-required-label {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.75rem;
		color: hsl(var(--white66));
		white-space: nowrap;
		cursor: pointer;
	}
	.ft-field-options {
		margin-top: 2px;
	}
	.ft-no-fields {
		font-size: 0.8rem;
		color: hsl(var(--white33));
		margin: 0 0 8px;
		text-align: center;
	}
	.ft-public-label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8125rem;
		color: hsl(var(--white66));
		cursor: pointer;
		margin-bottom: 6px;
	}
	.join-form-subtitle {
		font-size: 0.9375rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		margin: 0 0 2px;
	}
	.join-form-desc {
		font-size: 0.875rem;
		color: hsl(var(--white66));
		margin: 0 0 10px;
	}
	.join-required {
		color: hsl(var(--blurpleLightColor));
		margin-left: 2px;
	}
	.join-select {
		width: 100%;
		background: hsl(var(--white8));
		border: 1px solid hsl(var(--white22));
		border-radius: 8px;
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
		padding: 8px 12px;
		cursor: pointer;
	}
	.join-checkbox-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		cursor: pointer;
	}
	.join-done-wrap {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 8px 0;
	}
	.join-confirm-msg {
		font-size: 0.9375rem;
		color: hsl(var(--foreground));
		line-height: 1.55;
		margin: 0;
	}
	/* Pills row wrapper — flex row: scrolling pills + admin button side by side */
	.pills-row-wrap {
		display: flex;
		align-items: center;
		gap: 0;
		margin-left: -16px;
		margin-right: -16px;
		padding-top: 12px;
	}
	.tab-row.pills-row-under {
		flex: 1;
		min-width: 0;
		display: flex;
		gap: 8px;
		flex-wrap: nowrap;
		overflow-x: auto;
		padding: 0 0 0 16px;
		border: none;
		scrollbar-width: none;
		/* fade out the last ~24px before the admin button */
		mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);
		-webkit-mask-image: linear-gradient(to right, black calc(100% - 24px), transparent 100%);
	}
	.tab-row.pills-row-under::-webkit-scrollbar {
		display: none;
	}
	.tab-row.pills-row-under :global(.btn-primary-small),
	.tab-row.pills-row-under :global(.btn-secondary-small) {
		height: 32px;
		min-height: 32px;
		flex-shrink: 0;
	}
	.tab-row.pills-row-under :global(.btn-primary-small:hover),
	.tab-row.pills-row-under :global(.btn-secondary-small:hover) {
		transform: none;
		filter: none;
	}
	.tab-row.pills-row-under :global(.btn-primary-small:active),
	.tab-row.pills-row-under :global(.btn-secondary-small:active) {
		transform: none;
	}
	.tab-admin-fixed-pill {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		height: 32px;
		padding: 0 12px 0 10px;
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--foreground));
		background: var(--gradient-gold16);
		border: none;
		border-radius: 9999px;
		cursor: pointer;
		margin-right: 16px;
	}
	.tab-admin-fixed-pill-selected {
		background: var(--gradient-gold33);
		box-shadow: 0 0 14px hsl(var(--goldColor) / 0.3);
	}
	@media (max-width: 480px) {
		.tab-admin-fixed-pill {
			width: 32px;
			padding: 0;
		}
		.tab-admin-fixed-pill :global(span) {
			display: none;
		}
	}
	.community-info-modal {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		text-align: center;
	}
	.community-info-row-tap {
		display: flex;
		align-items: center;
		align-self: center;
		gap: 12px;
		flex: 1;
		min-width: 0;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
		border-radius: 12px;
	}
	.community-info-row-tap:hover {
		opacity: 0.9;
	}
	.community-info-row-tap .community-display-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.community-info-pic-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		position: relative;
	}
	.community-info-name {
		font-family: var(--font-display);
		font-size: 2.25rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		margin: 0;
		color: hsl(var(--foreground));
		text-align: center;
	}
	.community-info-about {
		font-size: 0.9375rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}
	.btn-more-details {
		padding: 0.3rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		background: hsl(var(--white8));
		border: none;
		border-radius: 999px;
		color: hsl(var(--white66));
		cursor: pointer;
	}
	.community-info-details-wrap {
		width: 100%;
		text-align: left;
	}
	.community-info-section-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 0.5rem;
	}
	.community-info-servers-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		font-family: var(--font-mono);
		word-break: break-all;
	}
	.community-info-blossom {
		opacity: 0.85;
	}
	.community-info-profiles-section {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		text-align: left;
		margin-top: 0.5rem;
	}
	.community-info-profiles-label {
		margin: 0;
		padding-left: 12px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: hsl(var(--white33));
	}
	.community-info-profiles-empty {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}
	.activity-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 0;
	}
	.activity-item {
		padding: 16px;
		border-bottom: 1px solid hsl(var(--white8));
	}
	.activity-item:last-child {
		border-bottom: none;
	}
	.profiles-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	/* Shared 3-section list panel — used in community info modal + join modal */
	.info-list-panel,
	.join-list-panel {
		background: hsl(var(--white8));
		border-radius: var(--radius-16);
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.list-panel-section {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0.875rem 1rem;
	}
	.list-panel-section-write {
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
		padding: 0.75rem 1rem;
	}
	.list-panel-section-actions {
		justify-content: space-between;
		padding: 0.75rem 1rem;
	}
	.list-panel-section-profiles {
		flex-direction: column;
		align-items: stretch;
		gap: 0;
		padding: 0;
	}
	.list-panel-divider {
		width: 100%;
		height: 1px;
		background: hsl(var(--white11));
		flex-shrink: 0;
	}
	.list-panel-meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		justify-content: center;
	}
	.list-panel-name {
		font-weight: 600;
		font-size: 0.9375rem;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.list-panel-desc {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.list-panel-write-label {
		font-size: 0.625rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.16em;
		color: hsl(var(--white66));
		margin: 0;
	}
	.list-panel-type-pills {
		display: flex;
		flex-direction: row;
		flex-wrap: nowrap;
		gap: 0.375rem;
		overflow-x: auto;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}
	.list-panel-type-pills::-webkit-scrollbar {
		display: none;
	}
	.list-panel-type-pill {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.25rem 0.625rem;
		background: hsl(var(--white11));
		border-radius: 12px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
	}
	.list-panel-type-emoji {
		width: 16px;
		height: 16px;
		object-fit: contain;
		flex-shrink: 0;
	}
	/* Community info modal: Section 3 profile list rows */
	.info-list-members-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.info-list-member-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 1rem;
	}
	.info-list-member-avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}
	.info-list-member-avatar-placeholder {
		background: hsl(var(--white11));
	}
	.info-list-member-name {
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.info-list-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
	}
	.info-list-actions-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.community-edit-full {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		max-height: 70vh;
		overflow-y: auto;
	}
	.community-edit-full-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.community-edit-full-section-title {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}
	.community-edit-full-section-desc {
		margin: 0 0 0.25rem;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}
	.community-edit-full-sections-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.community-edit-full-section-item {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		padding: 8px 10px;
		background: hsl(var(--white8));
		border-radius: 8px;
	}
	.community-edit-full-section-name {
		font-weight: 500;
		color: hsl(var(--foreground));
	}
	.community-edit-full-section-list-label {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}
	.community-edit-placeholder {
		margin: 0;
		font-size: 0.9375rem;
		color: hsl(var(--muted-foreground));
	}
	.admin-tab-page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1rem 0 2rem;
	}
	.admin-page-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.admin-page-section-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}
	.admin-form-section {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.admin-form-section .labels-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}
	.admin-section-row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid hsl(var(--white11));
	}
	.admin-section-row-clickable {
		flex-direction: row;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
		background: none;
		border: none;
		border-bottom: 1px solid hsl(var(--white11));
		border-radius: 0;
		width: 100%;
		text-align: left;
		font: inherit;
		color: inherit;
		padding: 0.75rem 0;
	}
	.admin-section-row-clickable:hover {
		background: hsl(var(--white8));
	}
	.admin-section-emoji-slot {
		width: 24px;
		height: 24px;
		flex-shrink: 0;
		/* Placeholder for custom emoji */
	}
	.admin-section-name {
		flex: 1;
		font-weight: 500;
		color: hsl(var(--foreground));
		min-width: 0;
	}
	.admin-section-badges-wrap {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.admin-section-badges-wrap :global(.admin-section-chevron) {
		flex-shrink: 0;
	}
	.admin-section-add-row {
		padding: 0.75rem 0;
		border-top: 1px solid hsl(var(--white11));
	}
	.admin-section-add-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.75rem 1rem;
		background: hsl(var(--white8));
		border: 1px dashed hsl(var(--white33));
		border-radius: 12px;
		color: hsl(var(--white66));
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition:
			background 0.15s ease,
			border-color 0.15s ease;
	}
	.admin-section-add-btn:hover {
		background: hsl(var(--white11));
		border-color: hsl(var(--white44));
	}
	.admin-section-modal-kinds {
		margin: 0 0 0.75rem;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}
	.admin-section-modal-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 1rem;
	}
	.btn-danger-small {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 32px;
		padding: 0 14px;
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--red-500, 0 84% 60%));
		background: transparent;
		border: 1px solid hsl(var(--red-500, 0 84% 60%));
		border-radius: 9999px;
		cursor: pointer;
		transition: transform 0.15s ease;
	}
	.btn-danger-small:hover {
		opacity: 0.9;
		transform: scale(1.025);
	}
	.admin-add-section-preset-row {
		display: block;
		width: 100%;
		padding: 0.75rem 1rem;
		text-align: left;
		background: hsl(var(--white8));
		border: none;
		border-radius: 8px;
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		cursor: pointer;
		margin-bottom: 0.5rem;
	}
	.admin-add-section-preset-row:hover {
		background: hsl(var(--white11));
	}
	.members-join-requests-panel {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 1rem 1.25rem;
		background: hsl(var(--white11));
		border: none;
		border-radius: var(--radius-16);
		cursor: pointer;
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
		text-align: left;
	}
	.members-panel-label {
		font-weight: 600;
	}
	.members-panel-count {
		background: hsl(var(--blurpleColor));
		color: white;
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
	}
	.info-list-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.btn-view-more {
		padding: 0.35rem 1rem;
		font-size: 0.8125rem;
		background: hsl(var(--white8));
		border: none;
		border-radius: var(--radius-16);
		color: hsl(var(--foreground));
		cursor: pointer;
	}
	.requests-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.request-item-row {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid hsl(var(--white11));
		list-style: none;
		margin: 0;
	}
	.request-item-row:last-child {
		border-bottom: none;
	}
	.request-meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.request-pubkey {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}
	.request-date {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}
	.request-message {
		margin: 0.25rem 0 0;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}
	.request-field {
		margin: 0.2rem 0 0;
		font-size: 0.875rem;
		color: hsl(var(--white66));
	}
	.request-field-label {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-transform: capitalize;
	}
	.list-modal-add-wrap {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		align-items: flex-end;
	}
	.list-modal-add-wrap :global(.input-field-wrapper) {
		flex: 1;
		min-width: 0;
	}
	.join-form-field {
		width: 100%;
	}
	.list-form-select {
		width: 100%;
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid hsl(var(--white15));
		background: hsl(var(--white8));
		color: hsl(var(--foreground));
		font-size: 0.9rem;
		outline: none;
		cursor: pointer;
		appearance: auto;
	}
	.list-form-select:focus {
		border-color: hsl(var(--blurple));
	}
	.list-form-hint {
		margin-top: 4px;
		font-size: 0.78rem;
		color: hsl(var(--white66));
	}
	.relay-enforced-label {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
	}
	.relay-enforced-label input[type='checkbox'] {
		width: 15px;
		height: 15px;
		flex-shrink: 0;
		cursor: pointer;
	}
	.labels-label {
		display: block;
		margin-bottom: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}
	.list-modal-members {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: 280px;
		overflow-y: auto;
	}
	.list-modal-member-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0;
		margin: 0;
	}
	.list-modal-member-pubkey {
		flex: 1;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.list-modal-remove-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: none;
		border-radius: 8px;
		background: hsl(var(--white8));
		cursor: pointer;
		flex-shrink: 0;
	}
	.list-modal-remove-btn:hover {
		background: hsl(var(--white16));
	}
	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
		/* Space for fixed bottom bar */
		padding-bottom: 100px;
	}
	/* Hide section divs that aren't the active tab — keeps DOM alive so images stay cached. */
	.section-hidden {
		display: none !important;
	}

	.panel-content:has(.forum-list:not(.section-hidden)),
	.panel-content:has(.tasks-list:not(.section-hidden)),
	.panel-content:has(.projects-list:not(.section-hidden)),
	.panel-content:has(.wiki-list:not(.section-hidden)),
	.panel-content:has(.activity-list) {
		padding: 0 0 100px;
	}

	.projects-list {
		display: flex;
		flex-direction: column;
		padding: 0;
		gap: 0;
	}
	/* Detail views own their padding/scrolling via content-scroll */
	.panel-content-detail {
		overflow: hidden;
		display: flex;
		flex-direction: column;
		padding: 0;
	}
	.forum-list {
		display: flex;
		flex-direction: column;
		padding: 0;
		gap: 0;
	}

	.task-group-header {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 6px 10px 6px 16px;
		background: hsl(var(--white4));
		border-bottom: 1.4px solid hsl(var(--white11));
	}

	@media (min-width: 768px) {
		.task-group-header {
			padding: 8px 12px 8px 16px;
		}
	}

	.task-group-count {
		font-size: 11px;
		font-weight: 500;
		color: hsl(var(--white33));
	}

	.task-group-add-btn {
		margin-left: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		background: transparent;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
		transition: background 0.15s;
	}
	.task-group-add-btn:hover {
		background: hsl(var(--white4));
	}
	.task-group-add-btn:active {
		background: hsl(var(--white11));
	}

	/* Wiki panels — gapped cards with horizontal padding */
	.wiki-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
	}
	/* Eyebrow label (form step only — centered) */
	.join-form-header {
		text-align: center;
		margin-bottom: 1.25rem;
	}
	.join-form-header .join-modal-title {
		font-size: 1.875rem;
		font-weight: 700;
		line-height: 1.15;
	}
	.join-eyebrow {
		font-size: 0.6875rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.18em;
		color: hsl(var(--white33));
		margin: 0 0 0.4rem;
	}
	.join-modal-title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.3;
	}
	/* List step — info-style panels */
	.join-list-panels {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}
	/* Form step */
	.join-form {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}
	.join-modal-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 0.25rem;
	}
	.list-form-modal-content {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.list-picker-desc {
		margin: 0 0 0.75rem;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}
	.list-picker-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.list-picker-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
		padding: 0.5rem 0;
		border-radius: var(--radius-12);
	}
	.list-picker-row:hover {
		background: hsl(var(--white8));
	}
	.list-picker-name {
		font-size: 0.9375rem;
		color: hsl(var(--foreground));
	}
	@media (max-width: 767px) {
		.communities-layout {
			grid-template-columns: 1fr;
		}
		/* No community selected: show list full-screen */
		.left-column {
			border-right: none;
			border-bottom: none;
			height: 100dvh;
			overflow-y: auto;
		}
		.right-column {
			display: none;
		}
		/* Community selected OR event open: hide list, show detail full-screen */
		.communities-layout.community-open .left-column,
		.communities-layout.event-open .left-column {
			display: none;
		}
		.communities-layout.community-open .right-column,
		.communities-layout.event-open .right-column {
			display: flex;
			flex-direction: column;
			height: 100dvh;
		}
		/*
		 * On mobile, remove the transform that scopes position:fixed to this container.
		 * The right-column IS the full viewport on mobile, so fixed children (BottomBar,
		 * modals) must be anchored to the actual viewport — otherwise they sit behind
		 * the browser chrome because the containing block bottom ≠ visual viewport bottom.
		 */
		.right-page-viewport {
			transform: none;
		}
		.mobile-community-back {
			display: flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
			align-self: center;
		}
	}
</style>

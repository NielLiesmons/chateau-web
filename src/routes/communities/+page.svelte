<script lang="js">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import InputTextField from '$lib/components/common/InputTextField.svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { nip19 } from 'nostr-tools';
	import { Plus, Search } from '$lib/components/icons';
	import { liveQuery, queryEvents, queryEvent, putEvents } from '$lib/nostr';
	import { parseCommunity, parseProfileList, parseFormTemplate, parseForumPost, parseProfile } from '$lib/nostr';
	import {
		fetchProfileListFromRelays,
		fetchFormTemplateFromRelays,
		fetchCommunityForumPosts,
		subscribeCommunityForumPosts,
		subscribeForumPostComments,
		publishToRelays
	} from '$lib/nostr';
	import { DEFAULT_COMMUNITY_RELAYS, EVENT_KINDS } from '$lib/config';
	import { getCurrentPubkey, signEvent, encrypt44, decrypt44 } from '$lib/stores/auth.svelte.js';
	import { renderMarkdown } from '$lib/utils/markdown';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import ForumPost from '$lib/components/ForumPost.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import CommunityBottomBar from '$lib/components/community/CommunityBottomBar.svelte';
	import ForumPostDetail from '$lib/components/community/ForumPostDetail.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ForumPostModal from '$lib/components/modals/ForumPostModal.svelte';
	import Checkbox from '$lib/components/common/Checkbox.svelte';
	import { Pen, Cross, Bell, ChevronRight } from '$lib/components/icons';
	import BadgeStack from '$lib/components/common/BadgeStack.svelte';

	const SECTION_PILLS = [
		{ id: 'forum', label: 'Forum', kinds: [11] },
		{ id: 'tasks', label: 'Tasks', kinds: [] },
		{ id: 'chat', label: 'Chat', kinds: [] },
		{ id: 'apps', label: 'Apps', kinds: [] },
		{ id: 'members', label: 'Members', kinds: [] }
	];

	/** Preset content sections for Admin tab: toggle on + set profile list address. Order: General first, then Forum, Chat, etc. */
	const ADMIN_SECTION_PRESETS = [
		{ id: 'general', name: 'General', kinds: [1111, 7, 1985], description: 'Comments, reactions, labels' },
		{ id: 'forum', name: 'Forum', kinds: [11], description: 'Forum posts' },
		{ id: 'chat', name: 'Chat', kinds: [9], description: 'Chat messages' },
		{ id: 'tasks', name: 'Tasks', kinds: [30400], description: 'Tasks' },
		{ id: 'apps', name: 'Apps', kinds: [32267], description: 'Apps' },
		{ id: 'docs', name: 'Docs', kinds: [30101], description: 'Docs' },
		{ id: 'wikis', name: 'Wikis', kinds: [30808], description: 'Wikis' }
	];

	const communityNpub = $derived($page.url.searchParams.get('c') || '');
	const openPostId = $derived($page.url.searchParams.get('post') || '');
	const currentPubkey = $derived(getCurrentPubkey());


	let communities = $state([]);
	let profilesByPubkey = $state(new Map());
	let selectedCommunity = $state(null);
	let selectedSection = $state('forum');
	let forumPosts = $state([]);
	let forumMembers = $state([]);
	let profileListEvent = $state(null);
	let forumUnsub = $state(null);
	let joinModalOpen = $state(false);
	let joinStep = $state('list'); // 'list' | 'form'
	let joinableLists = $state([]);
	let selectedJoinList = $state(null); // { formAddress, listName }
	let joinFormTemplate = $state(null);
	let joinMessage = $state('');
	let joinSubmitting = $state(false);
	let joinError = $state('');
	let joinFetched = $state(false);
	let searchQuery = $state('');
	let forumCountByPubkey = $state(new Map());
	let lastActivityByPubkey = $state(new Map());
	/** @type {Map<string, { pubkey: string; displayName?: string; avatarUrl?: string }[]>} */
	let commentersByPostId = $state(new Map());
	let communityInfoModalOpen = $state(false);
	/** When community info modal is open, sections with list name for display */
	let communityModalSections = $state([]); // { sectionName, listName, listAddress }[]
	let communityEditModalOpen = $state(false);
	let communityEditTarget = $state(null); // 'picture' | 'name' | 'description' | 'relays' | 'section-N'
	let communityEditPicture = $state('');
	let communityEditName = $state('');
	let communityEditDescription = $state('');
	let communityEditRelays = $state('');
	let communityEditBlossom = $state('');
	let communityEditSectionName = $state('');
	let communityEditSectionListAddress = $state('');
	let communityEditSubmitting = $state(false);
	let communityEditError = $state('');
	let addPostModalOpen = $state(false);
	let newPostTitle = $state('');
	let newPostContent = $state('');
	let newPostLabels = $state([]);
	let newPostLabelInput = $state('');
	let newPostSubmitting = $state(false);
	let newPostError = $state('');
	let membersListData = $state([]); // { listAddress, listEvent, parsed, sectionName }[] — loaded in background when Members tab selected
	let joinRequestsCount = $state(0);
	let joinRequestsModalOpen = $state(false);
	let listViewMoreModal = $state(null); // { listAddress, listEvent, parsed } or null
	let listViewMoreAddInput = $state('');
	let listViewMoreAddError = $state('');
	let listViewMoreAddSubmitting = $state(false);
	let listViewMoreEditFormOpen = $state(false);
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

	// Resolve selected community (event + profile) from npub
	$effect(() => {
		if (!communityNpub || !browser) return;
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
							displayName: profile?.display_name ?? profile?.name ?? content.display_name ?? content.name ?? null,
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

	// liveQuery: profiles for community pubkeys + current user (kind 0)
	$effect(() => {
		if (!browser) return;
		const pubkeys = [...new Set([...communities.map((c) => c.pubkey), ...(currentPubkey ? [currentPubkey] : [])])];
		if (pubkeys.length === 0) return;
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
			error: (e) => console.error('[Communities] profiles liveQuery error', e)
		});
		return () => sub.unsubscribe();
	});

	// liveQuery: forum post counts and last activity per community (for list cards)
	$effect(() => {
		if (!browser || communities.length === 0) return;
		const pubkeySet = new Set(communities.map((c) => c.pubkey));
		const sub = liveQuery(async () => {
			const posts = await queryEvents({
				kinds: [EVENT_KINDS.FORUM_POST],
				limit: 800
			});
			const countBy = new Map();
			const lastBy = new Map();
			for (const p of posts) {
				const h = p.tags?.find((t) => t[0] === 'h')?.[1];
				if (!h || !pubkeySet.has(h)) continue;
				countBy.set(h, (countBy.get(h) || 0) + 1);
				const ts = p.created_at;
				if (!lastBy.has(h) || ts > lastBy.get(h)) lastBy.set(h, ts);
			}
			return { countBy, lastBy };
		}).subscribe({
			next: (val) => {
				if (val) {
					forumCountByPubkey = val.countBy || new Map();
					lastActivityByPubkey = val.lastBy || new Map();
				}
			},
			error: (e) => console.error('[Communities] forum counts error', e)
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
		const relays = selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS;
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

	let forumCommentsUnsub = null;
	// Subscribe to kind 1 comments on current forum posts so they are stored and commenters show
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
		const relays = selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS;
		forumCommentsUnsub = subscribeForumPostComments(relays, postIds);
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
			return events.map((e) => parseForumPost(e)).filter(Boolean);
		}).subscribe({
			next: (val) => {
				forumPosts = val || [];
			},
			error: (e) => console.error('[Communities] forum liveQuery error', e)
		});
		return () => sub.unsubscribe();
	});

	// liveQuery: comments on forum posts (kind 1 with #e = post id) → commenters per post
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
		const sub = liveQuery(async () => {
			const commentEvs = await queryEvents({
				kinds: [1],
				'#e': postIds,
				limit: 400
			});
			const byPostId = new Map();
			const allPubkeys = new Set();
			for (const ev of commentEvs) {
				const eTag = ev.tags?.find((t) => t[0] === 'e')?.[1];
				if (!eTag) continue;
				if (!byPostId.has(eTag)) byPostId.set(eTag, new Set());
				byPostId.get(eTag).add(ev.pubkey);
				allPubkeys.add(ev.pubkey);
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
						name: p.name,
						avatarUrl: p.picture
					});
				} catch {
					profileByPubkey.set(e.pubkey, {});
				}
			}
			const out = new Map();
			for (const [pid, pubkeySet] of byPostId) {
				const list = [];
				for (const pk of pubkeySet) {
					const prof = profileByPubkey.get(pk) || {};
					list.push({
						pubkey: pk,
						displayName: prof.displayName ?? prof.name,
						avatarUrl: prof.avatarUrl
					});
				}
				out.set(pid, list);
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

	const isMember = $derived(
		selectedCommunity && currentPubkey && forumMembers.includes(currentPubkey)
	);
	/** Pills from community content sections + Members + Admin (for admin). General is never shown as a tab. */
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
		if (fromSections.length === 0 && sections.length === 0) return SECTION_PILLS.filter((p) => p.id !== 'general');
		return [
			...fromSections,
			{ id: 'members', label: 'Members', kinds: [] },
			...(isCommunityAdmin ? [{ id: 'admin', label: 'Admin', kinds: [] }] : [])
		];
	});
	const selectedSectionKinds = $derived(sectionPills.find((p) => p.id === selectedSection)?.kinds ?? []);
	const isForumSection = $derived(selectedSection === 'forum' || selectedSectionKinds.includes(11));
	const hasForm = $derived(profileListEvent && parseProfileList(profileListEvent)?.form);
	const formAddress = $derived(selectedJoinList?.formAddress ?? (profileListEvent ? parseProfileList(profileListEvent)?.form : null));
	const isCommunityAdmin = $derived(
		!!selectedCommunity?.pubkey && !!currentPubkey && selectedCommunity.pubkey === currentPubkey
	);

	const currentUserProfileContent = $derived.by(() => {
		if (!currentPubkey) return {};
		const p = profilesByPubkey.get(currentPubkey);
		if (!p?.content) return {};
		try { return JSON.parse(p.content); } catch { return {}; }
	});
	const currentUserNpub = $derived(
		currentPubkey ? (() => { try { return nip19.npubEncode(currentPubkey); } catch { return ''; } })() : ''
	);

	const SINGLE_COMMUNITY_NPUB = 'npub1vcxcc7r9racyslkfhrwu9qlznne9v95nmk3m5frd8lfuprdmwzpsxqzqcr';
	const filteredCommunities = $derived.by(() => {
		const all = !searchQuery.trim()
			? communities
			: communities.filter((c) => {
					const profile = profilesByPubkey.get(c.pubkey);
					const content = profile?.content ? (() => { try { return JSON.parse(profile.content || '{}'); } catch { return {}; } })() : {};
					const name = (content.display_name ?? content.name ?? '').toLowerCase();
					return name.includes(searchQuery.trim().toLowerCase());
				});
		// For now only show this single community
		return all.filter((c) => {
			try {
				return nip19.npubEncode(c.pubkey) === SINGLE_COMMUNITY_NPUB;
			} catch {
				return false;
			}
		});
	});


	// When Admin tab is selected, populate admin form from current community only when first entering Admin or when community (pubkey) changes — do not overwrite user edits when selectedCommunity updates from liveQuery.
	$effect(() => {
		if (!browser || !selectedCommunity) return;
		const pubkey = selectedCommunity.pubkey;
		if (selectedSection === 'admin') {
			if (lastAdminSyncedPubkey !== pubkey) {
				lastAdminSyncedPubkey = pubkey;
				adminPicture = selectedCommunity.picture ?? '';
				adminName = selectedCommunity.displayName ?? selectedCommunity.name ?? '';
				adminDescription = selectedCommunity.about ?? selectedCommunity.description ?? '';
				adminRelays = (selectedCommunity.relays ?? []).join('\n');
				adminBlossom = ((selectedCommunity.raw?.tags ?? []).filter((t) => t[0] === 'blossom').map((t) => t[1])).join('\n');
				const comm = parseCommunity(selectedCommunity.raw || selectedCommunity);
				const sections = comm?.sections ?? [];
				const enabled = {};
				const listAddress = {};
				for (const preset of ADMIN_SECTION_PRESETS) {
					const sec = sections.find((s) => (s.name || '').toLowerCase() === preset.name.toLowerCase());
					enabled[preset.id] = !!sec;
					const addrs = sec?.profileListAddresses ?? (sec?.profileListAddress ? [sec.profileListAddress] : []);
					listAddress[preset.id] = addrs;
				}
				adminSectionEnabled = enabled;
				adminSectionListAddress = listAddress;
			}
		} else {
			lastAdminSyncedPubkey = null;
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
		const relays = selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS;
		(async () => {
			const list = [];
			const addresses = (sec) => sec.profileListAddresses ?? (sec.profileListAddress ? [sec.profileListAddress] : []);
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

	// When Admin tab is selected, load all profile lists (kind 30000) by this community for list picker
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey || selectedSection !== 'admin') return;
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
				return { listAddress, name: (parsed?.name ?? dTag) || 'List', image: parsed?.image ?? null, listEvent: e, parsed };
			});
			adminProfileLists = list;
		})();
	});

	// When Members tab is selected, load profile lists from sections in background (do not block UI).
	// Deduplicate by listAddress so one list assigned to multiple sections shows as one panel with "Can write in: A, B, C".
	$effect(() => {
		if (!browser || !selectedCommunity || selectedSection !== 'members') return;
		const comm = parseCommunity(selectedCommunity.raw || selectedCommunity);
		const sections = comm?.sections ?? [];
		const relays = selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS;
		membersListData = [];
		(async () => {
			// listAddress -> sectionNames[]
			const listToSections = new Map();
			for (const sec of sections) {
				const addresses = sec.profileListAddresses ?? (sec.profileListAddress ? [sec.profileListAddress] : []);
				const sectionName = sec.name || 'Section';
				for (const listAddress of addresses) {
					if (!listAddress) continue;
					if (!listToSections.has(listAddress)) listToSections.set(listAddress, []);
					listToSections.get(listAddress).push(sectionName);
				}
			}
			const list = [];
			for (const [listAddress, sectionNames] of listToSections) {
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
					listAddress,
					listEvent: listEv,
					parsed: parsed ?? { name: 'List', members: [], form: null, dTag },
					sectionName: sectionNames.join(', ')
				});
			}
			membersListData = list;
		})();
	});

	// Admin: load join requests count in background
	$effect(() => {
		if (!browser || !selectedCommunity?.pubkey || !isCommunityAdmin) return;
		(async () => {
			const evs = await queryEvents({
				kinds: [EVENT_KINDS.FORM_RESPONSE],
				'#p': [selectedCommunity.pubkey],
				limit: 200
			});
			joinRequestsCount = evs.length;
		})();
	});

	// When Join Requests modal opens, load requests and decrypt (admin only)
	$effect(() => {
		if (!browser || !joinRequestsModalOpen || !isCommunityAdmin || !selectedCommunity?.pubkey) return;
		(async () => {
			const evs = await queryEvents({
				kinds: [EVENT_KINDS.FORM_RESPONSE],
				'#p': [selectedCommunity.pubkey],
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
			await publishToRelays(selectedCommunity?.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS, newEv);
			joinRequestsCount = Math.max(0, joinRequestsCount - 1);
			joinRequestsList = joinRequestsList.filter((r) => r.id !== requestEvent.id);
		} finally {
			joinRequestsApprovingId = null;
		}
	}

	async function addProfileToList(listEvent) {
		if (!listViewMoreAddInput.trim() || listViewMoreAddSubmitting || !listViewMoreModal) return;
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
				kind: EVENT_KINDS.PROFILE_LIST,
				content: String(listEvent.content ?? ''),
				tags: newTags,
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([newEv]);
			await publishToRelays(selectedCommunity?.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS, newEv);
			listViewMoreModal = { ...listViewMoreModal, listEvent: newEv, parsed: { ...parsed, members: newMembers } };
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
			await publishToRelays(selectedCommunity?.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS, newEv);
			if (listViewMoreModal?.listEvent?.id === listEvent.id) {
				listViewMoreModal = { ...listViewMoreModal, listEvent: newEv, parsed: { ...parseProfileList(newEv), members: newMembers } };
			}
			membersListData = membersListData.map((item) =>
				item.listEvent?.id === listEvent.id ? { ...item, listEvent: newEv, parsed: parseProfileList(newEv) } : item
			);
		} catch {
			/* ignore */
		}
	}

	/** Save list edits; overrides = { name, image, description, form } from unified list form. */
	async function saveListEdits(listEvent, overrides) {
		if (!overrides || listFormSubmitting) return;
		listFormError = '';
		listFormSubmitting = true;
		try {
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
			await publishToRelays(selectedCommunity?.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS, newEv);
			const newParsed = parseProfileList(newEv);
			if (listViewMoreModal?.listEvent?.id === listEvent.id) {
				listViewMoreModal = { ...listViewMoreModal, listEvent: newEv, parsed: newParsed };
			}
			membersListData = membersListData.map((item) =>
				item.listEvent?.id === listEvent.id ? { ...item, listEvent: newEv, parsed: newParsed } : item
			);
			adminProfileLists = adminProfileLists.map((entry) =>
				entry.listEvent?.id === listEvent.id ? { ...entry, listEvent: newEv, parsed: newParsed, name: newParsed?.name ?? entry.name, image: newParsed?.image ?? null } : entry
			);
			listFormModal = null;
		} catch (e) {
			listFormError = e?.message || 'Failed to save list';
		} finally {
			listFormSubmitting = false;
		}
	}

	function openViewMoreModal(item) {
		listViewMoreModal = { listAddress: item.listAddress, listEvent: item.listEvent, parsed: item.parsed };
	}
	function openEditListModal(item) {
		openListFormModal('edit', item);
	}
	function openListFormModal(mode, item) {
		listFormModal = mode === 'add' ? { mode: 'add' } : { mode: 'edit', listAddress: item.listAddress, listEvent: item.listEvent, parsed: item.parsed };
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
				const dTag = listName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'list';
				const tags = [['d', dTag], ['name', listName], ['p', selectedCommunity.pubkey]];
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
				const relays = selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS;
				await publishToRelays(relays, listEv);
				listFormModal = null;
				selectedSection = 'admin';
			} else {
				await saveListEdits(listFormModal.listEvent, {
					name: listFormName,
					image: listFormImage,
					description: listFormDescription,
					form: listFormFormAddress
				});
			}
		} catch (e) {
			listFormError = e?.message ?? (listFormModal.mode === 'add' ? 'Failed to add list' : 'Failed to save list');
		} finally {
			listFormSubmitting = false;
		}
	}
	function openListPickerForPreset(presetId) {
		adminListPickerPresetId = presetId;
	}


	// When Join modal opens, load joinable lists (profile lists with form that user is not in)
	$effect(() => {
		if (!joinModalOpen || !selectedCommunity?.pubkey || !currentPubkey) {
			if (!joinModalOpen) {
				joinStep = 'list';
				selectedJoinList = null;
				joinableLists = [];
			}
			return;
		}
		if (joinStep !== 'list') return;
		const comm = parseCommunity(selectedCommunity.raw || selectedCommunity);
		const sections = comm?.sections ?? [];
		const relays = selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS;
		(async () => {
			const list = [];
			const addrs = (sec) => sec.profileListAddresses ?? (sec.profileListAddress ? [sec.profileListAddress] : []);
			for (const sec of sections) {
				for (const listAddress of addrs(sec)) {
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
					if (!parsed?.form) continue;
					if (parsed.members?.includes(currentPubkey)) continue;
					list.push({
						formAddress: parsed.form,
						listName: parsed.name || sec.name || 'Members',
						listAddress
					});
				}
			}
			joinableLists = list;
		})();
	});

	// When form step and selected list, fetch form template (30168)
	$effect(() => {
		if (!joinModalOpen || joinStep !== 'form' || !selectedJoinList?.formAddress || !selectedCommunity?.pubkey || joinFetched) {
			if (!joinModalOpen) {
				joinFormTemplate = null;
				joinFetched = false;
				joinMessage = '';
				joinError = '';
			}
			return;
		}
		joinFetched = true;
		joinFormTemplate = null;
		joinError = '';
		const formAddressVal = selectedJoinList.formAddress;
		const parts = formAddressVal.split(':');
		const formPubkey = parts[1];
		const formD = parts.length >= 3 ? parts.slice(2).join(':') : '';
		const relays = selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS;
		(async () => {
			try {
				let ev = await queryEvent({
					kinds: [EVENT_KINDS.FORM_TEMPLATE],
					authors: [formPubkey],
					'#d': [formD]
				});
				if (!ev) {
					ev = await fetchFormTemplateFromRelays(relays, formAddressVal);
					if (ev) await putEvents([ev]);
				}
				joinFormTemplate = ev;
			} catch (e) {
				joinError = e?.message || 'Failed to load form';
			}
		})();
	});

	async function submitJoinForm() {
		const formAddr = selectedJoinList?.formAddress ?? formAddress;
		if (!formAddr || !selectedCommunity?.pubkey || !currentPubkey) return;
		joinSubmitting = true;
		joinError = '';
		try {
			const plaintext = joinMessage.trim() || ' ';
			const content = await encrypt44(selectedCommunity.pubkey, plaintext);
			const relays = selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS;
			const template = {
				kind: EVENT_KINDS.FORM_RESPONSE,
				content,
				tags: [
					['a', formAddr],
					['p', selectedCommunity.pubkey]
				],
				created_at: Math.floor(Date.now() / 1000)
			};
			const signed = await signEvent(template);
			await publishToRelays(relays, signed);
			joinModalOpen = false;
			joinStep = 'list';
			selectedJoinList = null;
			joinMessage = '';
		} catch (e) {
			joinError = e?.message || 'Failed to submit';
		} finally {
			joinSubmitting = false;
		}
	}
	function closeJoinModal() {
		joinModalOpen = false;
		joinStep = 'list';
		selectedJoinList = null;
		joinableLists = [];
		joinFormTemplate = null;
		joinFetched = false;
		joinMessage = '';
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
			await publishToRelays(selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS, ev);
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
			await publishToRelays(selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS, ev);
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
			await publishToRelays(selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS, ev);
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
			const relayList = communityEditRelays.split(/[\n,]+/).map((r) => r.trim()).filter(Boolean);
			const blossomList = communityEditBlossom.split(/[\n,]+/).map((b) => b.trim()).filter(Boolean);
			const newTags = [];
			for (const t of raw.tags ?? []) {
				if (t[0] !== 'r' && t[0] !== 'blossom') newTags.push([...t]);
			}
			relayList.forEach((r) => newTags.push(['r', r]));
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
		const relayList = adminRelays.split(/[\n,]+/).map((r) => r.trim()).filter(Boolean);
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
			const blossomList = adminBlossom.split(/[\n,]+/).map((b) => b.trim()).filter(Boolean);
			const newTags = [];
			relayList.forEach((r) => newTags.push(['r', r]));
			blossomList.forEach((b) => newTags.push(['blossom', b]));
			for (const preset of ADMIN_SECTION_PRESETS) {
				if (!adminSectionEnabled[preset.id]) continue;
				const addrs = Array.isArray(adminSectionListAddress[preset.id])
					? adminSectionListAddress[preset.id].filter((a) => (a || '').trim())
					: ((adminSectionListAddress[preset.id] || '').trim() ? [adminSectionListAddress[preset.id].trim()] : []);
				if (addrs.length === 0) continue;
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
			const listAddress = communityEditSectionListAddress.trim() || sections[idx]?.profileListAddress || '';
			const updatedSections = sections.map((sec, i) =>
				i === idx
					? { ...sec, name: sectionName, profileListAddress: listAddress || sec.profileListAddress, profileListAddresses: listAddress ? [listAddress] : [] }
					: sec
			);
			const newTags = (raw.tags ?? []).filter((t) => t[0] !== 'content' && t[0] !== 'k' && t[0] !== 'a');
			for (const sec of updatedSections) {
				newTags.push(['content', sec.name]);
				(sec.kinds ?? []).forEach((k) => newTags.push(['k', String(k)]));
				const addrs = sec.profileListAddresses ?? (sec.profileListAddress ? [sec.profileListAddress] : []);
				addrs.forEach((a) => newTags.push(['a', a]));
			}
			const ev = await signEvent({
				kind: EVENT_KINDS.COMMUNITY,
				content: raw.content ?? '',
				tags: newTags,
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([ev]);
			await publishToRelays(selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS, ev);
			communityEditModalOpen = false;
			communityEditTarget = null;
		} catch (e) {
			communityEditError = e?.message ?? 'Failed to save';
		} finally {
			communityEditSubmitting = false;
		}
	}

	function openCommunityEdit(target) {
		communityEditTarget = target;
		communityEditError = '';
		if (target === 'picture' || target === 'full') communityEditPicture = selectedCommunity?.picture ?? '';
		if (target === 'name' || target === 'full') communityEditName = selectedCommunity?.displayName ?? selectedCommunity?.name ?? '';
		if (target === 'description' || target === 'full') communityEditDescription = selectedCommunity?.about ?? selectedCommunity?.description ?? '';
		if (target === 'relays' || target === 'full') {
			communityEditRelays = (selectedCommunity?.relays ?? []).join('\n');
			communityEditBlossom = ((selectedCommunity?.raw?.tags ?? []).filter((t) => t[0] === 'blossom').map((t) => t[1])).join('\n');
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

	function selectCommunity(npub) {
		if (typeof window !== 'undefined' && window.innerWidth < 768) {
			goto(`/communities/${encodeURIComponent(npub)}`);
			return;
		}
		goto(`/communities?c=${encodeURIComponent(npub)}`, { replaceState: true });
	}

	function openPost(eventId) {
		if (!selectedCommunity?.npub) return;
		goto(`/communities?c=${encodeURIComponent(selectedCommunity.npub)}&post=${encodeURIComponent(eventId)}`);
	}
	function backToForum() {
		if (!selectedCommunity?.npub) return;
		goto(`/communities?c=${encodeURIComponent(selectedCommunity.npub)}`);
	}
	function openCreatePost() {
		addPostModalOpen = true;
		newPostTitle = '';
		newPostContent = '';
		newPostLabels = [];
		newPostLabelInput = '';
		newPostError = '';
	}
	function closeCreatePost() {
		addPostModalOpen = false;
		newPostTitle = '';
		newPostContent = '';
		newPostLabels = [];
		newPostLabelInput = '';
		newPostError = '';
		newPostSubmitting = false;
	}
	function addPostLabel() {
		const v = newPostLabelInput.trim();
		if (!v || newPostLabels.includes(v)) return;
		newPostLabels = [...newPostLabels, v];
		newPostLabelInput = '';
	}
	function removePostLabel(label) {
		newPostLabels = newPostLabels.filter((l) => l !== label);
	}
	async function submitNewPost() {
		if (!selectedCommunity?.pubkey || !currentPubkey || newPostSubmitting) return;
		if (!newPostTitle.trim()) {
			newPostError = 'Title is required';
			return;
		}
		const title = newPostTitle.trim();
		newPostError = '';
		newPostSubmitting = true;
		try {
			const tagTags = (newPostLabels || []).map((l) => ['t', String(l).trim()]).filter((t) => t[1]);
			const ev = await signEvent({
				kind: EVENT_KINDS.FORUM_POST,
				content: newPostContent.trim(),
				tags: [
					['h', selectedCommunity.pubkey],
					['title', title],
					...tagTags
				],
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([ev]);
			await publishToRelays(selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS, ev);
			closeCreatePost();
		} catch (e) {
			newPostError = e?.message || 'Failed to publish';
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
				...labels.map(l => /** @type {[string, string]} */ (['t', l]))
			],
			created_at: Math.floor(Date.now() / 1000)
		});
		await putEvents([ev]);
		await publishToRelays(
			selectedCommunity.relays?.length ? selectedCommunity.relays : DEFAULT_COMMUNITY_RELAYS,
			ev
		);
	}

	function formatDate(ts) {
		if (!ts) return '';
		const d = new Date(ts * 1000);
		return d.toLocaleDateString(undefined, { dateStyle: 'short' });
	}
	function formatRelativeTime(ts) {
		if (!ts) return '—';
		const d = new Date(ts * 1000);
		const now = Date.now();
		const diff = (now - d.getTime()) / 1000;
		if (diff < 60) return 'now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
		if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
		return d.toLocaleDateString(undefined, { dateStyle: 'short' });
	}
	/** Emoji images from static/images/emoji for LEFT column only (e.g. content pill in community list) */
	const LEFT_PAGE_EMOJI_IMG = {
		forum: '/images/emoji/forum.png'
	};
</script>

<svelte:head>
	<title>Communities - Chateau</title>
	<meta name="description" content="Browse and join Nostr communities" />
</svelte:head>

<main class="communities-layout">
	<!-- Left column: fixed header + communities list -->
	<aside class="left-column">
		<header class="left-header">
			{#if currentPubkey}
				<ProfilePic
					pictureUrl={currentUserProfileContent?.picture}
					name={currentUserProfileContent?.display_name ?? currentUserProfileContent?.name}
					pubkey={currentUserNpub}
					size="bubble"
				/>
			{:else}
				<a href="/" class="chateau-icon-link" aria-label="Chateau">
					<svg width="28" height="36" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="chateau-icon">
						<defs><linearGradient id="chateau-sidebar-logo" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#5C5FFF"/><stop offset="100%" stop-color="#4542FF"/></linearGradient></defs>
						<path d="M12.9331 46.8902L0.0607555 2.20135C-0.173983 1.38641 0.292202 0.534787 1.10201 0.299195L15.8657 46.037C16.1005 46.852 15.6343 47.7036 14.8245 47.9392L14.0147 48.1748 13.1679 47.7051 12.9331 46.8902Z" fill="url(#chateau-sidebar-logo)"/>
						<path d="M21.7663 1.39501C13.241 -0.316389 8.55784 -0.0736039 6.67019 0.176475C6.13863 0.246896 5.8744 0.800356 6.10004 1.28991C6.53476 2.2331 7.24506 3.78105 7.97765 5.40646C8.51885 6.60726 8.95486 7.6941 9.26865 8.51995C9.60411 9.40282 10.5604 9.92704 11.482 9.74561C12.4674 9.55164 13.9551 9.28876 16.0978 8.97692C19.3497 8.50368 22.9139 8.48585 24.8112 8.52028C25.1227 8.52593 25.1957 8.9502 24.9068 9.06739C23.2045 9.758 20.082 11.0742 17.3395 12.4995C14.9353 13.749 13.4495 14.8922 12.6445 15.6081C12.1233 16.0716 11.9119 16.7656 11.9858 17.4619C12.0876 18.4219 12.2487 19.9079 12.4308 21.4668C12.5805 22.7483 12.9067 24.4589 13.2039 25.8843C13.3792 26.7247 14.6933 26.8959 15.1691 26.1835C16.8451 23.6744 20.3135 19.5512 26.8793 15.4386C35.3623 10.1253 37.464 4.95103 37.9815 2.56559C38.118 1.93645 37.474 1.49021 36.8581 1.6653C34.7513 2.26428 29.9639 3.04065 21.7663 1.39501Z" fill="url(#chateau-sidebar-logo)"/>
					</svg>
				</a>
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
				<p class="text-muted-foreground text-sm p-4">No communities yet. Create one to get started.</p>
			{:else}
				{#each filteredCommunities as comm}
					{@const npub = (() => { try { return nip19.npubEncode(comm.pubkey); } catch { return ''; } })()}
					{@const profile = profilesByPubkey.get(comm.pubkey)}
					{@const displayName = profile?.content ? (() => { try { const j = JSON.parse(profile.content); return j.display_name ?? j.name; } catch { return ''; } })() : ''}
					{@const forumCount = forumCountByPubkey.get(comm.pubkey) ?? 0}
					{@const lastTs = lastActivityByPubkey.get(comm.pubkey)}
					<button
						type="button"
						class="community-card"
						class:selected={communityNpub === npub}
						onclick={() => selectCommunity(npub)}
					>
						<ProfilePic
							pictureUrl={profile?.content ? (() => { try { return JSON.parse(profile.content).picture; } catch { return null; } })() : null}
							name={displayName}
							pubkey={comm.pubkey}
							size="lgXl"
						/>
						<div class="community-card-body">
							<div class="community-card-row1">
								<span class="community-name">{displayName || 'Unnamed'}</span>
								<span class="community-time">{formatRelativeTime(lastTs)}</span>
							</div>
							<div class="community-card-row2">
								{#if forumCount > 0}
									<span class="content-pill" title="Forum"><img src={LEFT_PAGE_EMOJI_IMG.forum} alt="" class="content-emoji-img" /><span class="content-count">{forumCount}</span></span>
								{/if}
							</div>
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</aside>

	<!-- Right column: viewport creates containing block so modals/bars are scoped here -->
	<div class="right-column">
		<div class="right-page-viewport">
		{#if !selectedCommunity}
			<div class="panel-placeholder">
				<EmptyState message="Select a community" minHeight={280} />
			</div>
		{:else if openPostId}
			<div class="panel-content panel-content-detail">
				<ForumPostDetail
					eventId={openPostId}
					communityNpub={selectedCommunity.npub}
					onBack={backToForum}
				/>
			</div>
		{:else}
			<div class="right-header-block">
				<div class="right-header-row1">
					<button type="button" class="community-info-row-tap" onclick={() => (communityInfoModalOpen = true)} aria-label="Community info">
						<ProfilePic
							pictureUrl={selectedCommunity.picture}
							name={selectedCommunity.displayName || selectedCommunity.name}
							pubkey={selectedCommunity.pubkey}
							size="md"
						/>
						<h1 class="community-display-name">{selectedCommunity.displayName || selectedCommunity.name || 'Unnamed'}</h1>
					</button>
					<button type="button" class="notifications-btn" aria-label="Notifications">
						<Bell variant="fill" size={16} color="hsl(var(--white33))" />
					</button>
				</div>
				<div class="tab-row pills-row-under">
					{#each sectionPills as pill}
						<button
							type="button"
							class={selectedSection === pill.id ? 'btn-primary-small tab-selected' : 'btn-secondary-small'}
							onclick={() => (selectedSection = pill.id)}
						>
							{pill.label}
						</button>
					{/each}
				</div>
			</div>
			<div class="panel-content">
				{#if isForumSection}
					<div class="forum-list">
						{#if forumPosts.length === 0}
							<EmptyState message="No forum posts yet" minHeight={600} />
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
									timestamp={post.createdAt}
									labels={post.labels ?? []}
									commenters={commentersByPostId.get(post.id) ?? []}
									onClick={() => openPost(post.id)}
								/>
							{/each}
						{/if}
					</div>
				{:else if selectedSection === 'members'}
					<div class="members-tab">
						{#if isCommunityAdmin && joinRequestsCount > 0}
							<button type="button" class="members-join-requests-panel" onclick={() => (joinRequestsModalOpen = true)}>
								<span class="members-panel-label">Join Requests</span>
								<span class="members-panel-count">{joinRequestsCount}</span>
							</button>
						{/if}
						{#each membersListData as item}
							{@const members = item.parsed?.members ?? []}
							<div class="members-list-panel">
								<div class="members-list-panel-top">
									<span class="members-list-name">{item.parsed?.name ?? item.sectionName}</span>
									<span class="members-list-count">{members.length}</span>
								</div>
								{#if item.parsed?.content}
									<p class="members-list-desc">{item.parsed.content}</p>
								{/if}
								<p class="members-list-sections">Can write in: {item.sectionName}</p>
								<ul class="members-list-profiles-vertical">
									{#each members as pubkey}
										{@const profile = profilesByPubkey.get(pubkey)}
										{@const displayName = profile?.display_name ?? profile?.name ?? (profile?.content ? (() => { try { const c = JSON.parse(profile.content || '{}'); return c.display_name ?? c.name ?? null; } catch { return null; } })() : null) ?? (pubkey.slice(0, 12) + '…')}
										<li class="members-list-profile-row">
											<ProfilePic pubkey={pubkey} size="sm" />
											<span class="members-list-profile-name">{displayName}</span>
										</li>
									{/each}
								</ul>
								<div class="members-list-actions">
									<button type="button" class="btn-view-more" onclick={() => openViewMoreModal(item)}>View More</button>
									{#if isCommunityAdmin}
										<button type="button" class="list-panel-edit-btn" aria-label="Edit list" onclick={() => openEditListModal(item)}>
											<Pen variant="outline" size={14} strokeWidth={1.4} color="hsl(var(--foreground))" />
											<span>Edit</span>
										</button>
									{/if}
									{#if item.parsed?.form && !members.includes(currentPubkey)}
										<button type="button" class="btn-join-list" onclick={() => { selectedJoinList = { formAddress: item.parsed.form, listName: item.parsed?.name, listAddress: item.listAddress }; joinModalOpen = true; }}>Join</button>
									{/if}
								</div>
							</div>
						{/each}
						{#if membersListData.length === 0 && selectedSection === 'members'}
							<EmptyState message="No member lists" minHeight={600} />
						{/if}
					</div>
				{:else if selectedSection === 'admin'}
					<div class="admin-tab">
						<div class="admin-form-section">
							<label class="labels-label" for="admin-picture">Picture URL</label>
							<InputTextField bind:value={adminPicture} placeholder="https://…" singleLine={true} id="admin-picture" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
						</div>
						<div class="admin-form-section">
							<label class="labels-label" for="admin-name">Community name</label>
							<InputTextField bind:value={adminName} placeholder="Name" singleLine={true} id="admin-name" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
						</div>
						<div class="admin-form-section">
							<label class="labels-label" for="admin-desc">Description</label>
							<InputTextField bind:value={adminDescription} placeholder="Description" singleLine={false} size="medium" id="admin-desc" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
						</div>
						<div class="admin-form-section">
							<label class="labels-label" for="admin-relays">Relays (one per line or comma-separated)</label>
							<InputTextField bind:value={adminRelays} placeholder="wss://…" singleLine={false} size="medium" id="admin-relays" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
						</div>
						<div class="admin-form-section">
							<label class="labels-label" for="admin-blossom">Blossom servers</label>
							<InputTextField bind:value={adminBlossom} placeholder="https://…" singleLine={false} size="medium" id="admin-blossom" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
						</div>
						<h3 class="admin-sections-title">Content sections</h3>
						{#each ADMIN_SECTION_PRESETS.filter((p) => adminSectionEnabled[p.id]) as preset}
							{@const addrs = Array.isArray(adminSectionListAddress[preset.id]) ? adminSectionListAddress[preset.id] : (adminSectionListAddress[preset.id] ? [adminSectionListAddress[preset.id]] : [])}
							{@const listItems = adminProfileLists.filter((l) => addrs.includes(l.listAddress)).map((l) => ({ image: l.image, name: l.name }))}
							<button
								type="button"
								class="admin-section-row admin-section-row-clickable"
								onclick={() => (adminSectionModalPresetId = preset.id)}
							>
								<span class="admin-section-emoji-slot"></span>
								<span class="admin-section-name">{preset.name}</span>
								<span class="admin-section-badges-wrap">
									<BadgeStack items={listItems} maxDisplay={3} overlapPx={16} badgeSizePx={32} />
									<ChevronRight variant="outline" size={16} color="hsl(var(--white33))" className="admin-section-chevron" />
								</span>
							</button>
						{/each}
						<div class="admin-section-add-row">
							<button type="button" class="admin-section-add-btn" onclick={() => (adminAddSectionOpen = true)} aria-label="Add content section">
								<Plus variant="outline" size={18} color="hsl(var(--white66))" />
								<span>Add content section</span>
							</button>
						</div>
						{#if adminSaveError}
							<p class="text-sm text-red-500">{adminSaveError}</p>
						{/if}
					</div>
				{:else}
					<EmptyState message="{sectionPills.find((p) => p.id === selectedSection)?.label ?? selectedSection} coming soon" minHeight={200} />
				{/if}
			</div>
			{#if selectedCommunity && !openPostId}
				<CommunityBottomBar
					isMember={isMember}
					hasForm={hasForm}
					showFeedBar={selectedSection !== 'admin' && selectedSection !== 'members'}
					showMembersBar={selectedSection === 'members'}
					onAddList={() => openListFormModal('add')}
					showAdminSave={selectedSection === 'admin' && isCommunityAdmin}
					onAdminSave={saveCommunityAdminAll}
					adminSaveSubmitting={adminSaveSubmitting}
					communityName={selectedCommunity.displayName || selectedCommunity.name || ''}
					modalOpen={addPostModalOpen}
					onJoin={() => (joinModalOpen = true)}
					onComment={() => {}}
					onZap={() => {}}
					onAdd={openCreatePost}
					onSearch={() => { /* TODO: section search */ }}
				/>
			{/if}
		{/if}
		<!-- Modals and overlays scoped to right page (inside viewport containing block) -->
		<Modal open={communityInfoModalOpen} onClose={() => { communityInfoModalOpen = false; communityEditModalOpen = false; }} ariaLabel="Community info">
	{#if communityInfoModalOpen && selectedCommunity}
		{@const commTags = selectedCommunity.raw?.tags ?? []}
		{@const blossomUrls = commTags.filter((t) => t[0] === 'blossom').map((t) => t[1]).filter(Boolean)}
		{@const relayUrls = selectedCommunity.relays ?? []}
		<div class="community-info-modal">
			{#if isCommunityAdmin}
				<button type="button" class="community-info-edit-btn" aria-label="Edit community" onclick={() => openCommunityEdit('full')}>
					<Pen variant="fill" size={14} color="hsl(var(--white33))" />
					<span>Edit</span>
				</button>
			{/if}
			<div class="community-info-pic-wrap">
				<ProfilePic
					pictureUrl={selectedCommunity.picture}
					name={selectedCommunity.displayName || selectedCommunity.name}
					pubkey={selectedCommunity.pubkey}
					size="2xl"
				/>
			</div>
			<div class="community-info-title-row">
				<h2 class="community-info-title join-modal-title">{selectedCommunity.displayName || selectedCommunity.name || 'Unnamed'}</h2>
			</div>
			<div class="community-info-desc-wrap">
				<p class="community-info-description">{selectedCommunity.about ?? selectedCommunity.description ?? 'No description.'}</p>
			</div>
			<div class="community-info-servers-wrap">
				<h3 class="community-info-section-label">Servers</h3>
				<div class="community-info-servers-list">
					{#each relayUrls as url}
						<span class="community-info-server">{url}</span>
					{/each}
					{#each blossomUrls as url}
						<span class="community-info-server community-info-blossom">{url}</span>
					{/each}
				</div>
			</div>
			<div class="community-info-sections-wrap">
				<h3 class="community-info-section-label">Content sections</h3>
				<p class="community-info-section-desc">Each section defines who can write (profile list).</p>
				<ul class="community-info-sections-list">
					{#each communityModalSections as sec}
						<li class="community-info-section-item">
							<div class="community-info-section-icon">
								<ProfilePic
									pictureUrl={selectedCommunity.picture}
									name={sec.sectionName}
									pubkey={selectedCommunity.pubkey}
									size="sm"
								/>
							</div>
							<div class="community-info-section-text">
								<span class="community-info-section-name">{sec.sectionName}</span>
								<span class="community-info-section-write">Write access: {sec.listName}</span>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</div>
		{#if communityEditModalOpen}
			<Modal open={true} onClose={() => { communityEditModalOpen = false; communityEditTarget = null; communityEditError = ''; }} ariaLabel="Edit community" zIndex={51}>
				{#if communityEditTarget === 'picture'}
					<h2 class="join-modal-title">Edit picture</h2>
					<form class="join-form" onsubmit={(e) => { e.preventDefault(); saveCommunityEditPicture(); }}>
						<div class="join-form-field">
							<label class="labels-label" for="edit-community-picture">Picture URL</label>
							<InputTextField bind:value={communityEditPicture} placeholder="https://…" singleLine={true} id="edit-community-picture" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
						</div>
						{#if communityEditError}<p class="text-sm text-red-500">{communityEditError}</p>{/if}
						<div class="join-modal-actions">
							<button type="button" class="btn-secondary-small" onclick={() => { communityEditModalOpen = false; communityEditTarget = null; }}>Cancel</button>
							<button type="submit" class="btn-primary-small" disabled={communityEditSubmitting}>{communityEditSubmitting ? 'Saving…' : 'Save'}</button>
						</div>
					</form>
				{:else if communityEditTarget === 'name'}
					<h2 class="join-modal-title">Edit name</h2>
					<form class="join-form" onsubmit={(e) => { e.preventDefault(); saveCommunityEditName(); }}>
						<div class="join-form-field">
							<label class="labels-label" for="edit-community-name">Community name</label>
							<InputTextField bind:value={communityEditName} placeholder="Name" singleLine={true} id="edit-community-name" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
						</div>
						{#if communityEditError}<p class="text-sm text-red-500">{communityEditError}</p>{/if}
						<div class="join-modal-actions">
							<button type="button" class="btn-secondary-small" onclick={() => { communityEditModalOpen = false; communityEditTarget = null; }}>Cancel</button>
							<button type="submit" class="btn-primary-small" disabled={communityEditSubmitting}>{communityEditSubmitting ? 'Saving…' : 'Save'}</button>
						</div>
					</form>
				{:else if communityEditTarget === 'description'}
					<h2 class="join-modal-title">Edit description</h2>
					<form class="join-form" onsubmit={(e) => { e.preventDefault(); saveCommunityEditDescription(); }}>
						<div class="join-form-field">
							<label class="labels-label" for="edit-community-desc">Description</label>
							<InputTextField bind:value={communityEditDescription} placeholder="Description" singleLine={false} size="medium" id="edit-community-desc" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
						</div>
						{#if communityEditError}<p class="text-sm text-red-500">{communityEditError}</p>{/if}
						<div class="join-modal-actions">
							<button type="button" class="btn-secondary-small" onclick={() => { communityEditModalOpen = false; communityEditTarget = null; }}>Cancel</button>
							<button type="submit" class="btn-primary-small" disabled={communityEditSubmitting}>{communityEditSubmitting ? 'Saving…' : 'Save'}</button>
						</div>
					</form>
				{:else if communityEditTarget === 'relays'}
					<h2 class="join-modal-title">Edit servers</h2>
					<form class="join-form" onsubmit={(e) => { e.preventDefault(); saveCommunityEditServers(); }}>
						<div class="join-form-field">
							<label class="labels-label" for="edit-community-relays">Relays (one per line or comma-separated)</label>
							<InputTextField bind:value={communityEditRelays} placeholder="wss://…" singleLine={false} size="medium" id="edit-community-relays" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
						</div>
						<div class="join-form-field">
							<label class="labels-label" for="edit-community-blossom">Blossom servers (one per line or comma-separated)</label>
							<InputTextField bind:value={communityEditBlossom} placeholder="https://…" singleLine={false} size="medium" id="edit-community-blossom" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
						</div>
						{#if communityEditError}<p class="text-sm text-red-500">{communityEditError}</p>{/if}
						<div class="join-modal-actions">
							<button type="button" class="btn-secondary-small" onclick={() => { communityEditModalOpen = false; communityEditTarget = null; }}>Cancel</button>
							<button type="submit" class="btn-primary-small" disabled={communityEditSubmitting}>{communityEditSubmitting ? 'Saving…' : 'Save'}</button>
						</div>
					</form>
				{:else if communityEditTarget && String(communityEditTarget).startsWith('section-')}
					<h2 class="join-modal-title">Edit content section</h2>
					<form class="join-form" onsubmit={(e) => { e.preventDefault(); saveCommunityEditSection(); }}>
						<div class="join-form-field">
							<label class="labels-label" for="edit-section-name">Section name</label>
							<InputTextField bind:value={communityEditSectionName} placeholder="e.g. Forum, Chat" singleLine={true} id="edit-section-name" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
						</div>
						<div class="join-form-field">
							<label class="labels-label" for="edit-section-list">Profile list address (who can write)</label>
							<InputTextField bind:value={communityEditSectionListAddress} placeholder="30000:pubkey:d-tag" singleLine={true} id="edit-section-list" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
						</div>
						{#if communityEditError}<p class="text-sm text-red-500">{communityEditError}</p>{/if}
						<div class="join-modal-actions">
							<button type="button" class="btn-secondary-small" onclick={() => { communityEditModalOpen = false; communityEditTarget = null; }}>Cancel</button>
							<button type="submit" class="btn-primary-small" disabled={communityEditSubmitting}>{communityEditSubmitting ? 'Saving…' : 'Save'}</button>
						</div>
					</form>
				{:else if communityEditTarget === 'full'}
					<h2 class="join-modal-title">Edit community</h2>
					<div class="community-edit-full">
						<section class="community-edit-full-section">
							<h3 class="community-edit-full-section-title">Picture</h3>
							<div class="join-form-field">
								<label class="labels-label" for="edit-full-picture">Picture URL</label>
								<InputTextField bind:value={communityEditPicture} placeholder="https://…" singleLine={true} id="edit-full-picture" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
							</div>
							<button type="button" class="btn-secondary-small" onclick={() => saveCommunityEditPicture()} disabled={communityEditSubmitting}>Save picture</button>
						</section>
						<section class="community-edit-full-section">
							<h3 class="community-edit-full-section-title">Name</h3>
							<div class="join-form-field">
								<label class="labels-label" for="edit-full-name">Community name</label>
								<InputTextField bind:value={communityEditName} placeholder="Name" singleLine={true} id="edit-full-name" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
							</div>
							<button type="button" class="btn-secondary-small" onclick={() => saveCommunityEditName()} disabled={communityEditSubmitting}>Save name</button>
						</section>
						<section class="community-edit-full-section">
							<h3 class="community-edit-full-section-title">Description</h3>
							<div class="join-form-field">
								<label class="labels-label" for="edit-full-desc">Description</label>
								<InputTextField bind:value={communityEditDescription} placeholder="Description" singleLine={false} size="medium" id="edit-full-desc" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
							</div>
							<button type="button" class="btn-secondary-small" onclick={() => saveCommunityEditDescription()} disabled={communityEditSubmitting}>Save description</button>
						</section>
						<section class="community-edit-full-section">
							<h3 class="community-edit-full-section-title">Servers</h3>
							<div class="join-form-field">
								<label class="labels-label" for="edit-full-relays">Relays (one per line or comma-separated)</label>
								<InputTextField bind:value={communityEditRelays} placeholder="wss://…" singleLine={false} size="medium" id="edit-full-relays" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
							</div>
							<div class="join-form-field">
								<label class="labels-label" for="edit-full-blossom">Blossom servers</label>
								<InputTextField bind:value={communityEditBlossom} placeholder="https://…" singleLine={false} size="medium" id="edit-full-blossom" oninput={() => {}} onkeydown={() => {}} onfocus={() => {}} onblur={() => {}} />
							</div>
							<button type="button" class="btn-secondary-small" onclick={() => saveCommunityEditServers()} disabled={communityEditSubmitting}>Save servers</button>
						</section>
						<section class="community-edit-full-section">
							<h3 class="community-edit-full-section-title">Content sections</h3>
							<p class="community-edit-full-section-desc">Name + profile list (who can write) per section.</p>
							<ul class="community-edit-full-sections-list">
								{#each communityModalSections as sec, i}
									<li class="community-edit-full-section-item">
										<span class="community-edit-full-section-name">{sec.sectionName}</span>
										<span class="community-edit-full-section-list-label">{sec.listName}</span>
										<button type="button" class="btn-secondary-small" onclick={() => openCommunityEdit(`section-${i}`)}>Edit</button>
									</li>
								{/each}
							</ul>
						</section>
						{#if communityEditError}<p class="text-sm text-red-500">{communityEditError}</p>{/if}
						<div class="join-modal-actions" style="margin-top: 1rem;">
							<button type="button" class="btn-secondary-small" onclick={() => { communityEditModalOpen = false; communityEditTarget = null; communityInfoModalOpen = false; }}>Done</button>
						</div>
					</div>
				{:else}
					<p class="community-edit-placeholder">Unknown edit.</p>
				{/if}
			</Modal>
		{/if}
	{/if}
</Modal>

<Modal open={joinRequestsModalOpen} onClose={() => (joinRequestsModalOpen = false)} ariaLabel="Join requests">
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
								<p class="request-message">{joinRequestsDecrypted.get(req.id)}</p>
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
<Modal open={!!listViewMoreModal} onClose={() => { listViewMoreModal = null; listViewMoreAddInput = ''; listViewMoreAddError = ''; }} ariaLabel="List members" maxWidth="max-w-md">
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
					<button type="button" class="btn-primary-small" disabled={listViewMoreAddSubmitting || !listViewMoreAddInput.trim()} onclick={() => addProfileToList(listEvent)}>
						{listViewMoreAddSubmitting ? 'Adding…' : 'Add'}
					</button>
					<button type="button" class="list-panel-edit-btn" aria-label="Edit list" onclick={() => openListFormModal('edit', listViewMoreModal)}>Edit</button>
				</div>
				{#if listViewMoreAddError}
					<p class="text-sm text-red-500">{listViewMoreAddError}</p>
				{/if}
			{/if}
		</div>
		<ul class="list-modal-members">
			{#each members as pubkey}
				<li class="list-modal-member-row">
					<ProfilePic pubkey={pubkey} size="sm" />
					<span class="list-modal-member-pubkey">{pubkey.slice(0, 16)}…</span>
					{#if isCommunityAdmin}
						<button type="button" class="list-modal-remove-btn" onclick={() => removeProfileFromList(listEvent, pubkey)} aria-label="Remove">
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
<Modal open={!!listFormModal} onClose={() => { listFormModal = null; listFormError = ''; }} ariaLabel="List form" maxWidth="max-w-md">
	{#if listFormModal}
		<div class="list-form-modal-content">
			<h2 class="join-modal-title">{listFormModal.mode === 'edit' ? 'Edit list' : 'Add list'}</h2>
			<form class="join-form" onsubmit={(e) => { e.preventDefault(); submitListForm(); }}>
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
					<label class="labels-label" for="list-form-join">Join form (Nostr event reference)</label>
					<InputTextField
						bind:value={listFormFormAddress}
						placeholder="naddr or 30168:pubkey:d-tag (optional)"
						singleLine={true}
						id="list-form-join"
						oninput={() => {}}
						onkeydown={() => {}}
						onfocus={() => {}}
						onblur={() => {}}
					/>
				</div>
				{#if listFormError}
					<p class="text-sm text-red-500">{listFormError}</p>
				{/if}
				<div class="join-modal-actions">
					<button type="button" class="btn-secondary-small" onclick={() => { listFormModal = null; listFormError = ''; }}>Cancel</button>
					<button type="submit" class="btn-primary-small" disabled={listFormSubmitting}>{listFormSubmitting ? (listFormModal.mode === 'edit' ? 'Saving…' : 'Adding…') : (listFormModal.mode === 'edit' ? 'Save' : 'Add list')}</button>
				</div>
			</form>
		</div>
	{/if}
</Modal>
{/key}

{#key adminListPickerPresetId ?? 'closed'}
<Modal open={adminListPickerPresetId != null} onClose={() => (adminListPickerPresetId = null)} ariaLabel="Choose lists for section" maxWidth="max-w-md">
	{#if adminListPickerPresetId}
		{@const presetId = adminListPickerPresetId}
		{@const preset = ADMIN_SECTION_PRESETS.find((p) => p.id === presetId)}
		<h2 class="join-modal-title">Choose lists for {preset?.name ?? presetId}</h2>
		<p class="list-picker-desc">Who can write in this section. Select one or more profile lists.</p>
		<div class="list-picker-list">
			{#each adminProfileLists as list (list.listAddress)}
				{@const addrs = Array.isArray(adminSectionListAddress[presetId]) ? adminSectionListAddress[presetId] : (adminSectionListAddress[presetId] ? [adminSectionListAddress[presetId]] : [])}
				{@const selected = addrs.includes(list.listAddress)}
				<label class="list-picker-row">
					<Checkbox
						checked={selected}
						onChanged={(val) => {
							const arr = [...addrs];
							if (val) arr.push(list.listAddress); else { const i = arr.indexOf(list.listAddress); if (i !== -1) arr.splice(i, 1); }
							adminSectionListAddress = { ...adminSectionListAddress, [presetId]: arr };
						}}
					/>
					<span class="list-picker-name">{list.name}</span>
				</label>
			{/each}
		</div>
		{#if adminProfileLists.length === 0}
			<p class="text-sm text-muted-foreground">No profile lists yet. Create one with Add List in the Members tab.</p>
		{/if}
		<div class="join-modal-actions">
			<button type="button" class="btn-primary-small" onclick={() => (adminListPickerPresetId = null)}>Done</button>
		</div>
	{/if}
</Modal>
{/key}

{#key adminSectionModalPresetId ?? 'closed'}
<Modal open={adminSectionModalPresetId != null} onClose={() => (adminSectionModalPresetId = null)} ariaLabel="Section details" maxWidth="max-w-md">
	{#if adminSectionModalPresetId}
		{@const presetId = adminSectionModalPresetId}
		{@const preset = ADMIN_SECTION_PRESETS.find((p) => p.id === presetId)}
		<h2 class="join-modal-title">{preset?.name ?? presetId}</h2>
		{#if preset?.kinds?.length}
			<p class="admin-section-modal-kinds">Kinds that can be written: {preset.kinds.join(', ')}</p>
		{/if}
		<p class="list-picker-desc">Who can write in this section. Select one or more profile lists.</p>
		<div class="list-picker-list">
			{#each adminProfileLists as list (list.listAddress)}
				{@const addrs = Array.isArray(adminSectionListAddress[presetId]) ? adminSectionListAddress[presetId] : (adminSectionListAddress[presetId] ? [adminSectionListAddress[presetId]] : [])}
				{@const selected = addrs.includes(list.listAddress)}
				<label class="list-picker-row">
					<Checkbox
						checked={selected}
						onChanged={(val) => {
							const arr = [...addrs];
							if (val) arr.push(list.listAddress); else { const i = arr.indexOf(list.listAddress); if (i !== -1) arr.splice(i, 1); }
							adminSectionListAddress = { ...adminSectionListAddress, [presetId]: arr };
						}}
					/>
					<span class="list-picker-name">{list.name}</span>
				</label>
			{/each}
		</div>
		{#if adminProfileLists.length === 0}
			<p class="text-sm text-muted-foreground">No profile lists yet. Create one with Add List in the Members tab.</p>
		{/if}
		<div class="join-modal-actions admin-section-modal-actions">
			<button type="button" class="btn-danger-small" onclick={() => { adminSectionEnabled = { ...adminSectionEnabled, [presetId]: false }; adminSectionListAddress = { ...adminSectionListAddress, [presetId]: [] }; adminSectionModalPresetId = null; }}>Delete section</button>
			<button type="button" class="btn-primary-small" onclick={() => (adminSectionModalPresetId = null)}>Done</button>
		</div>
	{/if}
</Modal>
{/key}

{#key adminAddSectionOpen ? 'open' : 'closed'}
<Modal open={adminAddSectionOpen} onClose={() => (adminAddSectionOpen = false)} ariaLabel="Add content section" maxWidth="max-w-md">
	{#if adminAddSectionOpen}
		<h2 class="join-modal-title">Add content section</h2>
		<p class="list-picker-desc">Enable a section from presets. Only disabled sections are listed.</p>
		<div class="list-picker-list">
			{#each ADMIN_SECTION_PRESETS.filter((p) => !adminSectionEnabled[p.id]) as preset}
				<button
					type="button"
					class="admin-add-section-preset-row"
					onclick={() => { adminSectionEnabled = { ...adminSectionEnabled, [preset.id]: true }; adminAddSectionOpen = false; }}
				>
					<span>{preset.name}</span>
				</button>
			{/each}
		</div>
		{#if ADMIN_SECTION_PRESETS.every((p) => adminSectionEnabled[p.id])}
			<p class="text-sm text-muted-foreground">All preset sections are already enabled.</p>
		{/if}
		<div class="join-modal-actions">
			<button type="button" class="btn-secondary-small" onclick={() => (adminAddSectionOpen = false)}>Cancel</button>
		</div>
	{/if}
</Modal>
{/key}

<ForumPostModal
	bind:isOpen={addPostModalOpen}
	communityName={selectedCommunity?.name ?? ''}
	getCurrentPubkey={getCurrentPubkey}
	onsubmit={handleForumPostSubmit}
	onclose={closeCreatePost}
/>

{#key joinModalOpen ? 'open' : 'closed'}
<Modal open={joinModalOpen} onClose={closeJoinModal} ariaLabel="Join community">
	{#if joinModalOpen}
		<h2 class="join-modal-title">Join</h2>
		{#if !currentPubkey}
			<p class="text-sm text-muted-foreground">Add a profile to request access.</p>
			<div class="join-modal-actions">
				<button type="button" class="btn-secondary-small" onclick={closeJoinModal}>Close</button>
			</div>
		{:else if joinStep === 'list'}
			<p class="text-sm text-muted-foreground">Choose a list to request access to:</p>
			{#if joinableLists.length === 0}
				<p class="text-sm text-muted-foreground">Loading…</p>
				<p class="text-xs text-muted-foreground">If nothing appears, you may already be in all lists with join forms.</p>
			{:else}
				<ul class="join-list-options">
					{#each joinableLists as item}
						<li>
							<button
								type="button"
								class="btn-secondary-large btn-secondary-modal join-list-btn"
								onclick={() => { selectedJoinList = item; joinFetched = false; joinStep = 'form'; }}
							>
								{item.listName}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="join-modal-actions">
				<button type="button" class="btn-secondary-small" onclick={closeJoinModal}>Cancel</button>
			</div>
		{:else if joinStep === 'form'}
			{#if joinError && !joinFormTemplate}
				<p class="text-sm text-red-500">{joinError}</p>
				<button type="button" class="btn-secondary-small" onclick={() => { joinStep = 'list'; selectedJoinList = null; }}>Back</button>
			{:else if joinFormTemplate === null && !joinError}
				<p class="text-sm text-muted-foreground">Loading form…</p>
				<button type="button" class="btn-secondary-small" onclick={() => { joinStep = 'list'; selectedJoinList = null; }}>Cancel</button>
			{:else}
				{@const form = joinFormTemplate ? parseFormTemplate(joinFormTemplate) : null}
				{#if form?.name}
					<p class="text-sm text-muted-foreground">{form.name}</p>
				{/if}
				<form class="join-form" onsubmit={(e) => { e.preventDefault(); submitJoinForm(); }}>
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
					{#if joinError}
						<p class="text-sm text-red-500">{joinError}</p>
					{/if}
					<div class="join-modal-actions">
						<button type="button" class="btn-secondary-small" onclick={() => { joinStep = 'list'; selectedJoinList = null; joinError = ''; }} disabled={joinSubmitting}>Back</button>
						<button type="submit" class="btn-primary-small" disabled={joinSubmitting}>
							{joinSubmitting ? 'Submitting…' : 'Submit request'}
						</button>
					</div>
				</form>
			{/if}
		{/if}
	{/if}
</Modal>
{/key}
		</div>
	</div>
</main>

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
	.chateau-icon-link {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 32px;
		height: 32px;
	}
	.chateau-icon {
		width: 28px;
		height: 36px;
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
	.community-card {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px 16px;
		border: none;
		border-radius: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.community-card.selected {
		margin-left: 16px;
		margin-right: 16px;
		width: calc(100% - 32px);
		box-sizing: border-box;
		padding: 8px 12px 8px 8px;
		border-radius: 12px;
		background: hsl(var(--white4));
	}
	.community-card-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.community-card-row1 {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 20px;
	}
	.community-name {
		font-size: 0.875rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: hsl(var(--foreground));
	}
	.community-time {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}
	.community-card-row2 {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 26px;
	}
	.content-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 26px;
		padding: 0 8px;
		background: hsl(var(--gray66));
		border-radius: var(--radius-16);
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}
	.content-emoji-img {
		width: 14px;
		height: 14px;
		object-fit: contain;
		flex-shrink: 0;
	}
	.content-count {
		font-weight: 500;
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
	.detail-header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid hsl(var(--white11));
		flex-shrink: 0;
	}
	.detail-publisher {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}
	.detail-meta {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-width: 0;
	}
	.detail-name {
		font-weight: 600;
		font-size: 0.9375rem;
	}
	.detail-communities {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}
	.back-to-list {
		flex-shrink: 0;
		padding: 0.35rem 0.5rem;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		background: none;
		border: none;
		cursor: pointer;
		border-radius: 6px;
	}
	.back-to-list:hover {
		background: hsl(var(--white8));
		color: hsl(var(--foreground));
	}
	.post-detail-content {
		padding: 1rem 1.5rem;
	}
	.post-detail-title {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 0.75rem;
	}
	.post-detail-body {
		font-size: 0.9375rem;
		line-height: 1.6;
	}
	.post-detail-description-wrap {
		position: relative;
		margin-bottom: 1rem;
	}
	.post-detail-description-wrap:not(.expanded) .post-detail-body {
		max-height: 150px;
		overflow: hidden;
	}
	.post-detail-description-wrap.expanded .post-detail-body {
		max-height: none;
	}
	.post-detail-fade {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 80px;
		background: linear-gradient(to bottom, transparent, hsl(var(--gray66)));
		pointer-events: none;
	}
	.read-more-btn {
		margin-top: 0.5rem;
		padding: 0.35rem 0.75rem;
		font-size: 0.875rem;
		background: hsl(var(--white8));
		border: 1px solid hsl(var(--white16));
		border-radius: 9999px;
		color: hsl(var(--foreground));
		cursor: pointer;
	}
	.read-more-btn:hover {
		background: hsl(var(--white11));
	}
	.post-detail-labels {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 1rem;
		overflow-x: auto;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}
	.post-detail-labels::-webkit-scrollbar {
		display: none;
	}
	.post-detail-label-slot {
		display: inline-flex;
		flex-shrink: 0;
	}
	.post-detail-social {
		margin-top: 1rem;
		border-top: 1px solid hsl(var(--white11));
		padding-top: 1rem;
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
	.tab-row.pills-row-under {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		padding: 12px 0 0;
		border: none;
	}
	.tab-row.pills-row-under :global(.btn-primary-small),
	.tab-row.pills-row-under :global(.btn-secondary-small) {
		height: 32px;
		min-height: 32px;
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
	.community-info-modal {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 1.25rem;
		text-align: left;
	}
	.community-info-edit-btn {
		position: absolute;
		top: 0;
		right: 0;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		background: hsl(var(--white8));
		border: 1px solid hsl(var(--white11));
		border-radius: 8px;
		cursor: pointer;
	}
	.community-info-edit-btn:hover {
		background: hsl(var(--white11));
		color: hsl(var(--foreground));
	}
	.community-info-row-tap {
		display: flex;
		align-items: center;
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
	.community-info-pen {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 8px;
		background: hsl(var(--white16));
		cursor: pointer;
		color: hsl(var(--white33));
	}
	.community-info-pic-wrap .community-info-pen {
		align-self: flex-start;
		margin-top: 0.25rem;
	}
	.community-info-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.community-info-title-row .community-info-title {
		margin: 0;
		flex: 1;
	}
	.community-info-title {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
		color: hsl(var(--foreground));
	}
	.community-info-desc-wrap {
		position: relative;
	}
	.community-info-description {
		font-size: 0.9375rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground));
		margin: 0;
		padding-right: 32px;
	}
	.community-info-servers-wrap {
		position: relative;
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
		padding-right: 32px;
	}
	.community-info-blossom {
		opacity: 0.85;
	}
	.community-info-sections-wrap {
		margin-top: 0.25rem;
	}
	.community-info-section-desc {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		margin: 0 0 0.5rem;
	}
	.community-info-section-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
	.community-info-section-write {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}
	.community-info-sections-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.community-info-section-item {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.community-info-section-icon {
		flex-shrink: 0;
	}
	.community-info-section-name {
		font-size: 0.9375rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
	.admin-tab {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem 0;
		padding-bottom: 100px;
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
	.admin-sections-title {
		margin: 1.25rem 0 0.5rem;
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}
	.admin-sections-desc {
		margin: 0 0 0.75rem;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
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
		transition: background 0.15s ease, border-color 0.15s ease;
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
	.admin-section-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		font-weight: 500;
		color: hsl(var(--foreground));
	}
	.admin-section-toggle input {
		width: 18px;
		height: 18px;
		accent-color: hsl(var(--blurpleColor));
	}
	.admin-section-name {
		flex-shrink: 0;
	}
	.admin-section-desc-inline {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		margin-left: 26px;
	}
	.admin-section-input {
		width: 100%;
		min-height: 38px;
		padding: 0 14px;
		font-size: 14px;
		background: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white16));
		border-radius: var(--radius-16, 16px);
		color: hsl(var(--foreground));
	}
	.admin-section-input::placeholder {
		color: hsl(var(--white33));
	}
	.admin-section-select {
		cursor: pointer;
		appearance: auto;
	}
	.members-tab {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.members-join-requests-panel {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 1rem 1.25rem;
		background: hsl(var(--white11));
		border: 0.33px solid hsl(var(--white16));
		border-radius: var(--radius-16);
		cursor: pointer;
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
		text-align: left;
	}
	.members-join-requests-panel:hover {
		background: hsl(var(--white16));
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
	.members-list-panel {
		padding: 1rem 1.25rem;
		background: hsl(var(--gray33));
		border: none;
		border-radius: var(--radius-16);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.members-list-panel-top {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.members-list-name {
		font-weight: 600;
		font-size: 0.9375rem;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.members-list-count {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}
	.members-list-desc,
	.members-list-sections {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}
	.members-list-profiles-vertical {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.members-list-profile-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.members-list-profile-name {
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.list-panel-edit-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.6rem;
		background: hsl(var(--white16));
		border: none;
		border-radius: var(--radius-12);
		color: hsl(var(--foreground));
		font-size: 0.8125rem;
		cursor: pointer;
	}
	.list-panel-edit-btn:hover {
		background: hsl(var(--white24));
	}
	.members-list-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}
	.btn-view-more {
		padding: 0.35rem 0.6rem;
		font-size: 0.8125rem;
		background: hsl(var(--white4));
		border: none;
		border-radius: var(--radius-16);
		color: hsl(var(--foreground));
		cursor: pointer;
	}
	.btn-view-more:hover {
		background: hsl(var(--white8));
	}
	.btn-join-list {
		padding: 0.35rem 0.75rem;
		font-size: 0.8125rem;
		background: linear-gradient(135deg, hsl(var(--blurple66-start)), hsl(var(--blurple66-end)));
		border: none;
		border-radius: var(--radius-16);
		color: white;
		cursor: pointer;
		font-weight: 500;
	}
	.btn-join-list:hover {
		opacity: 0.95;
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
	.list-modal-edit-form-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.6rem 1rem;
		margin-bottom: 0.75rem;
		background: hsl(var(--white16));
		border: 0.33px solid hsl(var(--white24));
		border-radius: var(--radius-16);
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		cursor: pointer;
	}
	.list-modal-edit-form-btn:hover {
		background: hsl(var(--white24));
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
	.labels-label {
		display: block;
		margin-bottom: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}
	.labels-row {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-bottom: 8px;
	}
	.labels-input {
		flex: 1;
		min-width: 0;
		height: 36px;
		padding: 0 12px;
		border-radius: var(--radius-12);
		border: 1px solid hsl(var(--white16));
		background: hsl(var(--white4));
		color: hsl(var(--foreground));
		font-size: 14px;
	}
	.labels-input::placeholder {
		color: hsl(var(--white44));
	}
	.labels-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.label-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: var(--radius-12);
		background: hsl(var(--white8));
		color: hsl(var(--foreground));
		font-size: 13px;
	}
	.label-chip-remove {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		color: hsl(var(--white66));
	}
	.label-chip-remove:hover {
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
		padding: 1rem 1.5rem;
		/* Space for fixed bottom bar */
		padding-bottom: 100px;
	}
	.panel-content:has(.forum-list) {
		padding: 0;
	}
	/* No top padding: title sits 16px below fixed header via ForumPostDetail .content-scroll padding-top */
	.panel-content-detail {
		padding: 0 16px 100px;
	}
	.forum-list {
		display: flex;
		flex-direction: column;
		padding: 0;
		gap: 0;
	}
	.join-modal-title {
		margin: 0 0 0.5rem;
		font-size: 1.25rem;
		font-weight: 600;
	}
	.join-list-options {
		list-style: none;
		padding: 0;
		margin: 0.75rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.join-list-options li {
		margin: 0;
	}
	.join-list-btn {
		width: 100%;
		justify-content: center;
	}
	.join-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.5rem;
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
	.admin-section-choose-lists {
		width: 100%;
		min-height: 38px;
		padding: 0 14px;
		font-size: 14px;
		text-align: left;
		background: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white16));
		border-radius: var(--radius-16);
		color: hsl(var(--foreground));
		cursor: pointer;
	}
	.admin-section-choose-lists:hover {
		background: hsl(var(--white16));
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
			grid-template-rows: auto minmax(0, 1fr);
		}
		.left-column {
			border-right: none;
			border-bottom: 1px solid hsl(var(--white11));
			max-height: 40vh;
			min-height: 120px;
			overflow-y: auto;
		}
		.right-column {
			min-height: 0;
		}
	}
</style>

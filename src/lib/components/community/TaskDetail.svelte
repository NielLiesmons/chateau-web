<script lang="js">
	// @ts-nocheck
	import { nip19 } from 'nostr-tools';
	import {
		queryEvent,
		queryEvents,
		liveQuery,
		fetchForumPostComments,
		fetchZapsByEventIds,
		parseProfile,
		parseComment,
		parseZapReceipt,
		publishComment,
		fetchProfilesBatch,
		parseCommunity,
		fetchFromRelays,
		putEvents,
		publishToRelays,
		fetchEventsNoStore,
		fetchProfileListFromRelays,
		parseProfileList
	} from '$lib/nostr';
	import { EVENT_KINDS, DEFAULT_COMMUNITY_RELAYS, DEFAULT_SOCIAL_RELAYS } from '$lib/config';
	import { tokenizeNostrMarkdown } from '$lib/utils/markdown';
	import MarkdownBody from '$lib/components/common/MarkdownBody.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import DetailHeader from '$lib/components/layout/DetailHeader.svelte';
	import SocialTabs from '$lib/components/social/SocialTabs.svelte';
	import BottomBar from '$lib/components/social/BottomBar.svelte';
	import TaskBox from '$lib/components/common/TaskBox.svelte';
	import PriorityBox from '$lib/components/common/PriorityBox.svelte';
	import ProfilePicStack from '$lib/components/common/ProfilePicStack.svelte';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import TaskModal from '$lib/components/modals/TaskModal.svelte';
	import { Pen } from '$lib/components/icons';
	import { ChevronDown } from '$lib/components/icons';
	import { getCurrentPubkey, getIsSignedIn, signEvent } from '$lib/stores/auth.svelte.js';
	import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
	import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { goto } from '$app/navigation';

	let {
		eventId = '',
		communityNpub = '',
		event: preloadedEvent = null,
		profiles: preloadedProfiles = null,
		onBack = () => {},
		isMember = true,
		onJoinRequired = () => {}
	} = $props();

	let statusMenuOpen = $state(false);
	let priorityMenuOpen = $state(false);
	let editModalOpen = $state(false);
	let panelOverflows = $state(false);

	/** Svelte action: watches the element and sets panelOverflows when scrollWidth > clientWidth */
	function observeOverflow(node) {
		const check = () => {
			panelOverflows = node.scrollWidth > node.clientWidth;
		};
		check();
		const ro = new ResizeObserver(check);
		ro.observe(node);
		// Also re-check on any content mutation (e.g. profiles loading in)
		const mo = new MutationObserver(check);
		mo.observe(node, { childList: true, subtree: true });
		return {
			destroy() {
				ro.disconnect();
				mo.disconnect();
			}
		};
	}
	let statusMenuPos = $state({ top: 0, left: 0 });
	let priorityMenuPos = $state({ top: 0, left: 0 });

	/** @type {Array<{ value: 'backlog'|'open'|'inProgress'|'inReview'|'closed'|'canceled', label: string }>} */
	const STATUS_OPTIONS = [
		{ value: 'backlog', label: 'Backlog' },
		{ value: 'open', label: 'Open' },
		{ value: 'inProgress', label: 'In Progress' },
		{ value: 'inReview', label: 'In Review' },
		{ value: 'closed', label: 'Closed' },
		{ value: 'canceled', label: 'Canceled' }
	];

	/** @type {Array<{ value: 'none'|'low'|'medium'|'high'|'urgent', label: string }>} */
	const PRIORITY_OPTIONS = [
		{ value: 'none', label: 'No priority' },
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' },
		{ value: 'urgent', label: 'Urgent' }
	];

	/** @type {Record<string, string>} */
	const CAMEL_TO_SPEC = {
		open: 'open',
		backlog: 'backlog',
		inProgress: 'in-progress',
		inReview: 'in-review',
		closed: 'closed',
		canceled: 'canceled'
	};

	/** @type {any} */
	let task = $state(preloadedEvent ?? null);
	/** @type {any} */
	let rawTaskEvent = $state(preloadedEvent ?? null);
	let communityAuthorPubkey = $state('');

	// Initialize from preloaded profiles synchronously so the header renders on frame 0.
	const _authorEv =
		preloadedEvent && preloadedProfiles ? preloadedProfiles.get(preloadedEvent.pubkey) : null;
	const _commEv = (() => {
		if (!communityNpub || !preloadedProfiles) return null;
		try {
			const d = nip19.decode(communityNpub);
			return preloadedProfiles.get(d.data) ?? null;
		} catch {
			return null;
		}
	})();
	const _commContent = (() => {
		try {
			return _commEv ? JSON.parse(_commEv.content || '{}') : null;
		} catch {
			return null;
		}
	})();

	/** @type {any} */
	let authorProfile = $state(_authorEv ? parseProfile(_authorEv) : null);
	/** @type {any} */
	let statusEvent = $state(null);
	let communityName = $state(_commContent?.display_name ?? _commContent?.name ?? '');
	let communityPicture = $state(_commContent?.picture ?? _commContent?.image ?? '');
	let descriptionExpanded = $state(false);
	let isTruncated = $state(false);
	let comments = $state(/** @type {any[]} */ ([]));
	let commentsLoading = $state(false);
	let commentsError = $state('');
	let zaps = $state(/** @type {any[]} */ ([]));
	let zapsLoading = $state(false);
	let profiles = $state(/** @type {Record<string, any>} */ ({}));
	let zapperProfiles = $state(new Map());
	let getStartedModalOpen = $state(false);
	/** @type {any} */
	let communityDef = $state(null);
	/** undefined = loading, null = no filter (enforced relay), string[] = allowed pubkeys */
	let allowedCommenters = $state(/** @type {string[] | null | undefined} */ (undefined));
	/** @type {{ pubkey: string; name?: string; pictureUrl?: string }[]} */
	let assigneeProfiles = $state([]);

	const communityRelays = $derived(
		communityDef?.relays?.length ? communityDef.relays : DEFAULT_COMMUNITY_RELAYS
	);

	/** @type {Record<string,string>} */
	const SPEC_TO_CAMEL = {
		open: 'open',
		backlog: 'backlog',
		'in-progress': 'inProgress',
		'in-review': 'inReview',
		closed: 'closed',
		canceled: 'canceled'
	};

	const taskStatus = $derived(
		(() => {
			if (!statusEvent) return 'open';
			const spec = statusEvent.tags?.find((t) => t[0] === 'status')?.[1] ?? 'open';
			return SPEC_TO_CAMEL[spec] ?? 'open';
		})()
	);

	const taskPriority = $derived(statusEvent?.tags?.find((t) => t[0] === 'priority')?.[1] ?? 'none');

	const taskTitle = $derived(task?.tags?.find((t) => t[0] === 'title')?.[1] ?? '');
	const taskLabels = $derived(task?.tags?.filter((t) => t[0] === 't').map((t) => t[1]) ?? []);

	// Labels formatted for the SocialTabs Labels tab (same shape as forum post labelEntries)
	const taskLabelEntries = $derived(
		taskLabels.map((l) => ({ label: l, pubkeys: task?.pubkey ? [task.pubkey] : [] }))
	);

	/** @type {Record<string, string>} */
	const STATUS_LABELS = {
		open: 'Open',
		backlog: 'Backlog',
		inProgress: 'In Progress',
		inReview: 'In Review',
		closed: 'Closed',
		canceled: 'Canceled'
	};
	/** @type {Record<string, string>} */
	const PRIORITY_LABELS = {
		none: 'No priority',
		low: 'Low',
		medium: 'Medium',
		high: 'High',
		urgent: 'Urgent'
	};

	const statusDisplayLabel = $derived(STATUS_LABELS[taskStatus] ?? 'Open');
	const priorityDisplayLabel = $derived(PRIORITY_LABELS[taskPriority] ?? taskPriority);

	// Project (kind 30315) and milestone (kind 30316) from `a` tags
	const projectRef = $derived(
		task?.tags?.find((t) => t[0] === 'a' && t[1]?.startsWith('30315:'))?.[1] ?? null
	);
	const milestoneRef = $derived(
		task?.tags?.find((t) => t[0] === 'a' && t[1]?.startsWith('30316:'))?.[1] ?? null
	);
	// Human label: take the d-tag segment (after second colon) and replace hyphens with spaces
	/** @param {string} addr */
	function addrLabel(addr) {
		const parts = addr.split(':');
		return parts.length >= 3 ? parts.slice(2).join(':').replace(/-/g, ' ') : addr.slice(0, 12);
	}

	// Other targets: first two `e` or `a` tags that are NOT project/milestone
	const taskTargetRefs = $derived(
		(() => {
			if (!task?.tags) return [];
			/** @type {{type: string, label: string}[]} */
			const out = [];
			for (const t of task.tags) {
				if (out.length >= 2) break;
				if (t[0] === 'e' && t[1]) {
					out.push({ type: 'event', label: t[1].slice(0, 10) + '…' });
				} else if (
					t[0] === 'a' &&
					t[1] &&
					!t[1].startsWith('30315:') &&
					!t[1].startsWith('30316:')
				) {
					out.push({ type: 'addr', label: addrLabel(t[1]) });
				}
			}
			return out;
		})()
	);

	$effect(() => {
		if (!communityNpub || !eventId) {
			task = null;
			authorProfile = null;
			return;
		}
		let communityPubkey = '';
		try {
			const decoded = nip19.decode(communityNpub);
			if (decoded.type === 'npub') communityPubkey = decoded.data;
		} catch {
			return;
		}
		communityAuthorPubkey = communityPubkey;

		(async () => {
			// Fast path: event was handed off from the list — skip Dexie fetch.
			const raw =
				preloadedEvent ??
				(await queryEvent({ kinds: [EVENT_KINDS.TASK], ids: [eventId] })) ??
				(await queryEvent({ kinds: [EVENT_KINDS.TASK], '#h': [communityPubkey] }));

			if (raw && raw.id === eventId) {
				rawTaskEvent = raw;
				task = raw;

				// Load status event — check Dexie first (fast path)
				const dTag = raw.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				const addr = `${EVENT_KINDS.TASK}:${raw.pubkey}:${dTag}`;
				const statusEvs = await queryEvents({
					kinds: [EVENT_KINDS.STATUS],
					'#a': [addr],
					limit: 50
				});
				if (statusEvs.length > 0) {
					statusEvent = statusEvs.reduce((a, b) => (b.created_at > a.created_at ? b : a));
				}

				// Load author + community info in parallel — must happen BEFORE the relay
				// status fetch so communityDef.relays is available and we query the right relay.
				const [profileEv, communityEv, communityProfileEv] = await Promise.all([
					queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [raw.pubkey], limit: 1 }),
					queryEvent({ kinds: [EVENT_KINDS.COMMUNITY], authors: [communityPubkey], limit: 1 }),
					queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [communityPubkey], limit: 1 })
				]);
				authorProfile = profileEv ? parseProfile(profileEv) : null;
				if (communityEv) communityDef = parseCommunity(communityEv);

				// Now fetch status from relays using the correct community relays
				const relaysForStatus = communityDef?.relays?.length
					? communityDef.relays
					: DEFAULT_COMMUNITY_RELAYS;
				fetchFromRelays(relaysForStatus, { kinds: [EVENT_KINDS.STATUS], '#a': [addr], limit: 50 })
					.then(async (relayEvs) => {
						if (!relayEvs.length) return;
						await putEvents(relayEvs);
						const best = relayEvs.reduce((a, b) => (b.created_at > a.created_at ? b : a));
						if (!statusEvent || best.created_at > statusEvent.created_at) {
							statusEvent = best;
						}
					})
					.catch(() => {});

				if (communityEv?.content) {
					try {
						const c = JSON.parse(communityEv.content);
						communityName = c.name ?? c.display_name ?? '';
						communityPicture = c.image ?? c.picture ?? c.icon ?? '';
					} catch {}
				}
				if ((!communityName || !communityPicture) && communityProfileEv?.content) {
					try {
						const c = JSON.parse(communityProfileEv.content);
						if (!communityName) communityName = c.display_name ?? c.name ?? 'Community';
						if (!communityPicture) communityPicture = c.picture ?? c.image ?? '';
					} catch {}
				}

				// Load assignee profiles
				const assigneePubkeys =
					raw.tags?.filter((t) => t[0] === 'p' && t[2] === 'assignee').map((t) => t[1]) ?? [];
				if (assigneePubkeys.length > 0) {
					const batch = await fetchProfilesBatch(assigneePubkeys);
					assigneeProfiles = assigneePubkeys.map((pk) => {
						const ev = batch.get(pk);
						const c = ev?.content
							? (() => {
									try {
										return JSON.parse(ev.content);
									} catch {
										return {};
									}
								})()
							: {};
						return { pubkey: pk, name: c.display_name ?? c.name, pictureUrl: c.picture };
					});
				}
			} else {
				task = null;
				rawTaskEvent = null;
				authorProfile = null;
			}
		})();
	});

	// Resolve allowed commenters (General section profile list). Same logic as ForumPostDetail.
	$effect(() => {
		const def = communityDef;
		if (!def) {
			allowedCommenters = undefined;
			return;
		}
		if (def.mainRelayEnforced) {
			allowedCommenters = null;
			return;
		}
		const relays = def.relays?.length ? def.relays : DEFAULT_COMMUNITY_RELAYS;
		const generalSection = def.sections?.find((s) => s.name === 'General');
		if (!generalSection?.profileListAddress) {
			allowedCommenters = null;
			return;
		}
		const parts = generalSection.profileListAddress.split(':');
		const listPubkey = parts[1];
		const listDTag = parts.slice(2).join(':');
		allowedCommenters = undefined;
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
			allowedCommenters = list?.members?.length ? list.members : null;
		})();
		return () => {
			cancelled = true;
		};
	});

	// Plain vars for non-member parent fetching (same pattern as ForumPostDetail).
	let _taskLastParsedAllowed = /** @type {any[]} */ ([]);
	let _taskPostIdRef = '';
	let _taskNonMemberById =
		/** @type {Map<string, {loading?: boolean, comment?: any, notFound?: boolean}>} */ (new Map());

	function _taskRefreshComments(parsedAllowed) {
		const nonMemberEntries = [];
		for (const [, state] of _taskNonMemberById) {
			if (state.comment) nonMemberEntries.push(state.comment);
		}
		const combined = [...parsedAllowed, ...nonMemberEntries];
		const combinedIdSet = new Set(combined.map((c) => c.id));
		for (const c of combined) {
			if (
				c.parentId &&
				c.parentId !== _taskPostIdRef &&
				!combinedIdSet.has(c.parentId) &&
				!_taskNonMemberById.has(c.parentId)
			) {
				_taskNonMemberById.set(c.parentId, { loading: true });
				_taskFetchNonMemberParent(c.parentId);
			}
		}
		let displayable = combined;
		let changed = true;
		while (changed) {
			const displayIds = new Set(displayable.map((c) => c.id));
			const next = displayable.filter(
				(c) => !c.parentId || c.parentId === _taskPostIdRef || displayIds.has(c.parentId)
			);
			changed = next.length !== displayable.length;
			displayable = next;
		}
		comments = displayable;
	}

	async function _taskFetchNonMemberParent(id) {
		try {
			const events = await fetchEventsNoStore(
				DEFAULT_SOCIAL_RELAYS,
				[{ ids: [id], kinds: [1111], limit: 1 }],
				{ timeout: 3000 }
			);
			const event = events[0] ?? null;
			if (event) {
				const p = parseComment(event);
				p.npub = nip19.npubEncode(event.pubkey);
				p.nonMember = true;
				_taskNonMemberById.set(id, { comment: p });
				fetchProfilesBatch([event.pubkey])
					.then((batch) => {
						const ev = batch.get(event.pubkey);
						if (ev?.content) {
							try {
								const c = JSON.parse(ev.content);
								profiles = {
									...profiles,
									[event.pubkey]: {
										displayName: c.display_name ?? c.name,
										name: c.name,
										picture: c.picture
									}
								};
							} catch {}
						}
					})
					.catch(() => {});
			} else {
				_taskNonMemberById.set(id, { notFound: true });
			}
		} catch {
			_taskNonMemberById.set(id, { notFound: true });
		}
		_taskRefreshComments(_taskLastParsedAllowed);
	}

	// Comments (NIP-1111 kind:1111) — live from Dexie + backfill from relays, with membership filtering
	$effect(() => {
		const tid = task?.id;
		const dTag = task?.tags?.find((/** @type {string[]} */ t) => t[0] === 'd')?.[1] ?? '';
		const taskAddr = task?.pubkey ? `${EVENT_KINDS.TASK}:${task.pubkey}:${dTag}` : '';
		const relays = communityRelays;
		const allowed = allowedCommenters;
		if (!tid) {
			comments = [];
			_taskLastParsedAllowed = [];
			_taskPostIdRef = '';
			_taskNonMemberById = new Map();
			return;
		}
		if (allowed === undefined) {
			commentsLoading = true;
			return;
		}
		commentsLoading = true;
		_taskPostIdRef = tid;
		_taskNonMemberById = new Map();
		_taskLastParsedAllowed = [];
		const allowedSet = allowed ? new Set(allowed) : null;

		const sub = liveQuery(async () => {
			// Query by event id (lowercase e), uppercase E, addressable a (lowercase), and A (uppercase)
			const [byE, bye, byA, bya] = await Promise.all([
				queryEvents({ kinds: [1111], '#E': [tid], limit: 500 }),
				queryEvents({ kinds: [1111], '#e': [tid], limit: 500 }),
				taskAddr
					? queryEvents({ kinds: [1111], '#A': [taskAddr], limit: 500 })
					: Promise.resolve([]),
				taskAddr
					? queryEvents({ kinds: [1111], '#a': [taskAddr], limit: 500 })
					: Promise.resolve([])
			]);
			const byId = new Map();
			for (const e of [...byE, ...bye, ...byA, ...bya]) if (!byId.has(e.id)) byId.set(e.id, e);
			return Array.from(byId.values()).sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
		}).subscribe({
			next: (events) => {
				let filtered = events ?? [];
				if (allowedSet) filtered = filtered.filter((e) => allowedSet.has(e.pubkey));
				const parsedAllowed = filtered.map((e) => {
					const p = parseComment(e);
					p.npub = nip19.npubEncode(e.pubkey);
					return p;
				});
				_taskLastParsedAllowed = parsedAllowed;
				commentsLoading = false;
				commentsError = '';
				_taskRefreshComments(parsedAllowed);
				const pubkeys = [...new Set(parsedAllowed.map((c) => c.pubkey).filter(Boolean))];
				if (pubkeys.length > 0) {
					fetchProfilesBatch(pubkeys).then((batch) => {
						const next = { ...profiles };
						for (const pk of pubkeys) {
							const ev = batch.get(pk);
							if (ev?.content) {
								try {
									const c = JSON.parse(ev.content);
									next[pk] = {
										displayName: c.display_name ?? c.name,
										name: c.name,
										picture: c.picture
									};
								} catch {}
							}
						}
						profiles = next;
					});
				}
			},
			error: () => {
				commentsLoading = false;
				commentsError = 'Failed to load comments';
			}
		});
		// Fetch from relays by event id (#e/#E) + by address (#A for addressable root)
		fetchForumPostComments(tid, { relays, authors: allowed })
			.then(() => {})
			.catch(() => {});
		if (taskAddr) {
			fetchFromRelays(relays, {
				kinds: [1111],
				'#A': [taskAddr],
				limit: 500,
				...(allowed?.length ? { authors: allowed } : {})
			})
				.then(async (evs) => {
					if (evs.length) await putEvents(evs);
				})
				.catch(() => {});
		}
		return () => sub.unsubscribe();
	});

	// Zaps
	$effect(() => {
		const relays = communityRelays;
		if (!task?.id) return;
		(async () => {
			zapsLoading = true;
			try {
				const events = await fetchZapsByEventIds([task.id], { relays });
				zaps = events.map((e) => {
					const z = parseZapReceipt(e);
					z.id = e.id;
					return z;
				});
				const senders = [...new Set(zaps.map((z) => z.senderPubkey).filter(Boolean))];
				const next = new Map(zapperProfiles);
				for (const pk of senders) {
					const ev = await queryEvent({ kinds: [0], authors: [pk], limit: 1 });
					if (ev?.content) {
						try {
							const c = JSON.parse(ev.content);
							next.set(pk, {
								displayName: c.display_name ?? c.name,
								name: c.name,
								picture: c.picture
							});
						} catch {}
					}
				}
				zapperProfiles = next;
			} catch (err) {
				console.error('Failed to load zaps', err);
			} finally {
				zapsLoading = false;
			}
		})();
	});

	/** @param {HTMLElement} node */
	function checkTruncation(node) {
		const check = () => {
			isTruncated = node.scrollHeight > node.clientHeight;
		};
		setTimeout(check, 0);
		const ro = new ResizeObserver(() => {
			if (!descriptionExpanded) check();
		});
		ro.observe(node);
		return {
			destroy() {
				ro.disconnect();
			}
		};
	}

	const taskEmojiMap = $derived(
		Object.fromEntries(
			(rawTaskEvent?.tags ?? [])
				.filter((t) => t[0] === 'emoji' && t[1] && t[2])
				.map((t) => [t[1], t[2]])
		)
	);
	const descriptionTokens = $derived(
		task?.content ? tokenizeNostrMarkdown(task.content, { emojiMap: taskEmojiMap }) : []
	);

	const npub = $derived(
		task?.pubkey
			? (() => {
					try {
						return nip19.npubEncode(task.pubkey);
					} catch {
						return '';
					}
				})()
			: ''
	);

	const taskNaddr = $derived(
		(() => {
			if (!task) return '';
			const dTag = task.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
			try {
				return nip19.naddrEncode({ kind: EVENT_KINDS.TASK, pubkey: task.pubkey, identifier: dTag });
			} catch {
				return '';
			}
		})()
	);

	const zapTarget = $derived(
		task
			? { name: taskTitle, pubkey: task.pubkey, id: task.id, pictureUrl: authorProfile?.picture }
			: null
	);

	const publisherName = $derived(authorProfile?.displayName ?? authorProfile?.name ?? 'Author');
	const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
	const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));

	const isOwnTask = $derived(
		!!task?.pubkey && !!getCurrentPubkey() && task.pubkey === getCurrentPubkey()
	);

	// Authorized to post status events: task author, assignees, or community owner
	const isAuthorizedForStatus = $derived(
		getIsSignedIn() &&
			!!getCurrentPubkey() &&
			!!(
				task?.pubkey === getCurrentPubkey() ||
				assigneeProfiles.some((p) => p.pubkey === getCurrentPubkey()) ||
				communityDef?.pubkey === getCurrentPubkey() ||
				communityPubkeyFromNpub === getCurrentPubkey()
			)
	);

	const editInitialData = $derived(
		task
			? {
					title: taskTitle,
					dTag: task.tags?.find((/** @type {string[]} */ t) => t[0] === 'd')?.[1] ?? '',
					status: taskStatus,
					priority: taskPriority,
					text: task.content ?? '',
					labels: taskLabels,
					assigneeProfiles
				}
			: null
	);

	const communityPubkeyFromNpub = $derived(
		(() => {
			try {
				const d = nip19.decode(communityNpub);
				return d?.type === 'npub' ? d.data : '';
			} catch {
				return '';
			}
		})()
	);

	const catalogs = $derived(
		communityPubkeyFromNpub
			? [
					{
						name: communityName || 'Community',
						pictureUrl: communityPicture || undefined,
						pubkey: communityPubkeyFromNpub
					}
				]
			: []
	);

	/**
	 * When position:fixed is used inside a CSS-transformed ancestor (e.g. translateZ(0)),
	 * the fixed element is positioned relative to that ancestor, not the viewport.
	 * This helper computes coordinates that work correctly in both cases.
	 * @param {HTMLElement} btn
	 * @returns {{ top: number, left: number }}
	 */
	function getMenuPos(btn) {
		const btnRect = btn.getBoundingClientRect();
		let el = btn.parentElement;
		while (el && el !== document.documentElement) {
			const s = getComputedStyle(el);
			if (
				s.transform !== 'none' ||
				s.perspective !== 'none' ||
				s.willChange.includes('transform')
			) {
				const r = el.getBoundingClientRect();
				return { top: btnRect.bottom - r.top + 6, left: btnRect.left - r.left };
			}
			el = el.parentElement;
		}
		return { top: btnRect.bottom + 6, left: btnRect.left };
	}

	/** @param {MouseEvent & { currentTarget: HTMLElement }} e */
	function toggleStatusMenu(e) {
		if (!statusMenuOpen) {
			statusMenuPos = getMenuPos(e.currentTarget);
			priorityMenuOpen = false;
		}
		statusMenuOpen = !statusMenuOpen;
	}

	/** @param {MouseEvent & { currentTarget: HTMLElement }} e */
	function togglePriorityMenu(e) {
		if (!priorityMenuOpen) {
			priorityMenuPos = getMenuPos(e.currentTarget);
			statusMenuOpen = false;
		}
		priorityMenuOpen = !priorityMenuOpen;
	}

	async function handleStatusChange(/** @type {string} */ newStatusCamel) {
		statusMenuOpen = false;
		const pubkey = getCurrentPubkey();
		if (!pubkey || !task) return;
		// Capture relays synchronously before any await so we always use the relay set
		// that corresponds to the community currently loaded in this view.
		const relays = communityRelays;
		const dTag = task.tags?.find((/** @type {string[]} */ t) => t[0] === 'd')?.[1] ?? '';
		const addr = `${EVENT_KINDS.TASK}:${task.pubkey}:${dTag}`;
		const specStatus = CAMEL_TO_SPEC[newStatusCamel] ?? newStatusCamel;
		/** @type {string[][]} */
		const tags = [
			['a', addr],
			['status', specStatus]
		];
		if (taskPriority && taskPriority !== 'none') tags.push(['priority', taskPriority]);
		try {
			const ev = await signEvent({
				kind: EVENT_KINDS.STATUS,
				content: '',
				tags,
				created_at: Math.floor(Date.now() / 1000)
			});
			await publishToRelays(relays, ev);
			statusEvent = ev;
		} catch (err) {
			console.error('Failed to publish status event', err);
		}
	}

	async function handlePriorityChange(/** @type {string} */ newPriority) {
		priorityMenuOpen = false;
		const pubkey = getCurrentPubkey();
		if (!pubkey || !task) return;
		// Capture relays synchronously before any await.
		const relays = communityRelays;
		const dTag = task.tags?.find((/** @type {string[]} */ t) => t[0] === 'd')?.[1] ?? '';
		const addr = `${EVENT_KINDS.TASK}:${task.pubkey}:${dTag}`;
		const specStatus = CAMEL_TO_SPEC[taskStatus] ?? 'open';
		/** @type {string[][]} */
		const tags = [
			['a', addr],
			['status', specStatus]
		];
		if (newPriority && newPriority !== 'none') tags.push(['priority', newPriority]);
		try {
			const ev = await signEvent({
				kind: EVENT_KINDS.STATUS,
				content: '',
				tags,
				created_at: Math.floor(Date.now() / 1000)
			});
			await publishToRelays(relays, ev);
			statusEvent = ev;
		} catch (err) {
			console.error('Failed to publish priority event', err);
		}
	}

	async function handleEditSubmit(/** @type {any} */ params) {
		const {
			title,
			status,
			priority,
			text,
			emojiTags = [],
			mentions = [],
			labels = [],
			assignees: assigneePks = [],
			dTag: submittedDTag = ''
		} = params;
		const pubkey = getCurrentPubkey();
		if (!pubkey) throw new Error('Not signed in');
		const finalDTag =
			submittedDTag || (task?.tags?.find((/** @type {string[]} */ t) => t[0] === 'd')?.[1] ?? '');
		const communityPubkey = communityPubkeyFromNpub;
		/** @type {string[][]} */
		const tags = [
			['d', finalDTag],
			['title', title.trim()]
		];
		if (communityPubkey) tags.push(['h', communityPubkey]);
		labels.forEach((/** @type {string} */ l) => tags.push(['t', l]));
		assigneePks.forEach((/** @type {string} */ pk) => tags.push(['p', pk, 'assignee']));
		mentions.forEach((/** @type {string} */ pk) => {
			if (!assigneePks.includes(pk)) tags.push(['p', pk]);
		});
		emojiTags.forEach((/** @type {string[]} */ e) => tags.push(e));

		const taskEv = await signEvent({
			kind: EVENT_KINDS.TASK,
			content: text,
			tags,
			created_at: Math.floor(Date.now() / 1000)
		});
		const relays = communityDef?.relays?.length ? communityDef.relays : DEFAULT_COMMUNITY_RELAYS;
		await publishToRelays(relays, taskEv);
		task = taskEv;
		rawTaskEvent = taskEv;

		// Update status/priority
		const specStatus = CAMEL_TO_SPEC[status] ?? status;
		const addr = `${EVENT_KINDS.TASK}:${pubkey}:${finalDTag}`;
		/** @type {string[][]} */
		const statusTags = [
			['a', addr],
			['status', specStatus]
		];
		if (priority && priority !== 'none') statusTags.push(['priority', priority]);
		const statusEv = await signEvent({
			kind: EVENT_KINDS.STATUS,
			content: '',
			tags: statusTags,
			created_at: Math.floor(Date.now() / 1000)
		});
		await publishToRelays(relays, statusEv);
		statusEvent = statusEv;

		// Reload assignee profiles
		if (assigneePks.length > 0) {
			const batch = await fetchProfilesBatch(assigneePks);
			assigneeProfiles = assigneePks.map((/** @type {string} */ pk) => {
				const pEv = batch.get(pk);
				const c = pEv?.content
					? (() => {
							try {
								return JSON.parse(pEv.content);
							} catch {
								return {};
							}
						})()
					: {};
				return { pubkey: pk, name: c.display_name ?? c.name, pictureUrl: c.picture };
			});
		} else {
			assigneeProfiles = [];
		}
	}

	async function handleCommentSubmit(e) {
		if (!task || !e?.text?.trim()) return;
		const pubkey = getCurrentPubkey();
		if (!pubkey) return;
		const parentId = e.parentId ?? null;
		const replyToPubkey = e.replyToPubkey ?? task.pubkey;
		const target = {
			contentType: 'task',
			pubkey: task.pubkey,
			id: task.id,
			kind: EVENT_KINDS.TASK
		};
		try {
			const signed = await publishComment(
				e.text,
				target,
				signEvent,
				e.emojiTags ?? [],
				parentId,
				replyToPubkey,
				parentId ? 1111 : EVENT_KINDS.TASK,
				e.mentions ?? []
			);
			const parsed = parseComment(signed);
			parsed.npub = nip19.npubEncode(signed.pubkey);
			if (parentId) parsed.parentId = parentId;
			comments = [...comments, parsed];
		} catch (err) {
			console.error('Comment submit failed', err);
		}
	}

	function refetchZaps() {
		if (!task?.id) return;
		fetchZapsByEventIds([task.id], { relays: communityRelays }).then((events) => {
			zaps = events.map((e) => {
				const z = parseZapReceipt(e);
				z.id = e.id;
				return z;
			});
		});
	}
</script>

<div class="task-detail">
	{#if !task && eventId}
		<EmptyState message="Loading…" minHeight={200} />
	{:else if !task}
		<EmptyState message="Task not found" minHeight={200} />
	{:else}
		<div class="detail-header-wrap">
			<DetailHeader
				publisherPic={authorProfile?.picture}
				{publisherName}
				publisherPubkey={task.pubkey}
				publisherUrl={npub ? `/profile/${npub}` : '#'}
				timestamp={task.created_at}
				{catalogs}
				catalogText="Community"
				showPublisher={true}
				showMenu={false}
				showBackButton={true}
				{onBack}
				scrollThreshold={undefined}
				compactPadding={true}
				bind:getStartedModalOpen
			/>
		</div>

		<div class="content-scroll">
			<div class="content-inner">
				<!-- Title row -->
				<div class="title-row">
					<h1 class="task-title">{taskTitle}</h1>
					{#if isOwnTask && getIsSignedIn()}
						<button
							type="button"
							class="edit-btn btn-primary-small"
							onclick={() => (editModalOpen = true)}
							aria-label="Edit task"
						>
							<Pen variant="fill" color="hsl(var(--white66))" size={14} />
							<span>Edit</span>
						</button>
					{/if}
				</div>

				<!-- Meta panel -->
				<div class="meta-scroll-wrap" class:panel-overflows={panelOverflows} use:observeOverflow>
					<div class="task-meta-panel">
						<div class="task-meta-cols">
							<!-- STATUS + PRIORITY -->
							<div class="task-meta-col">
								<div class="task-meta-header-row"><span class="eyebrow-label-xs eyebrow-label-muted">STATUS</span></div>
								<div class="task-meta-line">
									<TaskBox state={taskStatus} size={16} />
									<span class="task-meta-val">{statusDisplayLabel}</span>
									{#if isAuthorizedForStatus}
										<button
											type="button"
											class="meta-inline-btn"
											onclick={toggleStatusMenu}
											aria-label="Change status"
											aria-haspopup="listbox"
											aria-expanded={statusMenuOpen}
										>
											<ChevronDown
												variant="outline"
												color="hsl(0 0% 100% / 0.44)"
												size={12}
												strokeWidth={2}
											/>
										</button>
									{/if}
								</div>
								<div class="task-meta-line">
									<PriorityBox
										priority={taskPriority !== 'none' ? taskPriority : 'none'}
										size={16}
									/>
									<span class="task-meta-val" class:task-meta-empty={taskPriority === 'none'}
										>{priorityDisplayLabel}</span
									>
									{#if isAuthorizedForStatus}
										<button
											type="button"
											class="meta-inline-btn"
											onclick={togglePriorityMenu}
											aria-label="Change priority"
											aria-haspopup="listbox"
											aria-expanded={priorityMenuOpen}
										>
											<ChevronDown
												variant="outline"
												color="hsl(0 0% 100% / 0.44)"
												size={12}
												strokeWidth={2}
											/>
										</button>
									{/if}
								</div>
							</div>

							<!-- PROJECT + MILESTONE -->
							<div class="task-meta-col">
								<div class="task-meta-header-row"><span class="eyebrow-label-xs eyebrow-label-muted">PROJECT</span></div>
								<div class="task-meta-line">
									<span
										class="task-meta-val"
										class:task-meta-cap={!!projectRef}
										class:task-meta-empty={!projectRef}
									>
										{projectRef ? addrLabel(projectRef) : 'No project'}
									</span>
								</div>
								<div class="task-meta-line">
									<span class="task-meta-val" class:task-meta-empty={!milestoneRef}>
										{milestoneRef ? addrLabel(milestoneRef) : 'No milestone'}
									</span>
								</div>
							</div>

							<!-- TARGETS -->
							<div class="task-meta-col">
								<div class="task-meta-header-row"><span class="eyebrow-label-xs eyebrow-label-muted">TARGETS</span></div>
								{#if taskTargetRefs.length > 0}
									{#each taskTargetRefs as ref}
										<div class="task-meta-line">
											<span class="task-meta-val task-meta-mono">{ref.label}</span>
										</div>
									{/each}
								{:else}
									<span class="task-meta-val task-meta-empty">No targets</span>
								{/if}
							</div>

							<!-- ASSIGNED TO -->
							<div class="task-meta-col">
								<div class="task-meta-header-row">
									<span class="eyebrow-label-xs eyebrow-label-muted">ASSIGNED TO</span>
								</div>
								{#if assigneeProfiles.length > 0}
									{#each assigneeProfiles.slice(0, 2) as profile (profile.pubkey)}
										<div class="task-meta-line">
											<ProfilePic
												pubkey={profile.pubkey}
												pictureUrl={profile.pictureUrl}
												name={profile.name}
												size="xs"
											/>
											<span class="task-meta-val"
												>{profile.name || profile.pubkey.slice(0, 8) + '…'}</span
											>
										</div>
									{/each}
								{:else}
									<span class="task-meta-val task-meta-empty">Unassigned</span>
								{/if}
							</div>
						</div>
					</div>
				</div>

				{#if task.content?.trim()}
					<div class="description-container" class:expanded={descriptionExpanded}>
						<div class="task-description" use:checkTruncation>
							<MarkdownBody tokens={descriptionTokens} />
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
				{/if}

				<div class="social-tabs-wrap">
					<SocialTabs
						app={{}}
						mainEventIds={[task.id]}
						wikiLinkFn={communityNpub
							? (slug) =>
									`/communities?c=${encodeURIComponent(communityNpub)}&wiki=${encodeURIComponent(slug)}`
							: undefined}
						showDetailsTab={true}
						detailsShareableId={taskNaddr}
						detailsPublicationLabel="Task"
						detailsNpub={npub}
						detailsPubkey={task.pubkey ?? ''}
						detailsRawData={rawTaskEvent
							? (() => {
									const c = { ...rawTaskEvent };
									delete c._tags;
									return c;
								})()
							: null}
						{comments}
						{commentsLoading}
						{commentsError}
						zaps={zaps.map((z) => ({
							id: z.id,
							senderPubkey: z.senderPubkey || undefined,
							amountSats: z.amountSats,
							createdAt: z.createdAt,
							comment: z.comment,
							emojiTags: z.emojiTags ?? [],
							zappedEventId: z.zappedEventId ?? undefined
						}))}
						{zapsLoading}
						{zapperProfiles}
						{profiles}
						profilesLoading={false}
						pubkeyToNpub={(pk) => (pk ? nip19.npubEncode(pk) : '')}
						{searchProfiles}
						{searchEmojis}
						onCommentSubmit={handleCommentSubmit}
						onZapReceived={refetchZaps}
						onGetStarted={() => (getStartedModalOpen = true)}
						labelEntries={taskLabelEntries}
						labelsLoading={false}
					/>
				</div>
			</div>
		</div>

		{#if task && zapTarget && getIsSignedIn()}
			<BottomBar
				publisherName={authorProfile?.displayName ?? authorProfile?.name ?? ''}
				contentType="task"
				{zapTarget}
				otherZaps={[]}
				isSignedIn={getIsSignedIn()}
				{isMember}
				{onJoinRequired}
				onGetStarted={() => goto('/')}
				{searchProfiles}
				{searchEmojis}
				oncommentSubmit={handleCommentSubmit}
				onzapReceived={() => {}}
				onoptions={() => {}}
				eventId={rawTaskEvent?.id ?? ''}
				authorPubkey={rawTaskEvent?.pubkey ?? ''}
				communityPubkey={communityAuthorPubkey}
				relays={communityRelays}
			/>
		{/if}
	{/if}

	<!-- Fixed-position menus — escape all overflow containers -->
	{#if statusMenuOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="meta-menu-backdrop"
			onclick={() => (statusMenuOpen = false)}
			role="presentation"
		></div>
		<div
			class="meta-fixed-menu"
			role="listbox"
			aria-label="Task status"
			style="top: {statusMenuPos.top}px; left: {statusMenuPos.left}px;"
			transition:fly={{ y: -6, duration: 150, easing: cubicOut }}
		>
			{#each STATUS_OPTIONS as opt (opt.value)}
				<button
					type="button"
					class="status-option"
					class:active={taskStatus === opt.value}
					role="option"
					aria-selected={taskStatus === opt.value}
					onclick={() => handleStatusChange(opt.value)}
				>
					<TaskBox state={opt.value} size={18} />
					<span class="status-label">{opt.label}</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if priorityMenuOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="meta-menu-backdrop"
			onclick={() => (priorityMenuOpen = false)}
			role="presentation"
		></div>
		<div
			class="meta-fixed-menu"
			role="listbox"
			aria-label="Task priority"
			style="top: {priorityMenuPos.top}px; left: {priorityMenuPos.left}px;"
			transition:fly={{ y: -6, duration: 150, easing: cubicOut }}
		>
			{#each PRIORITY_OPTIONS as opt (opt.value)}
				<button
					type="button"
					class="status-option"
					class:active={taskPriority === opt.value}
					role="option"
					aria-selected={taskPriority === opt.value}
					onclick={() => handlePriorityChange(opt.value)}
				>
					<PriorityBox priority={opt.value} size={18} />
					<span class="status-label">{opt.label}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<TaskModal
	bind:isOpen={editModalOpen}
	initialData={editInitialData}
	{getCurrentPubkey}
	{searchProfiles}
	{searchEmojis}
	onsubmit={handleEditSubmit}
	onclose={() => (editModalOpen = false)}
/>

<style>
	.task-detail {
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

	.task-title {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0;
		line-height: 1.3;
		color: hsl(var(--foreground));
		flex: 1;
		min-width: 0;
	}

	.edit-btn {
		gap: 8px;
		flex-shrink: 0;
	}

	/* ── Meta panel scroll wrapper — bleeds to screen edges, right-fade hint ── */
	.meta-scroll-wrap {
		overflow-x: auto;
		margin: 0 -16px;
		padding: 0 16px;
		margin-bottom: 14px;
		scrollbar-width: none;
	}
	.meta-scroll-wrap::-webkit-scrollbar {
		display: none;
	}
	/* Right-edge fade only when panel actually overflows */
	.meta-scroll-wrap.panel-overflows {
		mask-image: linear-gradient(to right, black 90%, transparent 100%);
		-webkit-mask-image: linear-gradient(to right, black 90%, transparent 100%);
	}

	/* ── Meta panel ── */
	.task-meta-panel {
		background: hsl(var(--gray33));
		border-radius: 12px;
		padding: 0 14px;
		min-width: max-content;
	}

	.task-meta-cols {
		display: flex;
		flex-wrap: nowrap;
		gap: 0;
	}

	.task-meta-col {
		display: flex;
		flex-direction: column;
		gap: 5px;
		flex: 1;
		min-width: 128px;
		padding: 10px 14px 10px 0;
		border-right: 1px solid hsl(var(--white11));
	}
	.task-meta-col:not(:first-child) {
		padding-left: 14px;
	}
	.task-meta-col:last-child {
		border-right: none;
		padding-right: 0;
	}

	/* Label row inside column (label + optional Edit button inline) */
	.task-meta-header-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 1px;
	}

	.task-meta-line {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.task-meta-val {
		font-size: 0.875rem;
		color: hsl(var(--white66));
		line-height: 1.4;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.task-meta-empty {
		color: hsl(var(--white16));
	}
	.task-meta-cap {
		text-transform: capitalize;
	}
	.task-meta-mono {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}

	/* ── Inline edit icon button (zero height impact) ── */
	.meta-inline-btn {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		background: none;
		border: none;
		padding: 0;
		margin-left: 2px;
		cursor: pointer;
		flex-shrink: 0;
		line-height: 0;
		opacity: 0.8;
		transition: opacity 0.15s ease;
	}
	.meta-inline-btn:hover {
		opacity: 1;
	}
	.meta-inline-btn:active {
		opacity: 0.5;
	}

	/* ── Fixed-position dropdown menus (escape all overflow containers) ── */
	.meta-menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 119;
	}

	.meta-fixed-menu {
		position: fixed;
		z-index: 120;
		background: hsl(var(--gray));
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border: 0.33px solid hsl(var(--white33));
		border-radius: 12px;
		overflow: hidden;
		min-width: 160px;
	}

	.status-option {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 8px 12px;
		background: none;
		border: none;
		border-radius: 0;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s ease;
	}
	.status-option:not(:last-child) {
		border-bottom: 0.33px solid hsl(var(--white8));
	}
	.status-option:hover {
		background: hsl(var(--white4));
	}
	.status-option.active .status-label {
		color: hsl(var(--white));
		font-weight: 600;
	}

	.status-label {
		font-size: 0.9375rem;
		font-weight: 500;
		color: hsl(var(--white66));
	}

	/* Description */
	.description-container {
		position: relative;
		margin-bottom: 0.875rem;
	}

	.description-container:not(.expanded) .task-description {
		max-height: 280px;
		overflow: hidden;
	}

	.description-container.expanded .task-description {
		max-height: none;
	}

	.task-description {
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

	.read-more-btn,
	.show-less-btn {
		display: inline-flex;
		align-items: center;
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

	.read-more-btn {
		position: absolute;
		bottom: 8px;
		left: 0;
	}

	.show-less-btn {
		margin-top: 0.5rem;
	}

	.read-more-btn:hover,
	.show-less-btn:hover {
		transform: scale(1.025);
	}
	.read-more-btn:active,
	.show-less-btn:active {
		transform: scale(0.98);
	}
</style>

<script lang="js">
	/**
	 * WikiDetail — full article view for a kind:30818 wiki event.
	 *
	 * Mirrors ForumPostDetail:
	 *   - DetailHeader with author info + community catalog on the right
	 *   - Read-more / show-less truncation
	 *   - SocialTabs (Comments, Zaps, Details tab with raw event)
	 *   - White body text, code blocks matching DetailsTab, visible bullet markers
	 */
	import { nip19 } from 'nostr-tools';
	import {
		queryEvents,
		queryEvent,
		liveQuery,
		parseProfile,
		parseComment,
		parseCommunity,
		parseProfileList,
		parseZapReceipt,
		publishComment,
		fetchProfilesBatch,
		fetchForumPostComments,
		fetchZapsByEventIds,
		subscribeForumPostComments,
		fetchProfileListFromRelays,
		fetchEventsNoStore,
		putEvents,
		fetchFromRelays
	} from '$lib/nostr';
	import { EVENT_KINDS, DEFAULT_COMMUNITY_RELAYS } from '$lib/config';
	import { tokenizeNostrMarkdown } from '$lib/utils/markdown';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import DetailHeader from '$lib/components/layout/DetailHeader.svelte';
	import SocialTabs from '$lib/components/social/SocialTabs.svelte';
	import MarkdownBody from '$lib/components/common/MarkdownBody.svelte';
	import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
	import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
	import { getCurrentPubkey, getIsSignedIn, signEvent } from '$lib/stores/auth.svelte.js';
	import BottomBar from '$lib/components/social/BottomBar.svelte';
	import WikiModal from '$lib/components/modals/WikiModal.svelte';
	import { Pen } from '$lib/components/icons';
	import { publishToRelays } from '$lib/nostr';
	import { goto } from '$app/navigation';
	import { navHandoff } from '$lib/navHandoff.js';

	/** @type {{ slug?: string, eventId?: string, event?: any, profiles?: Map<string,any>|null, communityNpub?: string, wikiLinkFn?: (slug: string) => string, onBack?: () => void }} */
	let {
		slug = '',
		eventId = '',
		/** Optional pre-loaded event (from navHandoff) — skips the Dexie/relay lookup. */
		event: preloadedEvent = null,
		/** Optional pre-loaded profiles (from navHandoff) — skips author/community query. */
		profiles: preloadedProfiles = null,
		communityNpub = '',
		/** Converts a [[slug]] to a URL. Override per context (desktop vs mobile). */
		wikiLinkFn = (s) => `#${s}`,
		onBack = () => {}
	} = $props();

	/** @type {any} */
	let wikiEvent = $state(preloadedEvent ?? null);

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
	let loading = $state(!preloadedEvent);
	let descriptionExpanded = $state(false);
	let isTruncated = $state(false);
	let communityName = $state(_commContent?.display_name ?? _commContent?.name ?? '');
	let communityPicture = $state(_commContent?.picture ?? _commContent?.image ?? '');
	let communityPubkeyState = $state('');
	let comments = $state([]);
	let commentsLoading = $state(false);
	let commentsError = $state('');
	let zaps = $state([]);
	let zapsLoading = $state(false);
	let profiles = $state({});
	let profilesLoading = $state(false);
	let zapperProfiles = $state(new Map());
	/** @type {{ mainRelay: string|null, relays: string[], enforcedRelays: string[], mainRelayEnforced: boolean, sections: any[] } | null} */
	let communityDef = $state(null);
	/** @type {string[] | null | undefined} */
	let allowedCommenters = $state(undefined);

	const title = $derived(
		wikiEvent?.tags?.find((/** @type {string[]} */ t) => t[0] === 'title')?.[1] ?? 'Untitled'
	);
	const summary = $derived(
		wikiEvent?.tags?.find((/** @type {string[]} */ t) => t[0] === 'summary')?.[1] ?? ''
	);
	const wikiSlug = $derived(
		wikiEvent?.tags?.find((/** @type {string[]} */ t) => t[0] === 'd')?.[1] ?? slug
	);
	const emojiMap = $derived(
		Object.fromEntries(
			(wikiEvent?.tags ?? [])
				.filter((/** @type {string[]} */ t) => t[0] === 'emoji' && t[1] && t[2])
				.map((/** @type {string[]} */ t) => [t[1], t[2]])
		)
	);
	const bodyTokens = $derived(
		wikiEvent?.content ? tokenizeNostrMarkdown(wikiEvent.content, { wikiLinkFn, emojiMap }) : []
	);

	const npub = $derived(
		wikiEvent?.pubkey
			? (() => {
					try {
						return nip19.npubEncode(wikiEvent.pubkey);
					} catch {
						return '';
					}
				})()
			: ''
	);

	const publisherName = $derived(authorProfile?.displayName ?? authorProfile?.name ?? 'Author');

	const catalogs = $derived(
		communityPubkeyState
			? [
					{
						name: communityName || 'Community',
						pictureUrl: communityPicture || undefined,
						pubkey: communityPubkeyState
					}
				]
			: []
	);

	// naddr for the Details tab shareable ID
	const wikiNaddr = $derived(
		wikiEvent?.pubkey && wikiSlug
			? (() => {
					try {
						return nip19.naddrEncode({
							kind: EVENT_KINDS.WIKI,
							pubkey: wikiEvent.pubkey,
							identifier: wikiSlug
						});
					} catch {
						return '';
					}
				})()
			: ''
	);

	const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey() ?? ''));
	const searchEmojis = $derived(
		createSearchEmojisFunction(/** @type {any} */ (() => getCurrentPubkey() ?? ''))
	);

	const communityRelays = $derived(
		communityDef?.relays?.length ? communityDef.relays : DEFAULT_COMMUNITY_RELAYS
	);

	// Resolve allowed commenters from the General section profile list.
	// When no communityDef (e.g. wiki without community), allow all (null).
	$effect(() => {
		const def = communityDef;
		if (!def) {
			allowedCommenters = null;
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
			if (!listEvent) {
				listEvent = await fetchProfileListFromRelays(relays, generalSection.profileListAddress);
			}
			if (cancelled) return;
			const list = listEvent ? parseProfileList(listEvent) : null;
			allowedCommenters = list?.members?.length ? list.members : null;
		})();
		return () => {
			cancelled = true;
		};
	});

	// Plain vars for coordinating ghost parent fetching across liveQuery re-fires.
	let _lastParsedAllowed = /** @type {any[]} */ ([]);
	let _wikiIdRef = '';
	let _nonMemberById = /** @type {Map<string, { loading?: boolean, comment?: any, notFound?: boolean }>} */ (
		new Map()
	);

	function _refreshComments(parsedAllowed) {
		const nonMemberEntries = [];
		for (const [, state] of _nonMemberById) {
			if (state.comment) nonMemberEntries.push(state.comment);
		}
		const combined = [...parsedAllowed, ...nonMemberEntries];
		const combinedIdSet = new Set(combined.map((c) => c.id));
		for (const c of combined) {
			if (
				c.parentId &&
				c.parentId !== _wikiIdRef &&
				!combinedIdSet.has(c.parentId) &&
				!_nonMemberById.has(c.parentId)
			) {
				_nonMemberById.set(c.parentId, { loading: true });
				_fetchNonMemberParent(c.parentId);
			}
		}
		let displayable = combined;
		let changed = true;
		while (changed) {
			const displayIds = new Set(displayable.map((c) => c.id));
			const next = displayable.filter(
				(c) => !c.parentId || c.parentId === _wikiIdRef || displayIds.has(c.parentId)
			);
			changed = next.length !== displayable.length;
			displayable = next;
		}
		comments = displayable;
	}

	async function _fetchNonMemberParent(id) {
		try {
			const events = await fetchEventsNoStore(
				DEFAULT_COMMUNITY_RELAYS,
				[{ ids: [id], kinds: [1111], limit: 1 }],
				{ timeout: 3000 }
			);
			const event = events[0] ?? null;
			if (event) {
				const p = parseComment(event);
				p.npub = nip19.npubEncode(event.pubkey);
				p.nonMember = true;
				_nonMemberById.set(id, { comment: p });
				fetchProfilesBatch([event.pubkey]).then((batch) => {
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
				}).catch(() => {});
			} else {
				_nonMemberById.set(id, { notFound: true });
			}
		} catch {
			_nonMemberById.set(id, { notFound: true });
		}
		_refreshComments(_lastParsedAllowed);
	}

	// Comments: live from Dexie, filtered by allowedCommenters, backfilled from relay.
	$effect(() => {
		const wid = wikiEvent?.id;
		const def = communityDef;
		const relays = def?.relays?.length ? def.relays : DEFAULT_COMMUNITY_RELAYS;
		const allowed = allowedCommenters;
		if (!wid) {
			comments = [];
			_lastParsedAllowed = [];
			_wikiIdRef = '';
			_nonMemberById = new Map();
			return;
		}
		if (allowed === undefined) {
			commentsLoading = true;
			return;
		}
		commentsLoading = true;
		_wikiIdRef = wid;
		_nonMemberById = new Map();
		_lastParsedAllowed = [];
		const allowedSet = allowed ? new Set(allowed) : null;

		const sub = liveQuery(async () => {
			const [byE, bye] = await Promise.all([
				queryEvents({ kinds: [1111], '#E': [wid], limit: 500 }),
				queryEvents({ kinds: [1111], '#e': [wid], limit: 500 })
			]);
			const byId = new Map();
			for (const ev of [...byE, ...bye]) if (!byId.has(ev.id)) byId.set(ev.id, ev);
			return Array.from(byId.values()).sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
		}).subscribe({
			next: (events) => {
				let filtered = events ?? [];
				if (allowedSet) {
					filtered = filtered.filter((e) => allowedSet.has(e.pubkey));
				}
				const parsedAllowed = filtered.map((e) => {
					const p = parseComment(e);
					p.npub = nip19.npubEncode(e.pubkey);
					return p;
				});
				_lastParsedAllowed = parsedAllowed;
				commentsLoading = false;
				commentsError = '';
				_refreshComments(parsedAllowed);
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

		fetchForumPostComments(wid, { relays, authors: allowed })
			.then(() => {})
			.catch(() => {});

		// Live subscription so new comments arrive in real-time (bufferEvent → Dexie → liveQuery)
		const wikiCommentsUnsub = subscribeForumPostComments(relays, [wid], {
			authors: allowed ?? undefined
		});

		return () => {
			sub.unsubscribe();
			wikiCommentsUnsub?.();
		};
	});

	// Zaps: fetch by wiki event id
	$effect(() => {
		const tid = wikiEvent?.id;
		const relays = communityRelays;
		if (!tid) return;
		(async () => {
			zapsLoading = true;
			try {
				const events = await fetchZapsByEventIds([tid], { relays });
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

	async function handleCommentSubmit(e) {
		if (!wikiEvent || !e?.text?.trim()) return;
		const pubkey = getCurrentPubkey();
		if (!pubkey) return;
		const parentId = e.parentId ?? null;
		const replyToPubkey = e.replyToPubkey ?? wikiEvent.pubkey;
		const target = {
			contentType: 'wiki',
			pubkey: wikiEvent.pubkey,
			id: wikiEvent.id,
			kind: EVENT_KINDS.WIKI
		};
		try {
			const signed = await publishComment(
				e.text,
				target,
				signEvent,
				e.emojiTags ?? [],
				parentId,
				replyToPubkey,
				parentId ? 1111 : EVENT_KINDS.WIKI,
				e.mentions ?? [],
				communityRelays
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
		if (!wikiEvent?.id) return;
		fetchZapsByEventIds([wikiEvent.id], { relays: communityRelays }).then((events) => {
			zaps = events.map((e) => {
				const z = parseZapReceipt(e);
				z.id = e.id;
				return z;
			});
		});
	}

	const isOwnWiki = $derived(
		!!wikiEvent?.pubkey && !!getCurrentPubkey() && wikiEvent.pubkey === getCurrentPubkey()
	);

	let editModalOpen = $state(false);

	const editInitialData = $derived(
		wikiEvent
			? {
					title,
					slug: wikiSlug,
					summary,
					text: wikiEvent.content ?? '',
					labels: (wikiEvent.tags ?? [])
						.filter((/** @type {string[]} */ t) => t[0] === 't' && t[1])
						.map((/** @type {string[]} */ t) => t[1])
				}
			: null
	);

	/**
	 * @param {{ title: string, slug: string, summary: string, text: string, emojiTags: string[][], mentions: string[], labels: string[] }} params
	 */
	async function handleEditSubmit({
		title: newTitle,
		slug: newSlug,
		summary: newSummary,
		text,
		emojiTags = [],
		mentions = [],
		labels = []
	}) {
		const currentPubkey = getCurrentPubkey();
		if (!currentPubkey) throw new Error('Not signed in');
		/** @type {string[][]} */
		const tags = [
			['d', newSlug],
			['title', newTitle.trim()]
		];
		if (communityPubkeyState) tags.push(['h', communityPubkeyState]);
		if (newSummary.trim()) tags.push(['summary', newSummary.trim()]);
		labels.forEach((l) => tags.push(['t', l]));
		mentions.forEach((pk) => tags.push(['p', pk]));
		emojiTags.forEach((e) => tags.push(e));

		const ev = await signEvent({
			kind: EVENT_KINDS.WIKI,
			content: text,
			tags,
			created_at: Math.floor(Date.now() / 1000)
		});
		const relays = DEFAULT_COMMUNITY_RELAYS;
		await publishToRelays(relays, ev);
		wikiEvent = ev;
	}

	const zapTarget = $derived(
		wikiEvent
			? {
					name: title,
					pubkey: wikiEvent.pubkey,
					id: wikiEvent.id,
					pictureUrl: authorProfile?.picture
				}
			: null
	);

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

	/**
	 * Intercept clicks on /wiki/<slug> links rendered inside the article body.
	 * Resolves the plain slug to the event's naddr via Dexie then relay (#h scoped),
	 * sets a navHandoff, and navigates to /wiki/<naddr> so the canonical URL is used.
	 * Only fires for /wiki/ hrefs that are plain slugs (not already naddr1… encoded).
	 * Community-page wikilinks use /community/…?wiki=slug hrefs and are not intercepted.
	 *
	 * @param {MouseEvent} e
	 */
	async function handleWikiLinkClick(e) {
		const anchor = /** @type {HTMLElement} */ (e.target)?.closest?.('a');
		if (!anchor) return;
		const href = anchor.getAttribute('href') ?? '';
		if (!href.startsWith('/wiki/')) return;

		const pathSlug = href.split('?')[0].replace('/wiki/', '').trim();
		if (!pathSlug) return;

		// Already a resolved naddr — let default navigation handle it.
		try {
			const d = nip19.decode(pathSlug);
			if (d.type === 'naddr' && d.data.kind === EVENT_KINDS.WIKI) return;
		} catch {}

		e.preventDefault();

		// Derive community pubkey — prefer communityNpub prop, then fall back to
		// the #h tag on the current article so navigation works even without the prop.
		let communityPubkey = '';
		if (communityNpub) {
			try {
				const d = nip19.decode(communityNpub);
				if (d.type === 'npub') communityPubkey = /** @type {string} */ (d.data);
			} catch {}
		}
		if (!communityPubkey && wikiEvent) {
			communityPubkey = wikiEvent.tags?.find((/** @type {string[]} */ t) => t[0] === 'h')?.[1] ?? '';
		}

		const filter = communityPubkey
			? { kinds: [EVENT_KINDS.WIKI], '#d': [pathSlug], '#h': [communityPubkey], limit: 10 }
			: { kinds: [EVENT_KINDS.WIKI], '#d': [pathSlug], limit: 10 };

		// Author of the current article — prefer their version when multiple exist
		const currentAuthor = wikiEvent?.pubkey ?? '';

		// 1. Dexie first (instant, already fetched)
		let ev = null;
		try {
			const candidates = await queryEvents(filter);
			ev =
				(currentAuthor && candidates.find((c) => c.pubkey === currentAuthor)) ??
				candidates[0] ??
				null;
		} catch {}

		// 2. Relay fallback — prefer community's declared relays over defaults
		if (!ev) {
			try {
				let relays = DEFAULT_COMMUNITY_RELAYS;
				if (communityPubkey) {
					const commEv = await queryEvent({
						kinds: [EVENT_KINDS.COMMUNITY],
						authors: [communityPubkey],
						limit: 1
					}).catch(() => null);
					const declared = commEv?.tags
						?.filter((t) => t[0] === 'r' && t[1])
						.map((t) => t[1]);
					if (declared?.length) relays = declared;
				}
				const fetched = await fetchFromRelays(relays, filter);
				if (fetched?.length) {
					await putEvents(fetched);
					ev =
						(currentAuthor && fetched.find((c) => c.pubkey === currentAuthor)) ??
						fetched[0] ??
						null;
				}
			} catch {}
		}

		if (!ev) {
			// Not found — navigate with slug + community so WikiDetail can show empty state
			// with the correct community context rather than a generic 404.
			const fallbackCommunity = communityNpub
				|| (communityPubkey ? nip19.npubEncode(communityPubkey) : '');
			const fallbackUrl = fallbackCommunity
				? `/wiki/${encodeURIComponent(pathSlug)}?community=${encodeURIComponent(fallbackCommunity)}`
				: href;
			goto(fallbackUrl);
			return;
		}

		const naddr = nip19.naddrEncode({
			kind: EVENT_KINDS.WIKI,
			pubkey: ev.pubkey,
			identifier: pathSlug
		});

		// Resolve the community npub for the URL param (needed when communityNpub
		// prop was empty and we derived communityPubkey from the article's #h tag).
		const communityNpubForUrl = communityNpub
			|| (communityPubkey ? nip19.npubEncode(communityPubkey) : '');

		// navHandoff: best-case instant render if SvelteKit remounts the page.
		// ?community=: guaranteed fallback if it soft-navigates instead.
		navHandoff.set(naddr, { event: ev, communityNpub: communityNpubForUrl, profiles: new Map() });
		const url = communityNpubForUrl
			? `/wiki/${naddr}?community=${encodeURIComponent(communityNpubForUrl)}`
			: `/wiki/${naddr}`;
		goto(url);
	}

	$effect(() => {
		if (!communityNpub && !slug && !eventId && !preloadedEvent) {
			loading = false;
			return;
		}
		let communityPubkey = '';
		if (communityNpub) {
			try {
				const decoded = nip19.decode(communityNpub);
				if (decoded.type === 'npub') communityPubkey = decoded.data;
			} catch {
				loading = false;
				return;
			}
		}

		(async () => {
			// Preloaded event skips Dexie/relay fetch — jump straight to profile loads.
			if (preloadedEvent) {
				wikiEvent = preloadedEvent;
				loading = false;
				communityPubkeyState = communityPubkey;
				const [profileEv, communityEv, communityProfileEv] = await Promise.all([
					preloadedEvent.pubkey
						? queryEvent({
								kinds: [EVENT_KINDS.PROFILE],
								authors: [preloadedEvent.pubkey],
								limit: 1
							})
						: Promise.resolve(null),
					communityPubkey
						? queryEvent({ kinds: [EVENT_KINDS.COMMUNITY], authors: [communityPubkey], limit: 1 })
						: Promise.resolve(null),
					communityPubkey
						? queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [communityPubkey], limit: 1 })
						: Promise.resolve(null)
				]);
				if (profileEv) authorProfile = parseProfile(profileEv);
				if (communityEv) communityDef = parseCommunity(communityEv);
				if (communityEv || communityProfileEv) {
					const cp = communityProfileEv ? parseProfile(communityProfileEv) : null;
					communityName =
						cp?.display_name ??
						cp?.name ??
						communityEv?.tags?.find((t) => t[0] === 'name')?.[1] ??
						'';
					communityPicture = cp?.picture ?? '';
				}
				return;
			}

			loading = true;
			wikiEvent = null;
			authorProfile = null;
			communityName = '';
			communityPicture = '';
			communityPubkeyState = communityPubkey;
			descriptionExpanded = false;
			isTruncated = false;
			let ev = null;

			// Try to find by eventId first (most specific), then by slug+community
			if (eventId) {
				ev = await queryEvent({ kinds: [EVENT_KINDS.WIKI], ids: [eventId] });
			}
			if (!ev && slug) {
				const slugFilter = communityPubkey
					? { kinds: [EVENT_KINDS.WIKI], '#d': [slug], '#h': [communityPubkey], limit: 10 }
					: { kinds: [EVENT_KINDS.WIKI], '#d': [slug], limit: 10 };
				const candidates = await queryEvents(slugFilter);
				// Prefer same-author (community) match; fall back to most recent
				ev = candidates.find((e) => e.pubkey === communityPubkey) ?? candidates[0] ?? null;
			}

			// If not in Dexie, fetch from relays
			if (!ev) {
				const relays = DEFAULT_COMMUNITY_RELAYS;
				const filter = eventId
					? { kinds: [EVENT_KINDS.WIKI], ids: [eventId], limit: 1 }
					: communityPubkey
						? { kinds: [EVENT_KINDS.WIKI], '#d': [slug], '#h': [communityPubkey], limit: 10 }
						: { kinds: [EVENT_KINDS.WIKI], '#d': [slug], limit: 10 };
				const fetched = await fetchFromRelays(relays, filter);
				if (fetched.length) {
					await putEvents(fetched);
					ev = eventId
						? fetched[0]
						: (fetched.find((e) => e.pubkey === communityPubkey) ?? fetched[0]);
				}
			}

			wikiEvent = ev ?? null;
			loading = false;

			// Fallback: get community from wiki's #h when not in URL
			if (!communityPubkey && ev?.tags) {
				const hTag = ev.tags.find((/** @type {string[]} */ t) => t[0] === 'h')?.[1];
				if (hTag) {
					communityPubkey = hTag;
					communityPubkeyState = hTag;
				}
			}

			// Load author profile + community info in parallel
			const [profileEv, communityEv, communityProfileEv] = await Promise.all([
				ev?.pubkey
					? queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [ev.pubkey], limit: 1 })
					: Promise.resolve(null),
				queryEvent({ kinds: [EVENT_KINDS.COMMUNITY], authors: [communityPubkey], limit: 1 }),
				queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [communityPubkey], limit: 1 })
			]);

			if (profileEv) {
				authorProfile = parseProfile(profileEv);
			} else if (ev?.pubkey) {
				const batch = await fetchProfilesBatch([ev.pubkey]);
				const pEv = batch.get(ev.pubkey);
				if (pEv) authorProfile = parseProfile(pEv);
			}

			if (communityEv) communityDef = parseCommunity(communityEv);
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
		})();
	});
</script>

<div class="wiki-detail">
	{#if loading}
		<EmptyState message="Loading…" minHeight={200} />
	{:else if !wikiEvent}
		<EmptyState message="Article not found" minHeight={200} />
	{:else}
		<div class="detail-header-wrap">
			<DetailHeader
				publisherPic={authorProfile?.picture}
				{publisherName}
				publisherPubkey={wikiEvent.pubkey}
				publisherUrl={npub ? `/profile/${npub}` : '#'}
				timestamp={wikiEvent.created_at}
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
					<h1 class="wiki-title">{title}</h1>
					{#if wikiSlug}
					<span class="wiki-slug">{wikiSlug}</span>
					{/if}
					{#if isOwnWiki && getIsSignedIn()}
						<button
							type="button"
							class="edit-btn btn-primary-small"
							onclick={() => (editModalOpen = true)}
							aria-label="Edit wiki"
						>
							<Pen variant="fill" color="hsl(var(--white66))" size={14} />
							<span>Edit</span>
						</button>
					{/if}
				</div>

				<!-- Summary panel -->
				{#if summary}
					<div class="wiki-summary-panel">
						<p class="wiki-summary">{summary}</p>
					</div>
				{/if}

				<!-- Markdown body -->
				<div class="wiki-body-wrap">
					<div class="description-container" class:expanded={descriptionExpanded}>
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div class="wiki-body" role="presentation" use:checkTruncation onclick={handleWikiLinkClick}>
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

				<!-- Social tabs -->
				<div class="social-tabs-wrap">
					<SocialTabs
						app={{}}
						mainEventIds={[wikiEvent.id]}
						{wikiLinkFn}
						showDetailsTab={true}
						detailsShareableId={wikiNaddr}
						detailsPublicationLabel="Article"
						detailsNpub={npub}
						detailsPubkey={wikiEvent.pubkey ?? ''}
						detailsRawData={(() => {
							const c = { ...wikiEvent };
							delete c._tags;
							return c;
						})()}
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
						{profilesLoading}
						pubkeyToNpub={(/** @type {string} */ pk) => (pk ? nip19.npubEncode(pk) : '')}
						{searchProfiles}
						{searchEmojis}
						labelEntries={[]}
						labelsLoading={false}
						onCommentSubmit={handleCommentSubmit}
						onZapReceived={refetchZaps}
						onGetStarted={() => goto('/')}
					/>
				</div>
			</div>
		</div>
	{/if}

	{#if wikiEvent && zapTarget && getIsSignedIn()}
		<BottomBar
			{publisherName}
			contentType="wiki"
			{zapTarget}
			otherZaps={[]}
			isSignedIn={getIsSignedIn()}
			onGetStarted={() => goto('/')}
			{searchProfiles}
			{searchEmojis}
			oncommentSubmit={handleCommentSubmit}
			onzapReceived={refetchZaps}
			onoptions={() => {}}
			eventId={wikiEvent?.id ?? ''}
			authorPubkey={wikiEvent?.pubkey ?? ''}
			communityPubkey={communityPubkeyState}
			relays={communityRelays}
		/>
	{/if}
</div>

<WikiModal
	bind:isOpen={editModalOpen}
	initialData={editInitialData}
	{getCurrentPubkey}
	{searchProfiles}
	{searchEmojis}
	onsubmit={handleEditSubmit}
	onclose={() => (editModalOpen = false)}
/>

<style>
	.wiki-detail {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}

	.detail-header-wrap {
		flex-shrink: 0;
	}

	.content-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding-bottom: 120px;
	}

	.content-inner {
		padding: 0 16px 16px;
		max-width: 100%;
	}

	/* Title + slug on one line */
	.title-row {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin: 12px 0 8px;
	}

	/* Summary panel */
	.wiki-summary-panel {
		background: hsl(var(--gray33));
		border-radius: 12px;
		padding: 6px 14px;
		margin-bottom: 14px;
	}

	/* Markdown body */
	.wiki-body-wrap {
		margin-bottom: 4px;
	}

	/* Social tabs */
	.social-tabs-wrap {
		margin-top: 8px;
	}

	.wiki-title {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0;
		line-height: 1.3;
		color: hsl(var(--foreground));
		flex: 1;
		min-width: 0;
	}

	.wiki-slug {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.75rem;
		color: hsl(var(--white33));
		font-family: var(--font-mono);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.edit-btn {
		gap: 8px;
		flex-shrink: 0;
	}

	.wiki-summary {
		font-size: 0.9375rem;
		color: hsl(var(--white66));
		line-height: 1.5;
		margin: 0;
	}

	/* ── Description / body ───────────────────────────────────────────── */
	.description-container {
		position: relative;
		margin-bottom: 0.5rem;
	}

	.description-container:not(.expanded) .wiki-body {
		max-height: 400px;
		overflow: hidden;
	}

	.description-container.expanded .wiki-body {
		max-height: none;
	}

	.wiki-body {
		line-height: 1.6;
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
	}

	/* ── Read-more / Show-less ────────────────────────────────────────── */
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

	.read-more-btn:hover {
		transform: scale(1.025);
	}
	.read-more-btn:active {
		transform: scale(0.98);
	}

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

	.show-less-btn:hover {
		transform: scale(1.025);
	}
	.show-less-btn:active {
		transform: scale(0.98);
	}
</style>

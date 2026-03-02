<script lang="js">
	import { nip19 } from 'nostr-tools';
	import {
		queryEvent,
		queryEvents,
		liveQuery,
		fetchForumPostComments,
		fetchZapsByEventIds,
		parseForumPost,
		parseProfile,
		parseComment,
		parseZapReceipt,
		publishComment,
		fetchProfilesBatch,
		parseCommunity,
		parseProfileList,
		fetchProfileListFromRelays,
		fetchLabelEvents
	} from '$lib/nostr';
	import { EVENT_KINDS, DEFAULT_COMMUNITY_RELAYS } from '$lib/config';
	import { renderMarkdown } from '$lib/utils/markdown';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import DetailHeader from '$lib/components/layout/DetailHeader.svelte';
	import SocialTabs from '$lib/components/social/SocialTabs.svelte';
	import BottomBar from '$lib/components/social/BottomBar.svelte';
	import { getCurrentPubkey, getIsSignedIn, signEvent } from '$lib/stores/auth.svelte.js';
	import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
	import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
	import { goto } from '$app/navigation';

	let { eventId = '', communityNpub = '', onBack = () => {} } = $props();

	let post = $state(null);
	let rawPostEvent = $state(null);
	let authorProfile = $state(null);
	let communityName = $state('');
	let communityPicture = $state('');
	let descriptionExpanded = $state(false);
	let isTruncated = $state(false);
	let comments = $state([]);
	let commentsLoading = $state(false);
	let commentsError = $state('');
	let zaps = $state([]);
	let zapsLoading = $state(false);
	let profiles = $state({});
	let profilesLoading = $state(false);
	let zapperProfiles = $state(new Map());
	let getStartedModalOpen = $state(false);
	/** @type {{ mainRelay: string|null, relays: string[], enforcedRelays: string[], mainRelayEnforced: boolean, sections: any[] } | null} */
	let communityDef = $state(null);
	// Reactive: uses community-specific relays once the 10222 event is parsed, falls back to defaults
	const communityRelays = $derived(
		communityDef?.relays?.length ? communityDef.relays : DEFAULT_COMMUNITY_RELAYS
	);
	/** @type {Array<{ label: string, pubkeys: string[] }>} */
	let labelEntries = $state([]);
	let labelsLoading = $state(false);

	$effect(() => {
		if (!communityNpub || !eventId) {
			post = null;
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
		(async () => {
			const raw = await queryEvent({
				kinds: [EVENT_KINDS.FORUM_POST],
				ids: [eventId],
				'#h': [communityPubkey]
			});
			if (raw) {
				rawPostEvent = raw;
				post = parseForumPost(raw);
				const [profileEvent, communityEv, communityProfileEv] = await Promise.all([
					queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [raw.pubkey], limit: 1 }),
					queryEvent({ kinds: [EVENT_KINDS.COMMUNITY], authors: [communityPubkey], limit: 1 }),
					queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [communityPubkey], limit: 1 })
				]);
			authorProfile = profileEvent ? parseProfile(profileEvent) : null;
			// Parse community definition for relay info (enforcement, profile lists)
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
			} else {
				post = null;
				rawPostEvent = null;
				authorProfile = null;
			}
		})();
	});

	// Comments from Dexie (NIP-22 kind 1111 only) — live-reactive, backfilled from community relays
	$effect(() => {
		const pid = post?.id;
		const relays = communityRelays; // reactive: re-runs when communityDef loads
		if (!pid) {
			comments = [];
			return;
		}
		commentsLoading = true;
		const sub = liveQuery(async () => {
			const events = await queryEvents({
				kinds: [1111],
				'#e': [pid],
				limit: 500
			});
			return events.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
		}).subscribe({
			next: (events) => {
				comments = (events ?? []).map((e) => {
					const p = parseComment(e);
					p.npub = nip19.npubEncode(e.pubkey);
					return p;
				});
				commentsLoading = false;
				commentsError = '';
				const pubkeys = [...new Set(comments.map((c) => c.pubkey).filter(Boolean))];
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
		// Backfill from community relays so we have latest from network (writes to Dexie → liveQuery will update)
		fetchForumPostComments(pid, { relays })
			.then(() => {})
			.catch(() => {});
		return () => sub.unsubscribe();
	});

	$effect(() => {
		const relays = communityRelays; // reactive: uses community relays once communityDef loads
		if (!post?.id) return;
		(async () => {
			zapsLoading = true;
			try {
				const events = await fetchZapsByEventIds([post.id], { relays });
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

	// Labels: merge self-labels (t tags) with kind 1985 events from the community relay
	$effect(() => {
		const pid = post?.id;
		const postPubkey = post?.pubkey;
		const selfLabels = post?.labels ?? [];
		const cpk = post?.communityPubkey;
		if (!pid || !cpk) {
			labelEntries = [];
			return;
		}
		labelsLoading = true;
		(async () => {
			try {
				/** @type {Map<string, Set<string>>} label → set of labeler pubkeys */
				const labelMap = new Map();

				// Self-labels from the post's own t tags (author only)
				for (const label of selfLabels) {
					if (!labelMap.has(label)) labelMap.set(label, new Set());
					if (postPubkey) labelMap.get(label)?.add(postPubkey);
				}

				// Determine community relays and whether the main one is enforced
				const def = communityDef;
				const relayUrls = def?.relays?.length ? def.relays : DEFAULT_COMMUNITY_RELAYS;
				const enforced = def?.mainRelayEnforced ?? false;

				/** @type {string[]} */
				let allowedPubkeys = [];
				if (!enforced) {
					// Non-enforced relay: restrict to General profile list members + post author
					const generalSection = def?.sections?.find((s) => s.name === 'General');
					if (generalSection?.profileListAddress) {
						const listEvent = await fetchProfileListFromRelays(relayUrls, generalSection.profileListAddress);
						if (listEvent) {
							const list = parseProfileList(listEvent);
							allowedPubkeys = list?.members ?? [];
						}
					}
					// Always include post author and community pubkey as allowed labelers
					allowedPubkeys = [...new Set([...allowedPubkeys, ...(postPubkey ? [postPubkey] : []), cpk])];
				}

				// Fetch kind 1985 events referencing this post
				const labelEvents = await fetchLabelEvents(relayUrls, pid, cpk, { enforced, allowedPubkeys });

				// Parse l tags from each label event
				for (const ev of labelEvents) {
					const lTags = ev.tags.filter((t) => t[0] === 'l' && t[1]);
					for (const lt of lTags) {
						const lv = lt[1];
						if (!labelMap.has(lv)) labelMap.set(lv, new Set());
						labelMap.get(lv)?.add(ev.pubkey);
					}
				}

				// Resolve profiles for all labeler pubkeys (merge into existing profiles state)
				const allLabelerPubkeys = [...new Set([...labelMap.values()].flatMap((s) => [...s]))];
				if (allLabelerPubkeys.length > 0) {
					const batch = await fetchProfilesBatch(allLabelerPubkeys);
					const next = { ...profiles };
					for (const [pk, ev] of batch) {
						if (!ev?.content) continue;
						try {
							const c = JSON.parse(ev.content);
							next[pk] = { displayName: c.display_name ?? c.name, name: c.name, picture: c.picture };
						} catch { /* skip malformed */ }
					}
					profiles = next;
				}

				// Build the sorted label entries (self-labels first, then others alphabetically)
				const entries = [...labelMap.entries()].map(([label, pubkeys]) => ({
					label,
					pubkeys: [...pubkeys]
				}));
				// Sort: self-labeled (post author in pubkeys) first, then alphabetical
				entries.sort((a, b) => {
					const aHasSelf = postPubkey ? a.pubkeys.includes(postPubkey) : false;
					const bHasSelf = postPubkey ? b.pubkeys.includes(postPubkey) : false;
					if (aHasSelf !== bHasSelf) return aHasSelf ? -1 : 1;
					return a.label.localeCompare(b.label);
				});
				labelEntries = entries;
			} catch (err) {
				console.error('[ForumPostDetail] Failed to load label events:', err);
			} finally {
				labelsLoading = false;
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

	const descriptionHtml = $derived(post?.content ? renderMarkdown(post.content) : '');
	const npub = $derived(
		post?.pubkey
			? (() => {
					try {
						return nip19.npubEncode(post.pubkey);
					} catch {
						return '';
					}
				})()
			: ''
	);
	const postNevent = $derived(
		post?.id
			? (() => {
					try {
						return nip19.neventEncode({ id: post.id });
					} catch {
						return '';
					}
				})()
			: ''
	);

	const zapTarget = $derived(
		post
			? {
					name: post.title,
					pubkey: post.pubkey,
					id: post.id,
					pictureUrl: authorProfile?.picture
				}
			: null
	);

	const publisherName = $derived(authorProfile?.displayName ?? authorProfile?.name ?? 'Author');
	const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
	const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));
	const communityPubkeyFromPost = $derived(
		(() => {
			if (!communityNpub || !eventId) return '';
			try {
				const d = nip19.decode(communityNpub);
				return d?.type === 'npub' ? d.data : '';
			} catch {
				return '';
			}
		})()
	);
	const catalogs = $derived(
		communityPubkeyFromPost
			? [
					{
						name: communityName || 'Community',
						pictureUrl: communityPicture || undefined,
						pubkey: communityPubkeyFromPost
					}
				]
			: []
	);

	async function handleCommentSubmit(e) {
		if (!post || !e?.text?.trim()) return;
		const pubkey = getCurrentPubkey();
		if (!pubkey) return;
		const parentId = e.parentId ?? null;
		const replyToPubkey = e.replyToPubkey ?? post.pubkey;
		const target = {
			contentType: 'forum',
			pubkey: post.pubkey,
			id: post.id,
			kind: EVENT_KINDS.FORUM_POST
		};
		try {
			const signed = await publishComment(
				e.text,
				target,
				signEvent,
				e.emojiTags ?? [],
				parentId,
				replyToPubkey,
				parentId ? 1111 : EVENT_KINDS.FORUM_POST,
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
		if (!post?.id) return;
		fetchZapsByEventIds([post.id], { relays: communityRelays }).then((events) => {
			zaps = events.map((e) => {
				const z = parseZapReceipt(e);
				z.id = e.id;
				return z;
			});
		});
	}
</script>

<div class="forum-post-detail">
	{#if !post && eventId}
		<EmptyState message="Loading…" minHeight={200} />
	{:else if !post}
		<EmptyState message="Post not found" minHeight={200} />
	{:else}
		<div class="detail-header-wrap">
			<DetailHeader
				publisherPic={authorProfile?.picture}
				{publisherName}
				publisherPubkey={post.pubkey}
				publisherUrl={npub ? `/profile/${npub}` : '#'}
				timestamp={post.createdAt}
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
			<h1 class="post-title">{post.title}</h1>
			<div class="description-container" class:expanded={descriptionExpanded}>
					<div class="post-description prose prose-invert max-w-none" use:checkTruncation>
						{@html descriptionHtml}
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

				<div class="social-tabs-wrap">
					<SocialTabs
						app={{}}
						mainEventIds={[post.id]}
						showDetailsTab={true}
						detailsShareableId={postNevent}
						detailsPublicationLabel="Post"
						detailsNpub={npub}
						detailsPubkey={post.pubkey ?? ''}
						detailsRawData={rawPostEvent
							? (() => {
									const c = { ...rawPostEvent };
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
						{profilesLoading}
						pubkeyToNpub={(pk) => (pk ? nip19.npubEncode(pk) : '')}
						{searchProfiles}
						{searchEmojis}
					onCommentSubmit={handleCommentSubmit}
					onZapReceived={refetchZaps}
					onGetStarted={() => (getStartedModalOpen = true)}
					{labelEntries}
					{labelsLoading}
					/>
				</div>
			</div>
		</div>

		{#if post && zapTarget}
			<BottomBar
				publisherName={authorProfile?.displayName ?? authorProfile?.name ?? ''}
				contentType="forum"
				{zapTarget}
				otherZaps={[]}
				isSignedIn={getIsSignedIn()}
				onGetStarted={() => goto('/')}
				{searchProfiles}
				{searchEmojis}
				oncommentSubmit={handleCommentSubmit}
				onzapReceived={() => {}}
				onoptions={() => {}}
			/>
		{/if}
	{/if}
</div>

<style>
	.forum-post-detail {
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding-bottom: 120px;
	}
	.detail-header-wrap {
		flex-shrink: 0;
	}
	/* Header spacer 64px; exactly 16px from header bottom to title (no double padding with panel) */
	.content-scroll {
		flex: 1;
		min-height: 0;
		padding-top: 16px;
		padding-left: 0;
		padding-right: 0;
	}
	.content-inner {
		padding-bottom: 16px;
		max-width: 100%;
	}
	.post-title {
		font-size: 1.5rem;
		font-weight: 700;
		padding-top: 0;
		margin: 0 0 6px;
		line-height: 1.3;
		color: hsl(var(--foreground));
	}
	.description-container {
		position: relative;
		margin-bottom: 0.5rem;
	}
	.description-container:not(.expanded) .post-description {
		max-height: 280px;
		overflow: hidden;
	}
	.description-container.expanded .post-description {
		max-height: none;
	}
	.post-description {
		line-height: 1.6;
		color: hsl(var(--foreground) / 0.9);
	}
	.post-description :global(p) {
		margin-top: 0.5em;
		margin-bottom: 0.5em;
	}
	.post-description :global(p:first-child) {
		margin-top: 0;
	}
	.post-description :global(p:last-child) {
		margin-bottom: 0;
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
	.social-tabs-wrap {
		margin-top: 16px;
	}
</style>

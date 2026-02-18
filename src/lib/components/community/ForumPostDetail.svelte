<script lang="js">
	import { nip19 } from 'nostr-tools';
	import {
		queryEvent,
		queryEvents,
		putEvents,
		liveQuery,
		fetchForumPostComments,
		fetchZapsByEventIds,
		parseForumPost,
		parseProfile,
		parseComment,
		parseZapReceipt,
		publishToRelays,
		fetchProfilesBatch
	} from '$lib/nostr';
	import { EVENT_KINDS } from '$lib/config';
	import { renderMarkdown } from '$lib/utils/markdown';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import LabelChip from '$lib/components/common/Label.svelte';
	import DetailHeader from '$lib/components/layout/DetailHeader.svelte';
	import SocialTabs from '$lib/components/social/SocialTabs.svelte';
	import BottomBar from '$lib/components/social/BottomBar.svelte';
	import { getCurrentPubkey, getIsSignedIn, signEvent } from '$lib/stores/auth.svelte.js';
	import { DEFAULT_COMMUNITY_RELAYS } from '$lib/config';
	import { goto } from '$app/navigation';

	let { eventId = '', communityNpub = '', onBack = () => {} } = $props();

	let post = $state(null);
	let rawPostEvent = $state(null);
	let authorProfile = $state(null);
	let communityName = $state('');
	let communityPicture = $state('');
	let descriptionExpanded = $state(false);
	let isTruncated = $state(false);
	let contentContainer = $state(null);
	let comments = $state([]);
	let commentsLoading = $state(false);
	let commentsError = $state('');
	let zaps = $state([]);
	let zapsLoading = $state(false);
	let profiles = $state({});
	let profilesLoading = $state(false);
	let zapperProfiles = $state(new Map());
	let getStartedModalOpen = $state(false);

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

	// Comments from Dexie (same source as forum card commenters) so user's own comment and all subscribed comments show
	$effect(() => {
		const pid = post?.id;
		if (!pid) {
			comments = [];
			return;
		}
		commentsLoading = true;
		const sub = liveQuery(async () => {
			const events = await queryEvents({
				kinds: [1],
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
									next[pk] = { displayName: c.display_name ?? c.name, name: c.name, picture: c.picture };
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
		// Backfill from relays so we have latest from network (writes to Dexie → liveQuery will update)
		fetchForumPostComments(pid).then(() => {}).catch(() => {});
		return () => sub.unsubscribe();
	});

	$effect(() => {
		if (!post?.id) return;
		(async () => {
			zapsLoading = true;
			try {
				const events = await fetchZapsByEventIds([post.id]);
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
							next.set(pk, { displayName: c.display_name ?? c.name, name: c.name, picture: c.picture });
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

	$effect(() => {
		if (!contentContainer || !post?.content) return;
		isTruncated = contentContainer.scrollHeight > 150;
	});

	const descriptionHtml = $derived(post?.content ? renderMarkdown(post.content) : '');
	const npub = $derived(
		post?.pubkey ? (() => { try { return nip19.npubEncode(post.pubkey); } catch { return ''; } })() : ''
	);
	const postNevent = $derived(
		post?.id ? (() => { try { return nip19.neventEncode({ id: post.id }); } catch { return ''; } })() : ''
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
	const communityPubkeyFromPost = $derived((() => {
		if (!communityNpub || !eventId) return '';
		try {
			const d = nip19.decode(communityNpub);
			return d?.type === 'npub' ? d.data : '';
		} catch { return ''; }
	})());
	const catalogs = $derived(
		communityPubkeyFromPost
			? [{ name: communityName || 'Community', pictureUrl: communityPicture || undefined, pubkey: communityPubkeyFromPost }]
			: []
	);

	async function handleCommentSubmit(e) {
		if (!post || !e?.text?.trim()) return;
		const pubkey = getCurrentPubkey();
		if (!pubkey) return;
		try {
			const ev = await signEvent({
				kind: 1,
				content: e.text.trim(),
				tags: [
					['e', post.id],
					['p', post.pubkey]
				],
				created_at: Math.floor(Date.now() / 1000)
			});
			await putEvents([ev]);
			await publishToRelays(DEFAULT_COMMUNITY_RELAYS, ev);
			const parsed = parseComment(ev);
			parsed.npub = nip19.npubEncode(ev.pubkey);
			comments = [...comments, parsed];
		} catch (err) {
			console.error('Comment submit failed', err);
		}
	}

	function refetchZaps() {
		if (!post?.id) return;
		fetchZapsByEventIds([post.id]).then((events) => {
			zaps = events.map((e) => {
				const z = parseZapReceipt(e);
				z.id = e.id;
				return z;
			});
		});
	}

	async function searchProfiles() {
		return [];
	}
	async function searchEmojis() {
		return [];
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
				publisherName={publisherName}
				publisherPubkey={post.pubkey}
				publisherUrl={npub ? `/profile/${npub}` : '#'}
				timestamp={post.createdAt}
				catalogs={catalogs}
				catalogText="Community"
				showPublisher={true}
				showMenu={false}
				showBackButton={true}
				onBack={onBack}
				scrollThreshold={undefined}
				bind:getStartedModalOpen
			/>
		</div>

		<div class="content-scroll">
			<div class="content-inner">
				<h1 class="post-title">{post.title}</h1>
				<div
					class="description-container"
					class:expanded={descriptionExpanded}
					bind:this={contentContainer}
				>
					<div class="post-description prose prose-invert max-w-none">
						{@html descriptionHtml}
					</div>
					{#if isTruncated && !descriptionExpanded}
						<div class="description-fade" aria-hidden="true"></div>
					{/if}
					{#if isTruncated}
						<button
							type="button"
							class="read-more-btn"
							onclick={() => (descriptionExpanded = !descriptionExpanded)}
						>
							{descriptionExpanded ? 'Show less' : 'Read more'}
						</button>
					{/if}
				</div>
				{#if (post.labels ?? []).length > 0}
					<div class="post-detail-labels">
						{#each (post.labels ?? []) as label}
							<div class="post-detail-label-slot">
								<LabelChip text={label} isSelected={false} isEmphasized={false} size="small" />
							</div>
						{/each}
					</div>
				{/if}

				<div class="social-tabs-wrap">
					<SocialTabs
						app={{}}
						mainEventIds={[post.id]}
						showDetailsTab={true}
						detailsShareableId={postNevent}
						detailsPublicationLabel="Post"
						detailsNpub={npub}
						detailsPubkey={post.pubkey ?? ''}
						detailsRawData={rawPostEvent ? (() => { const c = { ...rawPostEvent }; delete c._tags; return c; })() : null}
						comments={comments}
						commentsLoading={commentsLoading}
						commentsError={commentsError}
						zaps={zaps.map((z) => ({
							id: z.id,
							senderPubkey: z.senderPubkey || undefined,
							amountSats: z.amountSats,
							createdAt: z.createdAt,
							comment: z.comment,
							emojiTags: z.emojiTags ?? [],
							zappedEventId: z.zappedEventId ?? undefined
						}))}
						zapsLoading={zapsLoading}
						zapperProfiles={zapperProfiles}
						profiles={profiles}
						profilesLoading={profilesLoading}
						pubkeyToNpub={(pk) => (pk ? nip19.npubEncode(pk) : '')}
						searchProfiles={searchProfiles}
						searchEmojis={searchEmojis}
						onCommentSubmit={handleCommentSubmit}
						onZapReceived={refetchZaps}
						onGetStarted={() => (getStartedModalOpen = true)}
					/>
				</div>
			</div>
		</div>

		{#if post && zapTarget}
			<BottomBar
				publisherName={authorProfile?.displayName ?? authorProfile?.name ?? ''}
				contentType="forum"
				zapTarget={zapTarget}
				otherZaps={[]}
				isSignedIn={getIsSignedIn()}
				onGetStarted={() => goto('/')}
				searchProfiles={searchProfiles}
				searchEmojis={searchEmojis}
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
	/* Header spacer (64px) is in DetailHeader; only 16px gap below it to title */
	.content-scroll {
		flex: 1;
		min-height: 0;
		padding-top: 16px;
	}
	.content-inner {
		padding: 16px;
		padding-top: 0;
	}
	.post-title {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0 0 1rem;
		padding-top: 0;
		line-height: 1.3;
		color: hsl(var(--foreground));
	}
	.description-container {
		position: relative;
	}
	.description-container:not(.expanded) .post-description {
		max-height: 150px;
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
	.description-fade {
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
		margin-top: 1rem;
	}
	.post-detail-label-slot {
		display: inline-flex;
		flex-shrink: 0;
	}
	.social-tabs-wrap {
		margin-top: 1.5rem;
	}
</style>

<script lang="js">
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
		parseCommunity
	} from '$lib/nostr';
	import { EVENT_KINDS, DEFAULT_COMMUNITY_RELAYS } from '$lib/config';
	import { renderMarkdown } from '$lib/utils/markdown';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import DetailHeader from '$lib/components/layout/DetailHeader.svelte';
	import SocialTabs from '$lib/components/social/SocialTabs.svelte';
	import BottomBar from '$lib/components/social/BottomBar.svelte';
	import TaskBox from '$lib/components/common/TaskBox.svelte';
	import PriorityBox from '$lib/components/common/PriorityBox.svelte';
	import ProfilePicStack from '$lib/components/common/ProfilePicStack.svelte';
	import { getCurrentPubkey, getIsSignedIn, signEvent } from '$lib/stores/auth.svelte.js';
	import { createSearchProfilesFunction } from '$lib/services/profile-search.js';
	import { createSearchEmojisFunction } from '$lib/services/emoji-search.js';
	import { goto } from '$app/navigation';

	let { eventId = '', communityNpub = '', onBack = () => {} } = $props();

	/** @type {any} */
	let task = $state(null);
	/** @type {any} */
	let rawTaskEvent = $state(null);
	/** @type {any} */
	let authorProfile = $state(null);
	/** @type {any} */
	let statusEvent = $state(null);
	let communityName = $state('');
	let communityPicture = $state('');
	let descriptionExpanded = $state(false);
	let isTruncated = $state(false);
	let comments = $state(/** @type {any[]} */([]));
	let commentsLoading = $state(false);
	let commentsError = $state('');
	let zaps = $state(/** @type {any[]} */([]));
	let zapsLoading = $state(false);
	let profiles = $state(/** @type {Record<string, any>} */({}));
	let zapperProfiles = $state(new Map());
	let getStartedModalOpen = $state(false);
	/** @type {any} */
	let communityDef = $state(null);
	/** @type {{ pubkey: string; name?: string; pictureUrl?: string }[]} */
	let assigneeProfiles = $state([]);

	const communityRelays = $derived(
		communityDef?.relays?.length ? communityDef.relays : DEFAULT_COMMUNITY_RELAYS
	);

	/** @type {Record<string,string>} */
	const SPEC_TO_CAMEL = {
		'open': 'open', 'backlog': 'backlog',
		'in-progress': 'inProgress', 'in-review': 'inReview', 'closed': 'closed'
	};

	const taskStatus = $derived((() => {
		if (!statusEvent) return 'open';
		const spec = statusEvent.tags?.find((t) => t[0] === 'status')?.[1] ?? 'open';
		return SPEC_TO_CAMEL[spec] ?? 'open';
	})());

	const taskPriority = $derived(
		statusEvent?.tags?.find((t) => t[0] === 'priority')?.[1] ?? 'none'
	);

	const taskTitle = $derived(task?.tags?.find((t) => t[0] === 'title')?.[1] ?? '');
	const taskLabels = $derived(task?.tags?.filter((t) => t[0] === 't').map((t) => t[1]) ?? []);

	// Labels formatted for the SocialTabs Labels tab (same shape as forum post labelEntries)
	const taskLabelEntries = $derived(
		taskLabels.map((l) => ({ label: l, pubkeys: task?.pubkey ? [task.pubkey] : [] }))
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
		} catch { return; }

		(async () => {
			// Query by id only (task events may be addressed, not easily filtered by #h in all impls)
			const raw = await queryEvent({ kinds: [EVENT_KINDS.TASK], ids: [eventId] })
				?? await queryEvent({ kinds: [EVENT_KINDS.TASK], '#h': [communityPubkey] });

			if (raw && raw.id === eventId) {
				rawTaskEvent = raw;
				task = raw;

				// Load status event
				const dTag = raw.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
				const addr = `${EVENT_KINDS.TASK}:${raw.pubkey}:${dTag}`;
				const statusEvs = await queryEvents({ kinds: [EVENT_KINDS.STATUS], '#a': [addr], limit: 50 });
				if (statusEvs.length > 0) {
					statusEvent = statusEvs.reduce((a, b) => (b.created_at > a.created_at ? b : a));
				}

				// Load author + community info in parallel
				const [profileEv, communityEv, communityProfileEv] = await Promise.all([
					queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [raw.pubkey], limit: 1 }),
					queryEvent({ kinds: [EVENT_KINDS.COMMUNITY], authors: [communityPubkey], limit: 1 }),
					queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [communityPubkey], limit: 1 })
				]);
				authorProfile = profileEv ? parseProfile(profileEv) : null;
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

				// Load assignee profiles
				const assigneePubkeys = raw.tags?.filter((t) => t[0] === 'p' && t[2] === 'assignee').map((t) => t[1]) ?? [];
				if (assigneePubkeys.length > 0) {
					const batch = await fetchProfilesBatch(assigneePubkeys);
					assigneeProfiles = assigneePubkeys.map((pk) => {
						const ev = batch.get(pk);
						const c = ev?.content ? (() => { try { return JSON.parse(ev.content); } catch { return {}; } })() : {};
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

	// Comments (NIP-22 kind 1111) — live from Dexie + backfill from relays
	$effect(() => {
		const tid = task?.id;
		const relays = communityRelays;
		if (!tid) { comments = []; return; }
		commentsLoading = true;
		const sub = liveQuery(async () => {
			const events = await queryEvents({ kinds: [1111], '#e': [tid], limit: 500 });
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
			error: () => { commentsLoading = false; commentsError = 'Failed to load comments'; }
		});
		fetchForumPostComments(tid, { relays }).then(() => {}).catch(() => {});
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

	/** @param {HTMLElement} node */
	function checkTruncation(node) {
		const check = () => { isTruncated = node.scrollHeight > node.clientHeight; };
		setTimeout(check, 0);
		const ro = new ResizeObserver(() => { if (!descriptionExpanded) check(); });
		ro.observe(node);
		return { destroy() { ro.disconnect(); } };
	}

	const descriptionHtml = $derived(task?.content ? renderMarkdown(task.content) : '');

	const npub = $derived(
		task?.pubkey ? (() => { try { return nip19.npubEncode(task.pubkey); } catch { return ''; } })() : ''
	);

	const taskNaddr = $derived((() => {
		if (!task) return '';
		const dTag = task.tags?.find((t) => t[0] === 'd')?.[1] ?? '';
		try {
			return nip19.naddrEncode({ kind: EVENT_KINDS.TASK, pubkey: task.pubkey, identifier: dTag });
		} catch { return ''; }
	})());

	const zapTarget = $derived(
		task ? { name: taskTitle, pubkey: task.pubkey, id: task.id, pictureUrl: authorProfile?.picture } : null
	);

	const publisherName = $derived(authorProfile?.displayName ?? authorProfile?.name ?? 'Author');
	const searchProfiles = $derived(createSearchProfilesFunction(() => getCurrentPubkey()));
	const searchEmojis = $derived(createSearchEmojisFunction(() => getCurrentPubkey()));

	const communityPubkeyFromNpub = $derived((() => {
		try { const d = nip19.decode(communityNpub); return d?.type === 'npub' ? d.data : ''; } catch { return ''; }
	})());

	const catalogs = $derived(
		communityPubkeyFromNpub
			? [{ name: communityName || 'Community', pictureUrl: communityPicture || undefined, pubkey: communityPubkeyFromNpub }]
			: []
	);

	async function handleCommentSubmit(e) {
		if (!task || !e?.text?.trim()) return;
		const pubkey = getCurrentPubkey();
		if (!pubkey) return;
		const parentId = e.parentId ?? null;
		const replyToPubkey = e.replyToPubkey ?? task.pubkey;
		const target = { contentType: 'task', pubkey: task.pubkey, id: task.id, kind: EVENT_KINDS.TASK };
		try {
			const signed = await publishComment(
				e.text, target, signEvent, e.emojiTags ?? [], parentId, replyToPubkey,
				parentId ? 1111 : EVENT_KINDS.TASK, e.mentions ?? []
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
			zaps = events.map((e) => { const z = parseZapReceipt(e); z.id = e.id; return z; });
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

				<!-- Title row: TaskBox | title | PriorityBox — mirrors feed card layout -->
				<div class="task-title-row">
					<div class="taskbox-col">
						<TaskBox state={taskStatus} size={28} />
					</div>
					<h1 class="task-title">{taskTitle}</h1>
					<div class="priority-col">
						<PriorityBox priority={taskPriority} size={24} />
					</div>
				</div>

				<!-- L-shape row: targets + assignees, aligned under the TaskBox -->
				{#if assigneeProfiles.length > 0}
					<div class="task-bottom-row">
						<div class="connector-col">
							<svg viewBox="0 0 22 24" width="22" height="24" fill="none" aria-hidden="true">
								<path
									d="M1 0 L1 11 Q1 23 10 23 L22 23"
									stroke="hsl(var(--white16))"
									stroke-width="1.5"
									fill="none"
								/>
							</svg>
						</div>
					<div class="bottom-items">
						<ProfilePicStack
							profiles={assigneeProfiles}
							text={assigneeProfiles.length === 1
								? (assigneeProfiles[0].name || assigneeProfiles[0].pubkey.slice(0, 8))
								: `${assigneeProfiles.length} assignees`}
							size="xs"
						/>
					</div>
					</div>
				{/if}

				{#if task.content?.trim()}
					<div class="description-container" class:expanded={descriptionExpanded}>
						<div class="task-description prose prose-invert max-w-none" use:checkTruncation>
							{@html descriptionHtml}
						</div>
						{#if isTruncated && !descriptionExpanded}
							<div class="description-fade" aria-hidden="true"></div>
							<button type="button" class="read-more-btn" onclick={() => (descriptionExpanded = true)}>
								Read more
							</button>
						{/if}
						{#if descriptionExpanded}
							<button type="button" class="show-less-btn" onclick={() => (descriptionExpanded = false)}>
								Show less
							</button>
						{/if}
					</div>
				{/if}

				<div class="social-tabs-wrap">
					<SocialTabs
						app={{}}
						mainEventIds={[task.id]}
						showDetailsTab={true}
						detailsShareableId={taskNaddr}
						detailsPublicationLabel="Task"
						detailsNpub={npub}
						detailsPubkey={task.pubkey ?? ''}
						detailsRawData={rawTaskEvent
							? (() => { const c = { ...rawTaskEvent }; delete c._tags; return c; })()
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

		{#if task && zapTarget}
			<BottomBar
				publisherName={authorProfile?.displayName ?? authorProfile?.name ?? ''}
				contentType="task"
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
		padding-top: 16px;
	}

	.content-inner {
		padding-bottom: 16px;
		max-width: 100%;
	}

	/* ── Title row: mirrors TaskCard row-main but larger ── */
	.task-title-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 0;
	}

	.taskbox-col {
		width: 28px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.task-title {
		flex: 1;
		min-width: 0;
		font-size: 1.375rem;
		font-weight: 700;
		margin: 0;
		line-height: 1.3;
		color: hsl(var(--foreground));
	}

	.priority-col {
		flex-shrink: 0;
		display: flex;
		align-items: center;
	}

	/* ── L-shape bottom row: mirrors TaskCard row-bottom ── */
	/*
	 * margin-left = half TaskBox width (28/2 = 14px) so connector aligns
	 * with the centre of the TaskBox above.
	 */
	.task-bottom-row {
		display: flex;
		align-items: flex-start;
		margin-left: 14px;
		margin-bottom: 14px;
		width: calc(100% - 14px);
	}

	.connector-col {
		width: 22px;
		flex-shrink: 0;
		display: flex;
		align-items: flex-start;
	}

	.bottom-items {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		min-width: 0;
		padding-top: 8px;
	}


	/* Description */
	.description-container {
		position: relative;
		margin-bottom: 0.5rem;
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
		color: hsl(var(--foreground) / 0.9);
	}

	.task-description :global(p) { margin-top: 0.5em; margin-bottom: 0.5em; }
	.task-description :global(p:first-child) { margin-top: 0; }
	.task-description :global(p:last-child) { margin-bottom: 0; }

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
	.show-less-btn:hover { transform: scale(1.025); }
	.read-more-btn:active,
	.show-less-btn:active { transform: scale(0.98); }

	.social-tabs-wrap {
		margin-top: 16px;
	}
</style>

<script lang="js">
	/**
	 * WikiDetail — full article view for a kind:30818 wiki event.
	 *
	 * Mirrors ForumPostDetail:
	 *   - DetailHeader with author info + community catalog on the right
	 *   - Read-more / show-less truncation
	 *   - SocialTabs (Details tab with raw event; Comments/Zaps empty for now)
	 *   - White body text, code blocks matching DetailsTab, visible bullet markers
	 */
	import { nip19 } from 'nostr-tools';
	import {
		queryEvents,
		queryEvent,
		parseProfile,
		fetchProfilesBatch,
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

	/** @type {{ slug?: string, eventId?: string, communityNpub?: string, wikiLinkFn?: (slug: string) => string, onBack?: () => void }} */
	let {
		slug = '',
		eventId = '',
		communityNpub = '',
		/** Converts a [[slug]] to a URL. Override per context (desktop vs mobile). */
		wikiLinkFn = (s) => `#${s}`,
		onBack = () => {}
	} = $props();

	/** @type {any} */
	let wikiEvent = $state(null);
	/** @type {any} */
	let authorProfile = $state(null);
	let loading = $state(true);
	let descriptionExpanded = $state(false);
	let isTruncated = $state(false);
	let communityName = $state('');
	let communityPicture = $state('');
	let communityPubkeyState = $state('');

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

	$effect(() => {
		if (!communityNpub) {
			loading = false;
			return;
		}
		let communityPubkey = '';
		try {
			const decoded = nip19.decode(communityNpub);
			if (decoded.type === 'npub') communityPubkey = decoded.data;
		} catch {
			loading = false;
			return;
		}

		(async () => {
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
				const candidates = await queryEvents({
					kinds: [EVENT_KINDS.WIKI],
					'#d': [slug],
					'#h': [communityPubkey],
					limit: 10
				});
				// Prefer same-author match; fall back to most recent
				ev = candidates.find((e) => e.pubkey === communityPubkey) ?? candidates[0] ?? null;
			}

			// If not in Dexie, fetch from relays
			if (!ev) {
				const relays = DEFAULT_COMMUNITY_RELAYS;
				const filter = eventId
					? { kinds: [EVENT_KINDS.WIKI], ids: [eventId], limit: 1 }
					: { kinds: [EVENT_KINDS.WIKI], '#d': [slug], '#h': [communityPubkey], limit: 10 };
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
						<span class="wiki-slug">/{wikiSlug}</span>
					{/if}
					{#if isOwnWiki && getIsSignedIn()}
						<button
							type="button"
							class="edit-btn"
							onclick={() => (editModalOpen = true)}
							aria-label="Edit wiki"
						>
							<Pen variant="outline" color="hsl(var(--white66))" size={14} />
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
						<div class="wiki-body" use:checkTruncation>
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
						comments={[]}
						commentsLoading={false}
						commentsError=""
						zaps={[]}
						zapsLoading={false}
						zapperProfiles={new Map()}
						profiles={{}}
						profilesLoading={false}
						pubkeyToNpub={(/** @type {string} */ pk) => (pk ? nip19.npubEncode(pk) : '')}
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
	{/if}

	{#if wikiEvent && zapTarget && getIsSignedIn()}
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
		font-size: 0.75rem;
		color: hsl(var(--white33));
		font-family: var(--font-mono);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.edit-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin-left: auto;
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
		transition:
			background 0.15s ease,
			transform 0.15s ease;
	}

	.edit-btn:hover {
		background: hsl(var(--white16));
	}

	.edit-btn:active {
		transform: scale(0.96);
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

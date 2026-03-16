<script lang="js">
// @ts-nocheck
/**
 * CommentCard — Activity feed card for kind:1111 comments.
 *
 * Layout (2-column flex):
 *
 *   left-col                   right-col
 *   ──────────────────         ──────────────────────────
 *   [emoji-badge 24px]         root-label text (same row, aligned)
 *   │  ← dotted (only when isReply)
 *   │  ← solid (always)
 *   [avatar]                   [bubble]
 *                                ┌─ QuotedMessage ─┐  ← only when isReply
 *                                └─────────────────┘
 *                                comment text
 *
 * The vertical line starts from the bottom edge of the emoji-badge and ends
 * touching the top of the avatar — never gapped.
 *
 * Bubble width is driven by the content text only. The QuotedMessage is
 * wrapped in a sizing-neutral div (width:0; min-width:100%) so it never
 * forces the bubble wider than the actual message text.
 */
import { nip19 } from 'nostr-tools';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import Timestamp from '$lib/components/common/Timestamp.svelte';
import ShortTextRenderer from '$lib/components/common/ShortTextRenderer.svelte';
import QuotedMessage from '$lib/components/social/QuotedMessage.svelte';
import { getEventOneliner } from '$lib/nostr/models.js';
import { hexToColor, getProfileTextColor, rgbToCssString } from '$lib/utils/color.js';
import { onMount } from 'svelte';

let {
	/** @type {import('nostr-tools').NostrEvent} */
	event,
	/** @type {{ name?: string, picture?: string, pubkey: string } | null} */
	authorProfile = null,
	/** @type {import('nostr-tools').NostrEvent | null} */
	rootEvent = null,
	/** @type {import('nostr-tools').NostrEvent | null} */
	parentComment = null,
	/** @type {{ name?: string, picture?: string, pubkey: string } | null} */
	parentCommentAuthor = null,
	profileUrl = '',
	className = '',
	/** @type {((slug: string) => string) | undefined} */
	wikiLinkFn = undefined,
	/** @type {((pubkey: string) => string) | undefined} */
	resolveMentionLabel = undefined
} = $props();

// True when this comment is a reply to another comment (not a direct reply on the root event).
// NIP-22: uppercase E/A = root marker, lowercase e/a = direct parent.
const isReply = $derived.by(() => {
	if (!event?.tags) return false;
	const upperRoot = event.tags.find((t) => (t[0] === 'E' || t[0] === 'A') && t[1]);
	const lowerParent = event.tags.find((t) => (t[0] === 'e' || t[0] === 'a') && t[1]);
	if (!lowerParent) return false;
	return upperRoot ? lowerParent[1] !== upperRoot[1] : true;
});

const showQuote = $derived(isReply && !!parentComment);

const rootOneliner = $derived(getEventOneliner(rootEvent));

// Emoji tags for ShortTextRenderer — extracted from the raw Nostr event tags
const emojiTags = $derived(
	(event?.tags ?? [])
		.filter((t) => t[0] === 'emoji' && t[1] && t[2])
		.map((t) => ({ shortcode: t[1], url: t[2] }))
);

function formatNpub(pk) {
	if (!pk) return '';
	try {
		const enc = nip19.npubEncode(pk);
		return `npub1${enc.slice(5, 8)}…${enc.slice(-6)}`;
	} catch {
		return pk.slice(0, 8) + '…';
	}
}

const displayName = $derived(
	authorProfile?.name?.trim() ||
		authorProfile?.displayName?.trim() ||
		(event?.pubkey ? formatNpub(event.pubkey) : '')
);

const parentDisplayName = $derived(
	parentCommentAuthor?.name?.trim() ||
		parentCommentAuthor?.displayName?.trim() ||
		(parentComment?.pubkey ? formatNpub(parentComment.pubkey) : '')
);

// Plain-text preview for QuotedMessage (strip nostr: refs for brevity)
const parentContentPreview = $derived(
	(parentComment?.content ?? '').replace(/nostr:[a-z0-9]+/gi, '').replace(/\s+/g, ' ').trim()
);

let isDarkMode = $state(true);
onMount(() => {
	const mq = window.matchMedia('(prefers-color-scheme: dark)');
	isDarkMode = mq.matches;
	const handler = (e) => (isDarkMode = e.matches);
	mq.addEventListener('change', handler);
	return () => mq.removeEventListener('change', handler);
});

const profileColor = $derived(
	event?.pubkey ? hexToColor(event.pubkey) : { r: 128, g: 128, b: 128 }
);
const textColor = $derived(getProfileTextColor(profileColor, isDarkMode));
const nameColorStyle = $derived(rgbToCssString(textColor));

const contentText = $derived(event?.content ?? '');
</script>

<div class="comment-card {className}">
	<!--
		Left column: emoji-badge at top (aligns with root-label), then the vertical
		line runs from badge bottom all the way down to touch the avatar.
	-->
	<div class="left-col">
		<div class="emoji-badge" aria-hidden="true">
			<img src={rootOneliner.emoji} alt="" width="14" height="14" />
		</div>
		{#if isReply}
			<div class="line-dotted"></div>
		{/if}
		<div class="line-solid"></div>
		<div class="avatar-wrap">
			{#if profileUrl}
				<a href={profileUrl} class="avatar-link">
					<ProfilePic
						pictureUrl={authorProfile?.picture ?? null}
						name={authorProfile?.name ?? null}
						pubkey={event?.pubkey ?? null}
						size="smMd"
					/>
				</a>
			{:else}
				<ProfilePic
					pictureUrl={authorProfile?.picture ?? null}
					name={authorProfile?.name ?? null}
					pubkey={event?.pubkey ?? null}
					size="smMd"
				/>
			{/if}
		</div>
	</div>

	<!-- Right column: root-label aligned with emoji-badge, then the bubble -->
	<div class="right-col">
		<!-- Root event label row — no background, no border, bare text -->
		<div class="root-label-row">
			<span class="root-label">{rootOneliner.label}</span>
		</div>

		<!-- Bubble — same styling as MessageBubble -->
		<div class="bubble" class:bubble--quoted={showQuote}>
			<div class="bubble-header">
				{#if profileUrl}
					<a href={profileUrl} class="author-name" style="color: {nameColorStyle};"
						>{displayName}</a
					>
				{:else}
					<span class="author-name" style="color: {nameColorStyle};">{displayName}</span>
				{/if}
				<Timestamp timestamp={event?.created_at} size="xs" />
			</div>

			<!--
				Quote wrapper uses width:0; min-width:100% so that QuotedMessage fills
				the bubble without driving its intrinsic width. The content text remains
				the sole master of the bubble's width.
			-->
			{#if showQuote}
				<div class="quote-wrap">
					<QuotedMessage
						authorName={parentDisplayName || 'Anonymous'}
						authorPubkey={parentComment?.pubkey ?? null}
						contentPreview={parentContentPreview}
					/>
				</div>
			{/if}

			<div class="bubble-content">
				<ShortTextRenderer content={contentText} {emojiTags} {wikiLinkFn} {resolveMentionLabel} />
			</div>
		</div>
	</div>
</div>

<style>
	.comment-card {
		display: flex;
		gap: 8px;
		align-items: stretch;
	}

	/* ── Left column ─────────────────────────────────────────────── */
	.left-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex-shrink: 0;
		width: 36px;
	}

	/* 28px rounded-square badge — sits at the very top, line starts below it */
	.emoji-badge {
		width: 28px;
		height: 28px;
		border-radius: 10px;
		background: hsl(var(--white8));
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.line-dotted {
		width: 2px;
		flex: 1;
		background: repeating-linear-gradient(
			to bottom,
			hsl(var(--white16)) 0px,
			hsl(var(--white16)) 6px,
			transparent 6px,
			transparent 10px
		);
	}

	.line-solid {
		width: 2px;
		flex: 1;
		background: hsl(var(--white16));
	}

	.avatar-wrap {
		flex-shrink: 0;
	}

	.avatar-link {
		display: block;
		transition: opacity 0.15s ease;
	}
	.avatar-link:hover {
		opacity: 0.8;
	}

	/* ── Right column ────────────────────────────────────────────── */
	.right-col {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	/* Root label row — same height as emoji-badge so they align */
	.root-label-row {
		height: 28px;
		display: flex;
		align-items: center;
		min-width: 0;
	}

	.root-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--white66));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	/* ── Bubble — same as MessageBubble ──────────────────────────── */
	.bubble {
		width: fit-content;
		max-width: 100%;
		min-width: 200px;
		background-color: hsl(var(--gray66));
		border-radius: 16px 16px 16px 4px;
		padding: 8px 12px;
	}

	/* Slightly wider min-width when a QuotedMessage is present */
	.bubble--quoted {
		min-width: 260px;
	}

	.bubble-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		flex-wrap: wrap;
		margin-bottom: 4px;
	}

	.author-name {
		font-weight: 600;
		font-size: 0.875rem;
		line-height: 1.2;
		text-decoration: none;
		transition: opacity 0.15s ease;
		white-space: nowrap;
	}

	a.author-name:hover {
		opacity: 0.8;
	}

	/*
	 * quote-wrap: width:0; min-width:100% is the key trick.
	 * The element contributes zero to the bubble's fit-content width calculation
	 * (width:0 means it has no intrinsic width), but it stretches to 100% of
	 * whatever width the bubble ends up being (from the content text).
	 * This prevents QuotedMessage from ever driving the bubble wider.
	 */
	.quote-wrap {
		width: 0;
		min-width: 100%;
	}

	/* ── Comment text ────────────────────────────────────────────── */
	.bubble-content {
		font-size: 0.9375rem;
		line-height: 1.5;
		color: hsl(var(--foreground) / 0.85);
	}

	.bubble-content :global(p) {
		margin: 0;
	}

	.bubble-content :global(p + p) {
		margin-top: 0.5rem;
	}

	.bubble-content :global(a) {
		color: hsl(var(--primary));
		text-decoration: none;
	}

	.bubble-content :global(a:hover) {
		text-decoration: underline;
	}
</style>

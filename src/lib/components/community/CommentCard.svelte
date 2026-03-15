<script lang="js">
// @ts-nocheck
/**
 * CommentCard — Activity feed card for kind:1111 comments.
 *
 * Layout (2-column flex):
 *
 *   left-col           right-col
 *   ────────           ─────────────────────────────────
 *   :                  [root-row]  emoji-badge + oneliner  (no bg, no border)
 *   :  ← dotted (only when isReply — comment targets another comment, not root directly)
 *   │
 *   │  ← solid (always)
 *   [av]               [bubble]
 *                        ┌─ quote ─┐  ← only when isReply: direct parent inside bubble
 *                        └─────────┘
 *                        comment text
 *
 * When NOT a reply, the left column line is fully solid.
 */
import { nip19 } from 'nostr-tools';
import ProfilePic from '$lib/components/common/ProfilePic.svelte';
import Timestamp from '$lib/components/common/Timestamp.svelte';
import ShortTextRenderer from '$lib/components/common/ShortTextRenderer.svelte';
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
	className = ''
} = $props();

// True when this comment is a reply to another comment (not a direct reply on the root event).
// NIP-22: uppercase E/A = root marker, lowercase e/a = direct parent.
// isReply is true when there is a lowercase e/a parent tag AND it differs from the root E/A.
const isReply = $derived.by(() => {
	if (!event?.tags) return false;
	const upperRoot = event.tags.find((t) => (t[0] === 'E' || t[0] === 'A') && t[1]);
	const lowerParent = event.tags.find((t) => (t[0] === 'e' || t[0] === 'a') && t[1]);
	if (!lowerParent) return false;
	return upperRoot ? lowerParent[1] !== upperRoot[1] : true;
});

const rootOneliner = $derived(getEventOneliner(rootEvent));

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
const parentContentText = $derived(parentComment?.content ?? '');
</script>

<div class="comment-card {className}">
	<!-- Left column: vertical line fills top half, avatar anchored at bottom -->
	<div class="left-col">
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

	<!-- Right column: root row (no bg/border) above the bubble -->
	<div class="right-col">
		<!-- Root event row — bare, no background or border -->
		<div class="root-row">
			<div class="emoji-badge" aria-hidden="true">
				<img src={rootOneliner.emoji} alt="" width="14" height="14" />
			</div>
			<span class="root-label">{rootOneliner.label}</span>
		</div>

		<!-- Bubble — matches MessageBubble styling exactly -->
		<div class="bubble">
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

			<!-- Quoted parent comment — inside bubble, only when isReply -->
			{#if isReply && parentComment}
				<div class="quote">
					{#if parentDisplayName}
						<span class="quote-author">{parentDisplayName}</span>
					{/if}
					<span class="quote-text"
						>{parentContentText.slice(0, 160)}{parentContentText.length > 160 ? '…' : ''}</span
					>
				</div>
			{/if}

			<div class="bubble-content">
				<ShortTextRenderer content={contentText} />
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

	/* ── Left column: line fills space, avatar anchored at bottom ── */
	.left-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex-shrink: 0;
		width: 36px;
	}

	.line-dotted {
		width: 2px;
		flex: 1;
		background: repeating-linear-gradient(
			to bottom,
			hsl(var(--white16)) 0px,
			hsl(var(--white16)) 4px,
			transparent 4px,
			transparent 8px
		);
	}

	.line-solid {
		width: 2px;
		flex: 1;
		background: hsl(var(--white16));
		border-radius: 1px;
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

	/* ── Right column ───────────────────────────────────────────── */
	.right-col {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	/* ── Root event row — no background, no border ──────────────── */
	.root-row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	.emoji-badge {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		background: hsl(var(--white8));
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.root-label {
		font-size: 0.75rem;
		color: hsl(var(--white33));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	/* ── Bubble — same as MessageBubble ─────────────────────────── */
	.bubble {
		width: fit-content;
		max-width: 100%;
		min-width: 200px;
		background-color: hsl(var(--gray66));
		border-radius: 16px 16px 16px 4px;
		padding: 8px 12px;
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

	/* ── Quoted parent comment (inside bubble) ──────────────────── */
	.quote {
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: hsl(var(--white8));
		border-left: 2px solid hsl(var(--white33));
		border-radius: 0 4px 4px 0;
		padding: 4px 8px;
		margin-bottom: 6px;
		overflow: hidden;
	}

	.quote-author {
		font-size: 0.6875rem;
		font-weight: 600;
		color: hsl(var(--white66));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.quote-text {
		font-size: 0.8125rem;
		color: hsl(var(--white33));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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

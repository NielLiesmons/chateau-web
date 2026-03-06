<script lang="js">
// @ts-nocheck
/**
 * ReportModal - Publishes a NIP-56 kind-1984 report event.
 * Violation rows + ShortTextInput (with Send) live inside a single black33 container.
 * Violation options are tailored per content type / event kind.
 */
import { fly } from "svelte/transition";
import { cubicOut } from "svelte/easing";
import Modal from "$lib/components/common/Modal.svelte";
import Checkbox from "$lib/components/common/Checkbox.svelte";
import ShortTextInput from "$lib/components/common/ShortTextInput.svelte";
import { signEvent } from "$lib/stores/auth.svelte.js";
import { publishToRelays } from "$lib/nostr/service.js";
import { DEFAULT_COMMUNITY_RELAYS } from "$lib/config.js";

let {
	isOpen = $bindable(false),
	authorName = "",
	contentType = "post",
	eventId = "",
	authorPubkey = "",
	communityPubkey = "",
	relays = DEFAULT_COMMUNITY_RELAYS,
	searchProfiles = async () => [],
	searchEmojis = async () => [],
} = $props();

/** @type {Record<string, Array<{ id: string; label: string }>>} */
const VIOLATIONS_BY_TYPE = {
	app: [
		{ id: "malware", label: "Malware or security risk" },
		{ id: "spam", label: "Spam" },
		{ id: "impersonation", label: "Impersonation" },
		{ id: "illegal", label: "Illegal content" },
		{ id: "other", label: "Other" },
	],
	forum: [
		{ id: "nudity", label: "Nudity or explicit content" },
		{ id: "profanity", label: "Hateful speech or profanity" },
		{ id: "illegal", label: "Illegal content" },
		{ id: "spam", label: "Spam" },
		{ id: "impersonation", label: "Impersonation" },
		{ id: "other", label: "Other" },
	],
	wiki: [
		{ id: "spam", label: "Spam" },
		{ id: "illegal", label: "Illegal content" },
		{ id: "profanity", label: "Hateful speech" },
		{ id: "other", label: "Other" },
	],
	task: [
		{ id: "spam", label: "Spam" },
		{ id: "illegal", label: "Illegal content" },
		{ id: "impersonation", label: "Impersonation" },
		{ id: "other", label: "Other" },
	],
	profile: [
		{ id: "spam", label: "Spam" },
		{ id: "impersonation", label: "Impersonation" },
		{ id: "nudity", label: "Nudity or explicit content" },
		{ id: "profanity", label: "Hateful speech or profanity" },
		{ id: "illegal", label: "Illegal content" },
		{ id: "other", label: "Other" },
	],
	post: [
		{ id: "nudity", label: "Nudity or explicit content" },
		{ id: "profanity", label: "Hateful speech or profanity" },
		{ id: "illegal", label: "Illegal content" },
		{ id: "spam", label: "Spam" },
		{ id: "other", label: "Other" },
	],
};

/** @type {Record<string, string>} */
const CONTENT_TYPE_LABELS = {
	app: "App",
	forum: "Forum Post",
	wiki: "Wiki",
	task: "Task",
	profile: "Profile",
	post: "Post",
};

const violations = $derived(VIOLATIONS_BY_TYPE[contentType] ?? VIOLATIONS_BY_TYPE.post);
const contentTypeLabel = $derived(CONTENT_TYPE_LABELS[contentType] ?? contentType.charAt(0).toUpperCase() + contentType.slice(1));
const description = $derived(authorName ? `${authorName}'s ${contentTypeLabel}` : contentTypeLabel);

/** @type {Set<string>} */
let selectedIds = $state(new Set());
let submitting = $state(false);
let submitted = $state(false);
let error = $state("");
let textInput = $state(null);

const allowEmptySubmit = $derived(selectedIds.size > 0);

function toggleViolation(/** @type {string} */ id) {
	const next = new Set(selectedIds);
	if (next.has(id)) {
		next.delete(id);
	} else {
		next.add(id);
	}
	selectedIds = next;
}

/**
 * Called by ShortTextInput's Send button.
 * @param {{ text: string; emojiTags?: any[]; mentions?: string[] }} event
 */
async function handleSubmit(event) {
	const text = (event?.text ?? "").trim();
	if (submitting || submitted) return;
	if (selectedIds.size === 0 && !text) return;

	submitting = true;
	error = "";

	try {
		const selected = [...selectedIds];
		const primaryType = selected[0] ?? "other";

		/** @type {string[][]} */
		const tags = [];

		if (authorPubkey) {
			tags.push(["p", authorPubkey, primaryType]);
		}

		if (eventId) {
			for (const t of selected.length ? selected : [primaryType]) {
				tags.push(["e", eventId, t]);
			}
		}

		if (communityPubkey && communityPubkey !== authorPubkey) {
			tags.push(["p", communityPubkey]);
		}

		const contentLines = [];
		if (selected.length > 1) {
			contentLines.push(`Violations: ${selected.join(", ")}`);
		}
		if (text) {
			contentLines.push(text);
		}

		const template = {
			kind: 1984,
			content: contentLines.join("\n"),
			tags,
			created_at: Math.floor(Date.now() / 1000),
		};

		const signed = await signEvent(template);
		const publishRelays = relays?.length ? relays : DEFAULT_COMMUNITY_RELAYS;
		await publishToRelays(publishRelays, signed);

		textInput?.clear();
		submitted = true;
		setTimeout(() => {
			isOpen = false;
		}, 1200);
	} catch (/** @type {any} */ e) {
		console.error("Failed to publish report:", e);
		error = "Failed to send report. Please try again.";
	} finally {
		submitting = false;
	}
}

$effect(() => {
	if (!isOpen) {
		selectedIds = new Set();
		submitting = false;
		submitted = false;
		error = "";
		textInput?.clear();
	}
});
</script>

<Modal
	bind:open={isOpen}
	title="Report"
	{description}
	align="bottom"
	wide={true}
	zIndex={60}
	closeOnBackdropClick={true}
	closeOnEscape={true}
	closeButtonMobile={false}
>
	{#if submitted}
		<div class="report-submitted" transition:fly={{ y: 10, duration: 200, easing: cubicOut }}>
			<p class="submitted-text">Report sent. Thank you.</p>
		</div>
	{:else}
		<div class="report-content">
			<div class="violations-container">
				<!-- Violation rows -->
				{#each violations as v (v.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div
						class="violation-row"
						class:selected={selectedIds.has(v.id)}
						onclick={() => toggleViolation(v.id)}
						role="button"
						tabindex="0"
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleViolation(v.id); }}}
						aria-pressed={selectedIds.has(v.id)}
					>
						<span class="violation-label">{v.label}</span>
						<Checkbox
							checked={selectedIds.has(v.id)}
							onChanged={() => toggleViolation(v.id)}
							ariaLabel={v.label}
						/>
					</div>
				{/each}

				<!-- Comment input with Send button inside -->
				<div class="comment-input-wrap">
					<ShortTextInput
						bind:this={textInput}
						placeholder="Add a comment (optional)"
						size="medium"
						{searchProfiles}
						{searchEmojis}
						showActionRow={true}
						{allowEmptySubmit}
						onCameraTap={() => {}}
						onEmojiTap={() => {}}
						onAddTap={() => {}}
						onsubmit={handleSubmit}
					/>
				</div>
			</div>

			{#if error}
				<p class="error-text">{error}</p>
			{/if}
		</div>
	{/if}
</Modal>

<style>
	.report-content {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: 8px 16px 16px;
	}

	@media (max-width: 767px) {
		.report-content {
			padding-bottom: max(20px, env(safe-area-inset-bottom));
		}
	}

	.violations-container {
		background: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white33));
		border-radius: var(--radius-16);
		overflow: hidden;
	}

	.violation-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 16px;
		cursor: pointer;
		transition: background 0.12s ease;
		border-bottom: 0.33px solid hsl(var(--white8));
	}

	.violation-row:hover {
		background: hsl(var(--white4));
	}

	.violation-row:active {
		background: hsl(var(--white8));
	}

	.violation-label {
		font-size: 0.9375rem;
		font-weight: 400;
		color: hsl(var(--foreground));
		flex: 1;
		line-height: 1.4;
		user-select: none;
	}

	.violation-row.selected .violation-label {
		color: hsl(var(--white));
	}

	.comment-input-wrap :global(.editor-mount),
	.comment-input-wrap :global(.editor-wrapper),
	.comment-input-wrap :global(.editor-container) {
		min-height: 110px;
	}

	.error-text {
		margin: 8px 0 0;
		font-size: 0.8125rem;
		color: hsl(var(--destructive));
		padding-left: 4px;
	}

	.report-submitted {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px 16px max(32px, env(safe-area-inset-bottom));
	}

	.submitted-text {
		margin: 0;
		font-size: 0.9375rem;
		color: hsl(var(--white66));
		text-align: center;
	}
</style>

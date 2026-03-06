<script lang="js">
// @ts-nocheck
/**
 * ListModal — bottom sheet for creating or editing a profile list (kind 30000).
 * Metadata only: name, slug, description, image URL, join-form template.
 *
 * Mirrors WikiModal's structure exactly (overlay + wiki-sheet-wrapper > wiki-sheet
 * > post-form-box with dividers + action row).
 *
 * onsubmit receives: { name, image, description, formAddress, dTag }
 */
import { fly, fade } from 'svelte/transition';
import { cubicOut } from 'svelte/easing';
import { Camera, EmojiFill, Plus } from '$lib/components/icons';

let {
	isOpen = $bindable(false),
	/** @type {{ name?: string, image?: string, description?: string, formAddress?: string, dTag?: string } | null} */
	initialData = null,
	/** @type {Array<{ formAddr: string, parsed: { name?: string } | null }>} */
	formTemplates = [],
	onsubmit,
	onclose
} = $props();

const isEditMode = $derived(!!initialData);

/** @type {HTMLInputElement | null} */
let nameInput    = $state(null);
let nameValue    = $state('');
let slugValue    = $state('');
let slugEdited   = $state(false);
let descValue    = $state('');
let imageValue   = $state('');
let formValue    = $state('');
let submitting   = $state(false);
let error        = $state('');

function toSlug(/** @type {string} */ name) {
	return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'list';
}

$effect(() => {
	if (!slugEdited) slugValue = toSlug(nameValue);
});

const slugPreview = $derived(slugValue || toSlug(nameValue));

// Reset / populate on open
$effect(() => {
	if (isOpen) {
		const t = setTimeout(() => nameInput?.focus(), 80);
		if (initialData) {
			nameValue  = initialData.name        ?? '';
			descValue  = initialData.description ?? '';
			imageValue = initialData.image       ?? '';
			formValue  = initialData.formAddress ?? '';
			if (initialData.dTag) { slugValue = initialData.dTag; slugEdited = true; }
		}
		return () => clearTimeout(t);
	} else {
		nameValue  = '';
		slugValue  = '';
		slugEdited = false;
		descValue  = '';
		imageValue = '';
		formValue  = '';
		error      = '';
		submitting = false;
	}
});

function close() {
	isOpen = false;
	onclose?.();
}

function handleKeydown(/** @type {KeyboardEvent} */ e) {
	if (e.key === 'Escape') close();
}

async function handleSave() {
	if (!nameValue.trim() || submitting) return;
	submitting = true;
	error = '';
	try {
		await onsubmit?.({
			name:        nameValue.trim(),
			image:       imageValue.trim(),
			description: descValue.trim(),
			formAddress: formValue.trim(),
			dTag:        slugPreview || toSlug(nameValue)
		});
		close();
	} catch (err) {
		error = /** @type {any} */ (err)?.message || (isEditMode ? 'Failed to save' : 'Failed to create');
	} finally {
		submitting = false;
	}
}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay bg-overlay" onclick={close} role="presentation" transition:fade={{ duration: 180 }}></div>

	<div class="wiki-sheet-wrapper" role="dialog" aria-modal="true" aria-label={isEditMode ? 'Edit list' : 'New list'}>
		<div
			class="wiki-sheet"
			transition:fly={{ y: 100, duration: 200, easing: cubicOut }}
		>
			<!-- ── Form box ── -->
			<div class="post-form-box">

				<!-- Name row -->
				<div class="title-area">
					<input
						type="text"
						class="wiki-title-input"
						placeholder="List name"
						bind:value={nameValue}
						bind:this={nameInput}
						disabled={submitting}
						aria-label="List name"
						onkeydown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
					/>
				</div>

				<div class="post-form-divider"></div>

				<!-- Slug row -->
				<div class="slug-area">
					<span class="slug-prefix">/</span>
					<input
						type="text"
						class="slug-input"
						placeholder={toSlug(nameValue) || 'list'}
						value={slugEdited ? slugValue : (nameValue.trim() ? toSlug(nameValue) : '')}
						disabled={submitting}
						aria-label="List slug (d-tag)"
						oninput={(e) => {
							const val = /** @type {HTMLInputElement} */ (e.target).value
								.toLowerCase()
								.replace(/[^a-z0-9-]+/g, '-')
								.replace(/^-+/, '');
							slugEdited = true;
							slugValue = val;
							/** @type {HTMLInputElement} */ (e.target).value = val;
						}}
						onblur={() => {
							if (slugEdited && !slugValue.trim()) {
								slugEdited = false;
							} else if (slugEdited) {
								slugValue = slugValue.replace(/-+$/, '') || toSlug(nameValue);
							}
						}}
					/>
				</div>

				<div class="post-form-divider"></div>

				<!-- Description row -->
				<input
					type="text"
					class="wiki-summary-input"
					placeholder="Short description (optional)"
					bind:value={descValue}
					disabled={submitting}
					aria-label="List description"
				/>

				<div class="post-form-divider"></div>

				<!-- Image URL row -->
				<div class="image-area">
					<input
						type="url"
						class="wiki-summary-input image-input"
						placeholder="Badge image URL (optional)"
						bind:value={imageValue}
						disabled={submitting}
						aria-label="Badge image URL"
					/>
					{#if imageValue.trim()}
						<img src={imageValue.trim()} alt="" class="image-preview" onerror={() => { imageValue = ''; }} />
					{/if}
				</div>

				<div class="post-form-divider"></div>

				<!-- Form template row -->
				<div class="form-area">
					<select
						class="form-select"
						bind:value={formValue}
						disabled={submitting}
						aria-label="Join form template"
					>
						<option value="">— No join form —</option>
						{#each formTemplates as ft}
							<option value={ft.formAddr}>{ft.parsed?.name ?? ft.formAddr}</option>
						{/each}
					</select>
				</div>

				<!-- Action row -->
				<div class="post-action-row">
					<div class="action-buttons-left">
						<button type="button" class="action-btn" aria-label="Add photo" onclick={() => {}}>
							<Camera variant="fill" color="hsl(var(--white33))" size={20} />
						</button>
						<button type="button" class="action-btn" aria-label="Add attachment" onclick={() => {}}>
							<Plus variant="outline" color="hsl(var(--white33))" size={16} strokeWidth={2.8} />
						</button>
					</div>

					<button
						type="button"
						class="publish-btn"
						onclick={handleSave}
						disabled={!nameValue.trim() || submitting}
					>
						{submitting
							? (isEditMode ? 'Saving…'   : 'Creating…')
							: (isEditMode ? 'Save'      : 'Create List')}
					</button>
				</div>
			</div>

			{#if error}
				<p class="error-text">{error}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 49;
	}

	.wiki-sheet-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 50;
		display: flex;
		justify-content: center;
		align-items: flex-end;
		pointer-events: none;
	}

	.wiki-sheet {
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		padding: 16px;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		position: relative;
		display: flex;
		flex-direction: column;
	}

	@media (min-width: 768px) {
		.wiki-sheet {
			max-width: 680px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
			padding: 12px;
		}
	}

	/* ── Form box ── */
	.post-form-box {
		display: flex;
		flex-direction: column;
		background-color: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white33));
		border-radius: var(--radius-16);
		overflow: hidden;
	}

	/* ── Title / Name row ── */
	.title-area {
		display: flex;
		align-items: center;
		padding: 10px 12px;
		min-height: 44px;
		flex-shrink: 0;
	}

	.wiki-title-input {
		flex: 1;
		min-width: 0;
		padding: 0;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--white));
		font-family: 'Inter', sans-serif;
		font-size: 18px;
		font-weight: 600;
		box-sizing: border-box;
	}
	.wiki-title-input::placeholder { color: hsl(var(--white33)); font-weight: 500; }
	.wiki-title-input:disabled { opacity: 0.6; }

	/* ── Slug row ── */
	.slug-area {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 6px 12px;
		min-height: 34px;
		flex-shrink: 0;
	}

	.slug-prefix {
		font-size: 13px;
		font-weight: 600;
		color: hsl(var(--white33));
		font-family: 'JetBrains Mono', monospace;
		flex-shrink: 0;
		line-height: 1;
	}

	.slug-input {
		flex: 1;
		min-width: 0;
		padding: 0;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--white33));
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
		font-weight: 500;
		box-sizing: border-box;
	}
	.slug-input::placeholder { color: hsl(var(--white16)); }
	.slug-input:focus { color: hsl(var(--white66)); }
	.slug-input:disabled { opacity: 0.5; }

	/* ── Description / summary row ── */
	.wiki-summary-input {
		width: 100%;
		padding: 8px 12px;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--white66));
		font-family: 'Inter', sans-serif;
		font-size: 14px;
		font-weight: 400;
		box-sizing: border-box;
		flex-shrink: 0;
	}
	.wiki-summary-input::placeholder { color: hsl(var(--white33)); }
	.wiki-summary-input:disabled { opacity: 0.6; }

	/* ── Image row ── */
	.image-area {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-right: 12px;
		flex-shrink: 0;
	}

	.image-input { flex: 1; padding-right: 0; }

	.image-preview {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		object-fit: cover;
		flex-shrink: 0;
	}

	/* ── Form template row ── */
	.form-area {
		padding: 6px 12px;
		flex-shrink: 0;
	}

	.form-select {
		width: 100%;
		background: transparent;
		border: none;
		outline: none;
		color: hsl(var(--white33));
		font-family: 'Inter', sans-serif;
		font-size: 14px;
		font-weight: 400;
		cursor: pointer;
		appearance: none;
		padding: 2px 0;
	}
	.form-select option { background: hsl(var(--gray)); color: hsl(var(--foreground)); }
	.form-select:disabled { opacity: 0.5; }

	/* ── Divider ── */
	.post-form-divider {
		width: 100%;
		height: 1.4px;
		background-color: hsl(var(--white8));
		flex-shrink: 0;
	}

	/* ── Action row ── */
	.post-action-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 12px 12px;
		gap: 8px;
		flex-shrink: 0;
	}

	.action-buttons-left {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.action-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--white8));
		border: none;
		border-radius: 8px;
		cursor: pointer;
	}
	.action-btn:active { transform: scale(0.97); }

	/* ── Publish / Save button ── */
	.publish-btn {
		height: 32px;
		padding: 0 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--gradient-blurple);
		border: none;
		border-radius: 8px;
		color: white;
		font-size: 15px;
		font-weight: 500;
		cursor: pointer;
		flex-shrink: 0;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}
	.publish-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.publish-btn:active:not(:disabled) { transform: scale(0.97); }

	/* ── Error ── */
	.error-text {
		margin: 10px 0 2px;
		font-size: 13px;
		font-weight: 500;
		color: hsl(var(--destructive));
		background: hsl(var(--destructive) / 0.1);
		border-radius: 8px;
		padding: 8px 12px;
	}
</style>

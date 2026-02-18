<script lang="js">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { nip19 } from 'nostr-tools';
	import { publishToRelays } from '$lib/nostr';
	import { DEFAULT_SOCIAL_RELAYS, DEFAULT_COMMUNITY_RELAYS, EVENT_KINDS } from '$lib/config';
	import { getCurrentPubkey, signEvent } from '$lib/stores/auth.svelte.js';

	let communityName = $state('');
	let relayUrls = $state(DEFAULT_SOCIAL_RELAYS.join('\n'));
	let submitting = $state(false);
	let error = $state('');

	const currentPubkey = $derived(getCurrentPubkey());
	const canSubmit = $derived(!!communityName.trim());
	const relaysList = $derived(
		relayUrls
			.split(/[\n,]+/)
			.map((r) => r.trim())
			.filter(Boolean)
	);
	const effectiveRelays = $derived(relaysList.length > 0 ? relaysList : DEFAULT_SOCIAL_RELAYS);

	/**
	 * @param {Event} e
	 */
	async function handleSubmit(e) {
		e?.preventDefault();
		if (!currentPubkey || !canSubmit || submitting) return;
		submitting = true;
		error = '';
		try {
			const pubkey = currentPubkey;
			const relays = effectiveRelays;
			const name = communityName.trim();
			const createdAt = Math.floor(Date.now() / 1000);

			// Community tag for kind 0: 10222:pubkey: (identifies this profile as a community)
			const communityTag = `10222:${pubkey}:`;
			// 1. Kind 0 — community profile with community tag; publish to social relays
			const profileContent = JSON.stringify({
				display_name: name,
				name,
				about: '',
				picture: '',
				community: communityTag
			});
			const ev0 = await signEvent({
				kind: EVENT_KINDS.PROFILE,
				content: profileContent,
				tags: [['community', communityTag]],
				created_at: createdAt
			});
			await publishToRelays(DEFAULT_SOCIAL_RELAYS, ev0);

			// 2. Kind 30168 — form template (d=forum-join)
			const formTitle = 'Why do you want to join?';
			const formContent = JSON.stringify({
				title: formTitle,
				fields: [{ name: 'message', type: 'text', label: formTitle }]
			});
			const ev30168 = await signEvent({
				kind: EVENT_KINDS.FORM_TEMPLATE,
				content: formContent,
				tags: [
					['d', 'forum-join'],
					['name', formTitle]
				],
				created_at: createdAt + 1
			});
			await publishToRelays(relays, ev30168);

			// 3. Kind 30000 — profile list (d=forum-members); include admin (creator) as first member
			const formAddress = `30168:${pubkey}:forum-join`;
			const listAddress = `30000:${pubkey}:forum-members`;
			const ev30000 = await signEvent({
				kind: EVENT_KINDS.PROFILE_LIST,
				content: '',
				tags: [
					['d', 'forum-members'],
					['name', 'Members'],
					['form', formAddress],
					['p', pubkey]
				],
				created_at: createdAt + 2
			});
			await publishToRelays(relays, ev30000);

			// 4. Kind 10222 — community definition: relays + Forum section
			const ev10222 = await signEvent({
				kind: EVENT_KINDS.COMMUNITY,
				content: '',
				tags: [
					...relays.map((r) => ['r', r]),
					['content', 'Forum'],
					['k', '11'],
					['a', listAddress]
				],
				created_at: createdAt + 3
			});
			await publishToRelays(relays, ev10222);

			const npub = nip19.npubEncode(pubkey);
			goto(`/communities?c=${encodeURIComponent(npub)}`);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create community';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Create community - Chateau</title>
</svelte:head>

<main class="create-page">
	<h1>Create community</h1>
	{#if !browser}
		<p class="text-muted-foreground">Loading…</p>
	{:else if !currentPubkey}
		<p class="text-muted-foreground">Add a profile to create a community.</p>
		<a href="/communities" class="link-back">← Back to communities</a>
	{:else}
		<form class="create-form" onsubmit={handleSubmit}>
			<div class="form-group">
				<label for="community_name">Community name *</label>
				<input id="community_name" type="text" bind:value={communityName} placeholder="My Community" required />
			</div>
			<div class="form-group">
				<label for="relays">Relay URLs (one per line or comma-separated)</label>
				<textarea id="relays" bind:value={relayUrls} rows="3" placeholder="wss://relay.damus.io&#10;wss://relay.primal.net"></textarea>
				<p class="form-hint">Default: social relays with Damus on top. Used for community events and where to read/write.</p>
			</div>
			{#if error}
				<p class="form-error">{error}</p>
			{/if}
			<div class="form-actions">
				<a href="/communities" class="btn-secondary-small">Cancel</a>
				<button type="submit" class="btn-primary-small" disabled={!canSubmit || submitting}>
					{submitting ? 'Creating…' : 'Create community'}
				</button>
			</div>
		</form>
		<a href="/communities" class="link-back">← Back to communities</a>
	{/if}
</main>

<style>
	.create-page {
		max-width: 480px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}
	.create-page h1 {
		font-size: 1.5rem;
		margin: 0 0 1.5rem;
	}
	.create-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.form-group label {
		font-size: 0.875rem;
		font-weight: 500;
	}
	.form-group input,
	.form-group textarea {
		padding: 0.5rem 0.75rem;
		border: 1px solid hsl(var(--white16));
		border-radius: 8px;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		font-size: 0.9375rem;
	}
	.form-group textarea {
		resize: vertical;
	}
	.form-hint {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}
	.form-error {
		font-size: 0.875rem;
		color: hsl(var(--destructive));
		margin: 0;
	}
	.form-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}
	.link-back {
		display: inline-block;
		margin-top: 1.5rem;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		text-decoration: none;
	}
	.link-back:hover {
		color: hsl(var(--foreground));
	}
</style>

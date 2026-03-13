<script lang="js">
	// @ts-nocheck
	import { untrack } from 'svelte';
	/**
	 * ProfileListDetail — full detail view for a kind:30000 profile list.
	 *
	 * Layout (mirrors WikiDetail / ProjectDetail):
	 *   - DetailHeader (back button + community breadcrumb)
	 *   - Title row: list name + Edit button (admin)
	 *   - Info panel: badge image · name · description
	 *   - CAN WRITE panel: content-type pills from sectionKinds
	 *   - Admin add-member row
	 *   - Full member list with avatar + display name + npub chip + remove button (admin)
	 */
	import { nip19 } from 'nostr-tools';
	import {
		queryEvent,
		parseProfile,
		fetchProfilesBatch,
		fetchFromRelays,
		putEvents,
		publishToRelays,
		parseProfileList
	} from '$lib/nostr';
	import { EVENT_KINDS, DEFAULT_COMMUNITY_RELAYS, COMMUNITY_WRITE_RELAYS } from '$lib/config';
	import { contentTypesFromKinds } from '$lib/config/contentTypes.js';
	import DetailHeader from '$lib/components/layout/DetailHeader.svelte';
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';
	import SkeletonLoader from '$lib/components/common/SkeletonLoader.svelte';
	import EmptyState from '$lib/components/common/EmptyState.svelte';
	import SingleBadge from '$lib/components/common/SingleBadge.svelte';
	import ListModal from '$lib/components/modals/ListModal.svelte';
	import { Pen, Cross } from '$lib/components/icons';
	import {
		getCurrentPubkey as _getCurrentPubkey,
		getIsSignedIn,
		signEvent
	} from '$lib/stores/auth.svelte.js';

	let {
		listAddress = '',
		communityNpub = '',
		/** string[] — the community's declared relay URLs; required for correct publishing */
		communityRelays = /** @type {string[]} */ ([]),
		isCommunityAdmin = false,
		/** number[] — kinds this list's section permits writing */
		sectionKinds = [],
		/** { pubkey, name, pictureUrl }[] — community catalog entry for the breadcrumb */
		catalogs = [],
		/** Array<{ formAddr, parsed }> for the edit modal form dropdown */
		formTemplates = [],
		onBack = () => {},
		getCurrentPubkey = _getCurrentPubkey
	} = $props();

	// ── Derived ──────────────────────────────────────────────────────────────────
	const writeTypes = $derived(contentTypesFromKinds(sectionKinds));

	// ── State ─────────────────────────────────────────────────────────────────────
	let listEvent = $state(null);
	let parsed = $state(null);
	let loading = $state(true);
	let editModalOpen = $state(false);

	// member profiles: pubkey → { displayName, name, picture }
	let memberProfiles = $state(new Map());

	// admin add-member
	let addInput = $state('');
	let addError = $state('');
	let addSubmitting = $state(false);
	/** @type {{ ok: number, failed: { relay: string, reason: string }[] } | null} */
	let publishStatus = $state(null);

	// ── Load list event ───────────────────────────────────────────────────────────
	// Each run is tracked by a generation counter so stale async callbacks are
	// discarded (avoids state mutations after the effect has been torn down).
	$effect(() => {
		if (!listAddress) {
			loading = false;
			return;
		}
		const parts = listAddress.split(':');
		const pubkey = parts[1] ?? '';
		const dTag = parts.slice(2).join(':') ?? '';

		let cancelled = false;
		loading = true;

		// Read communityRelays with untrack so a new [] reference from the parent
		// (e.g. `selectedCommunity.relays ?? []`) does NOT re-trigger this effect.
		const relayUrls = untrack(() =>
			communityRelays?.length ? [...communityRelays] : DEFAULT_COMMUNITY_RELAYS
		);

		(async () => {
			// Always fetch from relay so we get the latest published version.
			// Fall back to Dexie only if the relay times out / returns nothing.
			const fetched = await fetchFromRelays(relayUrls, {
				kinds: [EVENT_KINDS.PROFILE_LIST],
				authors: [pubkey],
				'#d': [dTag],
				limit: 1
			});
			let ev = null;
			if (fetched.length) {
				ev = fetched[0];
				await putEvents([ev]);
			} else {
				// Relay timed out — fall back to local cache
				ev = await queryEvent({
					kinds: [EVENT_KINDS.PROFILE_LIST],
					authors: [pubkey],
					'#d': [dTag]
				});
			}
			if (cancelled) return;
			listEvent = ev ?? null;
			parsed = ev ? parseProfileList(ev) : null;
			loading = false;
		})();

		return () => {
			cancelled = true;
		};
	});

	// ── Load member profiles (one-shot, no liveQuery subscription) ────────────────
	// Parallel Dexie reads + single relay batch → one state update to avoid flicker.
	$effect(() => {
		const members = parsed?.members ?? [];
		if (!members.length) {
			memberProfiles = new Map();
			return;
		}

		let cancelled = false;

		(async () => {
			// 1. Fetch all local profiles in parallel.
			const localEntries = await Promise.all(
				members.map(async (pk) => {
					const ev = await queryEvent({ kinds: [EVENT_KINDS.PROFILE], authors: [pk] });
					if (!ev) return null;
					try {
						return [pk, parseProfile(ev)];
					} catch {
						return null;
					}
				})
			);
			if (cancelled) return;
			const localMap = new Map(localEntries.filter(Boolean));

			// Show local data immediately (single update — no flicker from serial loop).
			if (localMap.size) memberProfiles = new Map(localMap);

			// 2. Fetch missing profiles from relays and merge in one final update.
			const results = await fetchProfilesBatch(members).catch(() => new Map());
			if (cancelled) return;
			const remoteEvs = [...results.values()].filter(Boolean);
			if (remoteEvs.length) {
				// Write to Dexie fire-and-forget so we don't block the UI update.
				putEvents(remoteEvs).catch(() => {});
			}
			if (cancelled) return;

			const merged = new Map(localMap);
			for (const ev of remoteEvs) {
				try {
					merged.set(ev.pubkey, parseProfile(ev));
				} catch {}
			}
			memberProfiles = merged;
		})();

		return () => {
			cancelled = true;
		};
	});

	// ── Edit modal initial data ───────────────────────────────────────────────────
	const editInitialData = $derived(
		parsed
			? {
					name: parsed.name ?? '',
					image: parsed.image ?? '',
					description: parsed.content ?? '',
					formAddress: parsed.form ?? '',
					dTag: parsed.dTag ?? ''
				}
			: null
	);

	// ── Save list edits ───────────────────────────────────────────────────────────
	async function handleEditSubmit({ name, image, description, formAddress, dTag }) {
		if (!listEvent) throw new Error('List not loaded');
		const rawTags = listEvent.tags || [];
		const newTags = rawTags
			.filter((t) => t[0] !== 'name' && t[0] !== 'image' && t[0] !== 'form')
			.map((t) => [...t]);
		if (name) newTags.push(['name', name]);
		if (image) newTags.push(['image', image]);
		if (formAddress) newTags.push(['form', formAddress]);
		const newEv = await signEvent({
			kind: EVENT_KINDS.PROFILE_LIST,
			content: description ?? '',
			tags: newTags,
			created_at: Math.floor(Date.now() / 1000)
		});
		const writeRelays = [
			...new Set([...communityRelays, ...DEFAULT_COMMUNITY_RELAYS, ...COMMUNITY_WRITE_RELAYS])
		];
		await putEvents([newEv]);
		listEvent = newEv;
		parsed = parseProfileList(newEv);
		const { ok: editOk, failed: editFailed } = await publishToRelays(writeRelays, newEv);
		if (editOk.length === 0 && editFailed.length > 0) {
			throw new Error(`Saved locally but relays rejected: ${editFailed[0].reason}`);
		}
	}

	// ── Add member ────────────────────────────────────────────────────────────────
	async function handleAddMember() {
		if (!addInput.trim() || addSubmitting || !listEvent) return;
		let pubkey = addInput.trim();
		if (pubkey.startsWith('npub')) {
			try {
				const d = nip19.decode(pubkey);
				if (d?.type === 'npub') pubkey = d.data;
			} catch {
				addError = 'Invalid npub';
				return;
			}
		}
		if (pubkey.length !== 64 || !/^[a-fA-F0-9]+$/.test(pubkey)) {
			addError = 'Enter a valid npub or hex pubkey';
			return;
		}
		if (parsed?.members?.includes(pubkey)) {
			addError = 'Already a member';
			return;
		}
		addError = '';
		publishStatus = null;
		addSubmitting = true;
		try {
			const newMembers = [...(parsed?.members ?? []), pubkey];
			const rawTags = listEvent.tags || [];
			const newTags = rawTags.filter((t) => t[0] !== 'p').map((t) => [...t]);
			newMembers.forEach((p) => newTags.push(['p', p]));
			const newEv = await signEvent({
				kind: EVENT_KINDS.PROFILE_LIST,
				content: String(listEvent.content ?? ''),
				tags: newTags,
				created_at: Math.floor(Date.now() / 1000)
			});
			const writeRelays = untrack(() => [
				...new Set([...communityRelays, ...DEFAULT_COMMUNITY_RELAYS, ...COMMUNITY_WRITE_RELAYS])
			]);
			// Update local state immediately.
			await putEvents([newEv]);
			listEvent = newEv;
			parsed = parseProfileList(newEv);
			addInput = '';
			// Broadcast and report result.
			const { ok, failed } = await publishToRelays(writeRelays, newEv);
			publishStatus = { ok: ok.length, failed };
			if (ok.length === 0) {
				addError = failed.length
					? `All relays rejected: ${failed[0].reason}`
					: 'Could not reach any relay — check your connection.';
			}
		} catch (e) {
			addError = e?.message || 'Failed to add';
		} finally {
			addSubmitting = false;
		}
	}

	// ── Remove member ─────────────────────────────────────────────────────────────
	async function handleRemoveMember(memberPubkey) {
		if (!listEvent || !parsed?.members) return;
		try {
			const newMembers = parsed.members.filter((p) => p !== memberPubkey);
			const rawTags = listEvent.tags || [];
			const newTags = rawTags.filter((t) => t[0] !== 'p').map((t) => [...t]);
			newMembers.forEach((p) => newTags.push(['p', p]));
			const newEv = await signEvent({
				kind: EVENT_KINDS.PROFILE_LIST,
				content: String(listEvent.content ?? ''),
				tags: newTags,
				created_at: Math.floor(Date.now() / 1000)
			});
			const writeRelays = [
				...new Set([...communityRelays, ...DEFAULT_COMMUNITY_RELAYS, ...COMMUNITY_WRITE_RELAYS])
			];
			await putEvents([newEv]);
			listEvent = newEv;
			parsed = parseProfileList(newEv);
			publishToRelays(writeRelays, newEv); // fire-and-forget; logged in console
		} catch {}
	}

	// ── Npub helper ───────────────────────────────────────────────────────────────
	function toNpub(pk) {
		try {
			return nip19.npubEncode(pk);
		} catch {
			return '';
		}
	}
</script>

<div class="list-detail">
	{#if loading}
		<EmptyState message="Loading…" minHeight={200} />
	{:else if !parsed}
		<EmptyState message="List not found" minHeight={200} />
	{:else}
		<div class="detail-header-wrap">
			<DetailHeader
				publisherPic={null}
				publisherName={parsed.name ?? 'List'}
				publisherPubkey={listEvent?.pubkey ?? ''}
				publisherUrl="#"
				timestamp={listEvent?.created_at}
				{catalogs}
				catalogText="Community"
				showPublisher={false}
				showMenu={false}
				showBackButton={true}
				{onBack}
				compactPadding={true}
			/>
		</div>

		<div class="content-scroll">
			<div class="content-inner">
				<!-- Title row -->
				<div class="title-row">
					<h1 class="list-title">{parsed.name ?? 'Unnamed List'}</h1>
					{#if isCommunityAdmin && getIsSignedIn()}
						<button
							type="button"
							class="edit-btn btn-primary-small"
							onclick={() => (editModalOpen = true)}
							aria-label="Edit list"
						>
							<Pen variant="fill" color="hsl(var(--white66))" size={14} />
							<span>Edit</span>
						</button>
					{/if}
				</div>

				<!-- Info panel: badge + name + description -->
				<div class="info-panel">
					<SingleBadge image={parsed.image ?? null} name={parsed.name ?? ''} sizePx={64} />
					<div class="info-panel-text">
						<span class="info-panel-name">{parsed.name ?? 'Unnamed'}</span>
						{#if parsed.content}
							<p class="info-panel-desc">{parsed.content}</p>
						{/if}
					</div>
				</div>

				<!-- CAN WRITE panel -->
				{#if writeTypes.length > 0}
					<div class="write-panel">
						<span class="section-label">CAN WRITE</span>
						<div class="type-pills">
							{#each writeTypes as ct}
								<span class="type-pill">
									<img src={ct.emoji} alt="" class="type-emoji" />
									<span>{ct.label}</span>
								</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Admin: add member -->
				{#if isCommunityAdmin && getIsSignedIn()}
					<div class="add-member-panel">
						<span class="section-label">ADD MEMBER</span>
						<div class="add-member-row">
							<input
								type="text"
								class="add-member-input"
								placeholder="npub or hex pubkey"
								bind:value={addInput}
								onkeydown={(e) => e.key === 'Enter' && handleAddMember()}
							/>
							<button
								type="button"
								class="btn-primary-small"
								disabled={addSubmitting || !addInput.trim()}
								onclick={handleAddMember}
							>
								{addSubmitting ? 'Adding…' : 'Add'}
							</button>
						</div>
						{#if addError}
							<p class="add-error">{addError}</p>
						{:else if publishStatus}
							{#if publishStatus.ok > 0}
								<p class="add-ok">
									Published to {publishStatus.ok} relay{publishStatus.ok === 1
										? ''
										: 's'}{publishStatus.failed.length
										? ` (${publishStatus.failed.length} failed)`
										: ''}.
								</p>
							{/if}
						{/if}
					</div>
				{/if}

				<!-- Members list -->
				<div class="members-panel">
					<div class="members-panel-header">
						<span class="section-label">MEMBERS</span>
						<span class="member-count">{parsed.members?.length ?? 0}</span>
					</div>

					{#if !parsed.members?.length}
						<EmptyState message="No members yet" minHeight={100} />
					{:else}
						<div class="members-list">
							{#each parsed.members as pk, i}
								{@const profile = memberProfiles.get(pk)}
								{@const displayName = profile?.displayName ?? profile?.name ?? null}
								{@const npubStr = toNpub(pk)}
								<div class="member-row" class:last-row={i === (parsed.members?.length ?? 0) - 1}>
									<ProfilePic
										pubkey={pk}
										pictureUrl={profile?.picture ?? null}
										name={displayName}
										size="sm"
									/>
									<div class="member-info">
										<span class="member-name">{displayName ?? pk.slice(0, 12) + '…'}</span>
										{#if npubStr}
											<span class="member-npub">{npubStr.slice(0, 16)}…</span>
										{/if}
									</div>
									{#if isCommunityAdmin && getIsSignedIn()}
										<button
											type="button"
											class="remove-btn"
											aria-label="Remove member"
											onclick={() => handleRemoveMember(pk)}
										>
											<Cross variant="outline" color="hsl(var(--white33))" size={14} />
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<ListModal
	bind:isOpen={editModalOpen}
	initialData={editInitialData}
	{formTemplates}
	onsubmit={handleEditSubmit}
	onclose={() => (editModalOpen = false)}
/>

<style>
	.list-detail {
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
		padding-bottom: 80px;
	}

	.content-inner {
		padding: 0 16px 16px;
		max-width: 100%;
	}

	/* ── Title row ── */
	.title-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 12px 0 12px;
	}

	.list-title {
		flex: 1;
		min-width: 0;
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0;
		line-height: 1.3;
		color: hsl(var(--foreground));
	}

	.edit-btn {
		gap: 8px;
		flex-shrink: 0;
	}

	/* ── Section label ── */
	.section-label {
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: hsl(var(--white33));
	}

	/* ── Info panel ── */
	.info-panel {
		display: flex;
		align-items: flex-start;
		gap: 14px;
		background: hsl(var(--gray33));
		border-radius: 12px;
		padding: 14px;
		margin-bottom: 12px;
	}

	.info-panel-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.info-panel-name {
		font-size: 1.0625rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		line-height: 1.3;
	}

	.info-panel-desc {
		font-size: 0.9375rem;
		color: hsl(var(--white66));
		line-height: 1.5;
		margin: 0;
	}

	/* ── CAN WRITE panel ── */
	.write-panel {
		background: hsl(var(--gray33));
		border-radius: 12px;
		padding: 10px 14px 12px;
		margin-bottom: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.type-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.type-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: hsl(var(--white8));
		border-radius: 9999px;
		padding: 4px 10px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--white66));
	}

	.type-emoji {
		width: 14px;
		height: 14px;
		object-fit: contain;
	}

	/* ── Add member panel ── */
	.add-member-panel {
		background: hsl(var(--gray33));
		border-radius: 12px;
		padding: 10px 14px 12px;
		margin-bottom: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.add-member-row {
		display: flex;
		gap: 8px;
	}

	.add-member-input {
		flex: 1;
		min-width: 0;
		background: hsl(var(--white8));
		border: 0.33px solid hsl(var(--white16));
		border-radius: 9999px;
		padding: 0 14px;
		height: 34px;
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		outline: none;
		font-family: inherit;
	}

	.add-member-input:focus {
		border-color: hsl(var(--white33));
	}

	.add-error {
		font-size: 0.8125rem;
		color: hsl(var(--destructive, 0 80% 60%));
		margin: 4px 0 0;
	}

	.add-ok {
		font-size: 0.8125rem;
		color: hsl(var(--white33));
		margin: 4px 0 0;
	}

	/* ── Members panel ── */
	.members-panel {
		background: hsl(var(--gray33));
		border-radius: 12px;
		padding: 0 14px;
		margin-bottom: 12px;
	}

	.members-panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 0 6px;
	}

	.member-count {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--white33));
	}

	.members-list {
		display: flex;
		flex-direction: column;
	}

	.member-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 0;
		border-bottom: 1px solid hsl(var(--white8));
	}

	.member-row.last-row {
		border-bottom: none;
	}

	.member-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.member-name {
		font-size: 0.9375rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.member-npub {
		font-size: 0.75rem;
		color: hsl(var(--white33));
		font-family: var(--font-mono);
	}

	.remove-btn {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: none;
		border: none;
		border-radius: 9999px;
		cursor: pointer;
		transition: background 0.12s ease;
	}

	.remove-btn:hover {
		background: hsl(var(--white8));
	}
	.remove-btn:active {
		transform: scale(0.92);
	}
</style>

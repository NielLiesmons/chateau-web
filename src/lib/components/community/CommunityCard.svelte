<script lang="js">
	// @ts-nocheck
	import ProfilePic from '$lib/components/common/ProfilePic.svelte';

	/** @type {{ pictureUrl?: string | null, name?: string, pubkey: string, lastTs?: number, selected?: boolean, forumCount?: number, taskCount?: number, projectCount?: number, wikiCount?: number, onclick?: () => void }} */
	let {
		pictureUrl = null,
		name = '',
		pubkey,
		lastTs = undefined,
		selected = false,
		forumCount = 0,
		taskCount = 0,
		projectCount = 0,
		wikiCount = 0,
		onclick
	} = $props();

	const CONTENT_PILL_IMG = {
		forum: '/images/emoji/forum.png',
		task: '/images/emoji/task.png',
		project: '/images/emoji/white_board.png',
		wiki: '/images/emoji/wiki.png'
	};

	function formatRelativeTime(ts) {
		if (!ts) return '—';
		const d = new Date(ts * 1000);
		const now = Date.now();
		const diff = (now - d.getTime()) / 1000;
		if (diff < 60) return 'now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
		if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
		return d.toLocaleDateString(undefined, { dateStyle: 'short' });
	}

	const hasPills = $derived(forumCount > 0 || taskCount > 0 || projectCount > 0 || wikiCount > 0);
</script>

<button type="button" class="community-card" class:selected {onclick}>
	<div class="community-card-top">
		<ProfilePic {pictureUrl} {name} {pubkey} size="lg" />
		<div class="community-card-body">
			<div class="community-card-row1">
				<span class="community-name">{name || 'Unnamed'}</span>
				<span class="community-time">{formatRelativeTime(lastTs)}</span>
			</div>
			<div class="community-card-row3">
				<span class="notif-preview-text">No notifications</span>
			</div>
		</div>
	</div>
	{#if hasPills}
		<div class="community-card-row2">
			{#if forumCount > 0}
				<span class="content-pill"
					><img
						src={CONTENT_PILL_IMG.forum}
						alt="forum"
						class="content-pill-img"
					/>{forumCount}</span
				>
			{/if}
			{#if taskCount > 0}
				<span class="content-pill"
					><img src={CONTENT_PILL_IMG.task} alt="tasks" class="content-pill-img" />{taskCount}</span
				>
			{/if}
			{#if projectCount > 0}
				<span class="content-pill"
					><img
						src={CONTENT_PILL_IMG.project}
						alt="projects"
						class="content-pill-img"
					/>{projectCount}</span
				>
			{/if}
			{#if wikiCount > 0}
				<span class="content-pill"
					><img src={CONTENT_PILL_IMG.wiki} alt="wikis" class="content-pill-img" />{wikiCount}</span
				>
			{/if}
		</div>
	{/if}
</button>

<style>
	.community-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: 100%;
		padding: 12px 16px;
		border: none;
		border-radius: 0;
		background: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
		transition: background 0.1s;
	}
	.community-card.selected {
		background: hsl(var(--white4));
	}
	.community-card-top {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
	}
	.community-card-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.community-card-row1 {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 20px;
	}
	.community-name {
		font-size: 0.875rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: hsl(var(--foreground));
	}
	.community-time {
		font-size: 0.75rem;
		color: hsl(var(--white33));
		flex-shrink: 0;
	}
	.community-card-row2 {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
		width: 100%;
	}
	.content-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 12px 4px 8px;
		background: hsl(var(--gray66));
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
	}
	.content-pill-img {
		width: 16px;
		height: 16px;
		object-fit: contain;
		flex-shrink: 0;
	}
	.community-card-row3 {
		display: flex;
		align-items: center;
		width: 100%;
	}
	.notif-preview-text {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		opacity: 0.45;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>

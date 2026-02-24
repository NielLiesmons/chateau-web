<script lang="js">
/**
 * CommunityBottomBar - Fixed bottom bar for community view.
 * Feed mode: Post button (icon + "Post", like Zap) + Search Forum (left-aligned text). Member mode: Zap + Comment.
 * Uses $lib/components/icons per DESIGN_SYSTEM.
 */
import { Zap, Plus, Search } from '$lib/components/icons';
import InputButton from '$lib/components/common/InputButton.svelte';
import { Reply } from '$lib/components/icons';

let {
	isMember = false,
	hasForm = false,
	/** When true, show Post + Search Forum for section feed; when false and isMember show Zap + Comment */
	showFeedBar = false,
	/** When true, show Add List + Search Member (Members tab) */
	showMembersBar = false,
	onAddList = () => {},
	/** When true, show a single Save button (Admin tab) */
	showAdminSave = false,
	onAdminSave = () => {},
	adminSaveSubmitting = false,
	communityName = '',
	/** When true, slide the bar out (e.g. while a bottom sheet modal is open) */
	modalOpen = false,
	onJoin = () => {},
	onComment = () => {},
	onZap = () => {},
	onAdd = () => {},
	onSearch = () => {},
	onGetStarted = () => {},
	className = ''
} = $props();
</script>

<div class="bottom-bar-wrapper {className}" class:modal-open={modalOpen}>
	<div class="bottom-bar" class:guest={!isMember && !hasForm}>
		<div class="bottom-bar-content">
			{#if showAdminSave}
				<button type="button" class="btn-primary-large w-full save-admin-btn" onclick={onAdminSave} disabled={adminSaveSubmitting} aria-label="Save all changes">
					{adminSaveSubmitting ? 'Saving…' : 'Save'}
				</button>
			{:else if showMembersBar}
				<button type="button" class="post-btn" onclick={onAddList} aria-label="Add list">
					<Plus variant="outline" size={16} strokeWidth={2.8} color="hsl(var(--whiteEnforced))" />
					<span>Add List</span>
				</button>
				<button type="button" class="search-forum-btn" onclick={onSearch} aria-label="Search member">
					<Search variant="outline" size={18} strokeWidth={1.4} color="hsl(var(--white33))" />
					<span>Search Member</span>
				</button>
			{:else if showFeedBar && isMember}
				<button type="button" class="post-btn" onclick={onAdd} aria-label="New post">
					<Plus variant="outline" size={16} strokeWidth={2.8} color="hsl(var(--whiteEnforced))" />
					<span>Post</span>
				</button>
				<button type="button" class="search-forum-btn" onclick={onSearch} aria-label="Search forum">
					<Search variant="outline" size={18} strokeWidth={1.4} color="hsl(var(--white33))" />
					<span>Search Forum</span>
				</button>
			{:else if isMember && !showFeedBar}
				<button type="button" class="btn-primary-large zap-button" onclick={onZap}>
					<Zap variant="fill" size={18} color="hsl(var(--whiteEnforced))" />
					<span>Zap</span>
				</button>
				<InputButton className="comment-btn" placeholder="Comment" onclick={onComment}>
					{#snippet icon()}
						<Reply variant="outline" size={18} strokeWidth={1.4} color="hsl(var(--white33))" />
					{/snippet}
					{#snippet trailing()}{/snippet}
				</InputButton>
			{:else if hasForm}
				<button type="button" class="btn-primary-large w-full join-button" onclick={onJoin}>
					Join {communityName || 'community'}
				</button>
			{:else}
				<p class="bottom-bar-muted">Join is not configured for this community.</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.bottom-bar-wrapper {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	.bottom-bar {
		flex-shrink: 0;
		align-self: center;
		width: 100%;
		max-width: 100%;
		margin: 0;
		background: hsl(var(--gray66));
		border-radius: var(--radius-32) var(--radius-32) 0 0;
		border: 0.33px solid hsl(var(--white8));
		border-bottom: none;
		box-shadow: 0 -4px 24px hsl(var(--black));
		padding: 12px;
		pointer-events: auto;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		max-height: 88px;
		overflow: hidden;
		transition:
			transform 0.25s cubic-bezier(0.33, 1, 0.68, 1),
			opacity 0.2s ease;
	}

	.modal-open .bottom-bar {
		transform: translateY(100%);
		opacity: 0;
		pointer-events: none;
	}
	.bottom-bar.guest {
		padding: 12px;
	}
	.bottom-bar-content {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.post-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 32px;
		min-height: 32px;
		padding: 0 20px 0 18px;
		flex-shrink: 0;
		background: var(--gradient-blurple);
		border: none;
		border-radius: var(--radius-16);
		cursor: pointer;
		color: hsl(var(--whiteEnforced));
		font-size: 16px;
		font-weight: 500;
		transition: transform 0.2s ease, box-shadow 0.2s ease;
		transform: scale(1);
	}
	.post-btn:hover {
		transform: scale(1.015);
		box-shadow:
			0 0 20px hsl(var(--primary) / 0.4),
			0 10px 40px -20px hsl(var(--primary) / 0.6);
	}
	.post-btn:active {
		transform: scale(0.98);
	}
	.search-forum-btn {
		flex: 1;
		min-width: 0;
		height: 38px;
		min-height: 38px;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 8px;
		padding: 0 16px;
		background: hsl(var(--black33));
		border: 0.33px solid hsl(var(--white33));
		border-radius: var(--radius-16);
		cursor: pointer;
		color: hsl(var(--white33));
		font-size: 16px;
		font-weight: 500;
		text-align: left;
	}
	.search-forum-btn span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.zap-button {
		gap: 8px;
		padding: 0 20px 0 18px;
		flex-shrink: 0;
	}
	.join-button {
		justify-content: center;
	}
	.bottom-bar-muted {
		margin: 0;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}
	@media (max-width: 767px) {
		.bottom-bar {
			padding: 16px;
		}
		.bottom-bar.guest {
			padding: 16px;
		}
	}
	@media (min-width: 768px) {
		.bottom-bar {
			max-width: 560px;
			margin-bottom: 16px;
			border-radius: 24px;
			border-bottom: 0.33px solid hsl(var(--white8));
			box-shadow: 0 40px 64px 12px hsl(var(--black));
		}
		.post-btn {
			height: 42px;
			min-height: 42px;
		}
		.search-forum-btn {
			height: 42px;
			min-height: 42px;
		}
	}
</style>

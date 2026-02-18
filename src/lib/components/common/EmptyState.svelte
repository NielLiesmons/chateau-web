<script lang="js">
/**
 * EmptyState - Matches webapp app/stack SocialTabs: same panel, text styling, and top padding above text.
 * When minHeight is set (e.g. 600), content is top-aligned with 16px padding above the text (same as webapp .tab-content padding-top).
 */
let { message = '', minHeight } = $props();
</script>

<div
	class="empty-state-panel"
	class:empty-state-tall={minHeight != null}
	style={minHeight != null ? `min-height: ${typeof minHeight === 'number' ? `${minHeight}px` : minHeight};` : ''}
>
	<p class="empty-state-text">{message}</p>
</div>

<style>
	.empty-state-panel {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--gray16));
		border-radius: 16px;
	}
	/* Webapp-style: when tall, top-align with 16px padding above text (matches .tab-content padding-top) */
	.empty-state-panel.empty-state-tall {
		align-items: flex-start;
		justify-content: center;
		padding-top: 16px;
	}
	.empty-state-text {
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--white16));
		text-align: center;
		padding: 50px 0;
		margin: 0;
	}
</style>

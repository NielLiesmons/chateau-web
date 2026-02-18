<script>
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { browser } from "$app/environment";

  export let open = false;
  /** Optional: called when modal is closed (backdrop click or Escape) */
  export let onClose = null;
  export let ariaLabel = "Modal dialog";
  export let zIndex = 50;
  export let maxWidth = "max-w-lg";

  function lockBodyScroll() {
    if (browser) {
      document.body.style.overflow = "hidden";
    }
  }

  function unlockBodyScroll() {
    if (browser) {
      document.body.style.overflow = "";
    }
  }

  $: if (browser) {
    if (open) {
      lockBodyScroll();
    } else {
      unlockBodyScroll();
    }
  }

  function close() {
    if (typeof onClose === "function") onClose();
    open = false;
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      close();
    }
  }

  function handleKeydown(e) {
    if (e.key === "Escape") {
      close();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
  <div
    class="modal-backdrop fixed inset-0 flex items-center justify-center bg-overlay"
    style="z-index: {zIndex};"
    transition:fade={{ duration: 200 }}
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-label={ariaLabel}
    tabindex="-1"
  >
    <div
      class="modal-container relative w-full {maxWidth} m-4 border-subtle overflow-hidden backdrop-blur-lg rounded-[32px]"
      style="background: hsl(var(--gray66)); border: 0.33px solid hsl(var(--white8));"
      transition:fly={{ y: 20, duration: 200, easing: cubicOut }}
      onclick={(e) => e.stopPropagation()}
      role="document"
      tabindex="-1"
    >
      <div class="modal-content p-6">
        <slot />
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-content {
    max-height: 80vh;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--white16)) transparent;
  }

  .modal-content::-webkit-scrollbar {
    width: 6px;
  }

  .modal-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .modal-content::-webkit-scrollbar-thumb {
    background-color: hsl(var(--white16));
    border-radius: 3px;
  }

  .modal-content::-webkit-scrollbar-thumb:hover {
    background-color: hsl(var(--white33));
  }

  .bg-overlay {
    background: hsl(0 0% 7% / 0.80);
  }
</style>

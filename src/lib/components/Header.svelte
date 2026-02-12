<script lang="ts">
  import { Search } from 'lucide-svelte';
  import { onMount } from 'svelte';

  interface Props {
    onGetStarted?: () => void;
  }

  let { onGetStarted }: Props = $props();

  let scrolled = $state(false);

  onMount(() => {
    const handleScroll = () => {
      scrolled = window.scrollY > 10;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  });
</script>

<header
  class="fixed top-0 left-0 right-0 z-50 transition-all duration-300 h-16"
  class:scrolled={scrolled}
  style="backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);"
>
  <nav class="container mx-auto h-full px-4 sm:px-6 md:px-8">
    <div class="flex items-center justify-between gap-6 h-full">
      <!-- Logo -->
      <div class="flex items-center gap-3">
        <svg width="38" height="48" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-7 lg:h-8 w-auto flex-shrink-0">
          <defs>
            <linearGradient id="chateau-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color: hsl(252, 100%, 72%);" />
              <stop offset="100%" style="stop-color: hsl(241, 100%, 68%);" />
            </linearGradient>
          </defs>
          <path d="M12.9331 46.8902L0.0607555 2.20135C-0.173983 1.38641 0.292202 0.534787 1.10201 0.299195C1.91182 0.0636028 2.75859 0.533255 2.99333 1.34819L15.8657 46.037C16.1005 46.852 15.6343 47.7036 14.8245 47.9392C14.0147 48.1748 13.1679 47.7051 12.9331 46.8902Z" fill="url(#chateau-logo-gradient)"/>
          <path d="M21.7663 1.39501C13.241 -0.316389 8.55784 -0.0736039 6.67019 0.176475C6.13863 0.246896 5.8744 0.800356 6.10004 1.28991C6.53476 2.2331 7.24506 3.78105 7.97765 5.40646C8.51885 6.60726 8.95486 7.6941 9.26865 8.51995C9.60411 9.40282 10.5604 9.92704 11.482 9.74561C12.4674 9.55164 13.9551 9.28876 16.0978 8.97692C19.3497 8.50368 22.9139 8.48585 24.8112 8.52028C25.1227 8.52593 25.1957 8.9502 24.9068 9.06739C23.2045 9.758 20.082 11.0742 17.3395 12.4995C14.9353 13.749 13.4495 14.8922 12.6445 15.6081C12.1233 16.0716 11.9119 16.7656 11.9858 17.4619C12.0876 18.4219 12.2487 19.9079 12.4308 21.4668C12.5805 22.7483 12.9067 24.4589 13.2039 25.8843C13.3792 26.7247 14.6933 26.8959 15.1691 26.1835C16.8451 23.6744 20.3135 19.5512 26.8793 15.4386C35.3623 10.1253 37.464 4.95103 37.9815 2.56559C38.118 1.93645 37.474 1.49021 36.8581 1.6653C34.7513 2.26428 29.9639 3.04065 21.7663 1.39501Z" fill="url(#chateau-logo-gradient)"/>
        </svg>
        <span class="app-name font-semibold tracking-tight">Chateau</span>
      </div>

      <!-- Search Bar -->
      <div class="hidden sm:flex flex-1 justify-center px-3 min-w-0 max-w-xl">
        <button
          type="button"
          class="flex items-center gap-3 w-full h-10 px-3 rounded-lg border transition-all"
          style="border-color: hsl(var(--white16)); background: hsl(var(--white8) / 0.5);"
        >
          <Search class="h-5 w-5 flex-shrink-0" style="color: hsl(var(--white33));" />
          <span class="flex-1 text-left" style="color: hsl(var(--white33));">
            Search Communities
          </span>
        </button>
      </div>

      <!-- Get Started Button -->
      <button 
        type="button" 
        onclick={onGetStarted} 
        class="btn-primary-small h-10 px-4"
      >
        <span class="sm:hidden">Start</span>
        <span class="hidden sm:inline">Get Started</span>
      </button>
    </div>
  </nav>
</header>

<style>
  header {
    background: transparent;
    border-bottom: 1.4px solid hsl(var(--white11));
  }
  
  header.scrolled {
    background-color: hsl(var(--background) / 0.6);
    border-bottom: 1.4px solid hsl(var(--white11));
  }

  /* App name sizing */
  .app-name {
    font-size: 1.125rem; /* 18px on mobile */
    line-height: 1.2;
  }

  @media (min-width: 1024px) {
    .app-name {
      font-size: 1.375rem; /* 22px on desktop */
    }
  }

  /* Exact button style from webapp */
  .btn-primary-small {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    padding: 0 14px;
    font-size: 14px;
    font-weight: 500;
    color: hsl(var(--primary-foreground));
    background-image: var(--gradient-blurple);
    background-color: transparent;
    border: none;
    border-radius: 9999px;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    transform: scale(1);
  }

  .btn-primary-small:hover {
    transform: scale(1.025);
    box-shadow:
      0 0 20px hsl(var(--primary) / 0.4),
      0 10px 40px -20px hsl(var(--primary) / 0.6);
  }

  .btn-primary-small:active {
    transform: scale(0.98);
  }
</style>

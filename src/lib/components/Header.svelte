<script>
  import { Search } from 'lucide-svelte';
  import { onMount } from 'svelte';

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

<style>
  header {
    background: transparent;
    border-bottom: 1px solid transparent;
  }
  
  header.scrolled {
    background-color: hsl(var(--background) / 0.6);
    border-bottom: 1px solid hsl(var(--border) / 0.5);
  }
</style>

<header
  class="fixed top-0 left-0 right-0 z-50 transition-all duration-300 h-16"
  class:scrolled={scrolled}
  style="backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);"
>
  <nav class="container mx-auto h-full px-4 sm:px-6 md:px-8">
    <div class="flex items-center justify-between gap-6 h-full">
      <!-- Logo -->
      <div class="flex items-center gap-3">
        <span class="font-semibold text-lg lg:text-xl tracking-tight">Chateau</span>
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

      <!-- Right side placeholder -->
      <div class="w-10"></div>
    </div>
  </nav>
</header>

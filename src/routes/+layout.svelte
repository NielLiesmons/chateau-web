<script>
  import '../app.css';
  
  let { children } = $props();
</script>

<div class="min-h-screen relative bg-background">
  <!-- Subtle gradient overlay -->
  <div class="fixed inset-0 bg-gradient-subtle pointer-events-none"></div>
  <!-- Noise/dither for depth -->
  <div class="fixed inset-0 bg-dither pointer-events-none opacity-40"></div>

  <div class="relative z-10">
    {@render children()}
  </div>
</div>

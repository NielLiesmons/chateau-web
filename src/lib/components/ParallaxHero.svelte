<script>
  import { onMount } from 'svelte';

  let heroElement;
  let scrollY = 0;
  let windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;

  // Content type emoji configuration - using transparent PNG emojis
  // These will float around the hero section
  export let emojiConfigs = [
    // Featured content types (large, prominent positions)
    { imageUrl: `/images/emoji/community.png`, x: -400, y: -170, size: 1.9, rotationX: 12, rotationY: -15 },
    { imageUrl: `/images/emoji/forum.png`, x: 380, y: -190, size: 2.0, rotationX: 20, rotationY: 14 },
    { imageUrl: `/images/emoji/chat.png`, x: -456, y: 155, size: 2.0, rotationX: -20, rotationY: -20 },
    { imageUrl: `/images/emoji/group.png`, x: 470, y: 160, size: 1.9, rotationX: -16, rotationY: 16 },
    { imageUrl: `/images/emoji/note.png`, x: -105, y: -310, size: 1.9, rotationX: 25, rotationY: -22 },
    
    // Middle emojis
    { imageUrl: `/images/emoji/thread.png`, x: -360, y: 0, size: 1.3, rotationX: -18, rotationY: -20 },
    { imageUrl: `/images/emoji/comment.png`, x: 360, y: -10, size: 1.2, rotationX: 16, rotationY: 18 },
    
    // Secondary emojis (medium-large, fill out the space)
    { imageUrl: `/images/emoji/article.png`, x: -840, y: -400, size: 1.6, rotationX: -20, rotationY: 25 },
    { imageUrl: `/images/emoji/podcast.png`, x: 840, y: -400, size: 1.5, rotationX: -18, rotationY: -22 },
    { imageUrl: `/images/emoji/video.png`, x: -840, y: 600, size: 1.4, rotationX: 20, rotationY: 18 },
    { imageUrl: `/images/emoji/music.png`, x: 840, y: 600, size: 1.3, rotationX: 18, rotationY: -20 },
    { imageUrl: `/images/emoji/event.png`, x: -720, y: -300, size: 1.8, rotationX: 20, rotationY: -15 },
    { imageUrl: `/images/emoji/live.png`, x: 720, y: -300, size: 1.8, rotationX: 20, rotationY: 15 },
    { imageUrl: `/images/emoji/book.png`, x: -720, y: 500, size: 1.7, rotationX: -20, rotationY: 25 },
    { imageUrl: `/images/emoji/wiki.png`, x: 720, y: 500, size: 1.7, rotationX: -20, rotationY: -25 },
    { imageUrl: `/images/emoji/poll.png`, x: -600, y: -200, size: 1.6, rotationX: 18, rotationY: -18 },
    { imageUrl: `/images/emoji/task.png`, x: 600, y: -200, size: 1.6, rotationX: 18, rotationY: 18 },
    
    // More grid positions
    { imageUrl: `/images/emoji/album.png`, x: -840, y: 0, size: 1.2, rotationX: 16, rotationY: 22 },
    { imageUrl: `/images/emoji/badge.png`, x: 840, y: 300, size: 0.95, rotationX: -10, rotationY: -16 },
    { imageUrl: `/images/emoji/mail.png`, x: -580, y: -20, size: 0.9, rotationX: 12, rotationY: 15 },
    { imageUrl: `/images/emoji/profile.png`, x: 580, y: -20, size: 0.85, rotationX: 10, rotationY: -14 },
    { imageUrl: `/images/emoji/zap.png`, x: -720, y: 100, size: 0.8, rotationX: -8, rotationY: 12 },
    { imageUrl: `/images/emoji/supporter.png`, x: 720, y: 100, size: 0.75, rotationX: -6, rotationY: -10 },
  ];

  // Calculate parallax speed based on size
  function calculateParallaxSpeed(size) {
    const minSize = 0.5;
    const maxSize = 2.8;
    const minSpeed = 0.15;
    const maxSpeed = 0.9;
    const normalizedSize = Math.max(minSize, Math.min(maxSize, size));
    const speed = minSpeed + ((normalizedSize - minSize) / (maxSize - minSize)) * (maxSpeed - minSpeed);
    return speed;
  }

  // Calculate opacity based on size
  function calculateOpacity(size) {
    const minSize = 0.5;
    const maxSize = 2.8;
    const minOpacity = 0.33;
    const maxOpacity = 1.0;
    const normalizedSize = Math.max(minSize, Math.min(maxSize, size));
    const opacity = minOpacity + ((normalizedSize - minSize) / (maxSize - minSize)) * (maxOpacity - minOpacity);
    return opacity;
  }

  // Calculate blur based on size
  function calculateBlur(size) {
    const baseSize = 1.9;
    const sizeDifference = Math.abs(size - baseSize);
    return sizeDifference * 1.2;
  }

  $: emojiPositions = emojiConfigs.map((config) => {
    return {
      ...config,
      parallaxSpeed: calculateParallaxSpeed(config.size),
      opacity: calculateOpacity(config.size),
      blur: calculateBlur(config.size)
    };
  });

  function handleResize() {
    windowWidth = window.innerWidth;
  }

  function handleScroll() {
    if (heroElement) {
      scrollY = window.scrollY;
    }
  }

  onMount(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    handleScroll();
    handleResize();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  });
</script>

<section
  bind:this={heroElement}
  class="relative h-[500px] sm:h-[480px] md:h-[520px] lg:h-[560px] flex items-center justify-center overflow-hidden"
  style="perspective: 2000px; perspective-origin: center center;"
>
  <!-- Background gradient orbs -->
  <div
    class="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] gradient-orb"
    style="background-color: hsl(var(--primary) / 0.09); filter: blur(280px);"
  ></div>
  <div
    class="absolute top-40 right-1/3 w-[400px] h-[400px] gradient-orb"
    style="background-color: hsl(var(--primary) / 0.1); filter: blur(120px); animation-delay: -4s;"
  ></div>
  <div
    class="absolute bottom-0 right-0 w-[500px] h-[500px] gradient-orb"
    style="background-color: hsl(var(--primary) / 0.15); filter: blur(140px); animation-delay: -2s;"
  ></div>

  <!-- Left gradient fade -->
  <div
    class="hidden md:block absolute left-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-20 pointer-events-none"
    style="background: linear-gradient(to right, hsl(var(--background) / 0.7) 0%, hsl(var(--background) / 0.5) 20%, hsl(var(--background) / 0.25) 50%, transparent 100%);"
  ></div>

  <!-- Right gradient fade -->
  <div
    class="hidden md:block absolute right-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-20 pointer-events-none"
    style="background: linear-gradient(to left, hsl(var(--background) / 0.7) 0%, hsl(var(--background) / 0.5) 20%, hsl(var(--background) / 0.25) 50%, transparent 100%);"
  ></div>

  <!-- Content type emojis with parallax -->
  <div
    class="absolute left-0 right-0 top-0 h-[490px] sm:h-full pointer-events-none"
    style="transform-style: preserve-3d;"
  >
    {#each emojiPositions as emojiData, index}
      {@const parallaxOffset = -scrollY * emojiData.parallaxSpeed}
      {@const cappedWidth = Math.min(windowWidth, 1440)}
      {@const baseSize = Math.max(30, (cappedWidth / 100) * 3.5)}
      {@const scaledSize = baseSize * emojiData.size}
      {@const baseXFactor = 0.6}
      {@const mobileBoost = windowWidth < 768 ? (1 - windowWidth / 768) * 0.15 : 0}
      {@const xFactor = baseXFactor + mobileBoost}
      {@const positionScaleX = 1.0 + (cappedWidth / 1920 - 1) * xFactor}
      {@const yFactor = 0.5}
      {@const positionScaleY = 1.0 + (cappedWidth / 1920 - 1) * yFactor}
      {@const scaledX = emojiData.x * positionScaleX}
      {@const scaledY = emojiData.y * positionScaleY}
      {@const translateZ = emojiData.size > 2.0 ? 150 : emojiData.size > 1.5 ? 120 : emojiData.size > 1.0 ? 100 : emojiData.size > 0.8 ? 0 : -100}
      
      <div
        class="absolute flex items-center justify-center"
        style="
          left: 50%;
          top: 50%;
          transform: 
            translate(-50%, -50%)
            translateX({scaledX}px)
            translateY({parallaxOffset + scaledY}px)
            translateZ({translateZ}px)
            rotateX({emojiData.rotationX}deg)
            rotateY({emojiData.rotationY}deg)
            scale({emojiData.size});
          transform-style: preserve-3d;
          opacity: {emojiData.opacity};
          filter: blur({emojiData.blur}px);
        "
      >
        <!-- Emoji image - transparent PNG, no container -->
        <img
          src={emojiData.imageUrl}
          alt="Content type"
          decoding="async"
          fetchpriority={index < 6 ? 'high' : 'low'}
          class="w-full h-full object-contain"
          style="
            width: {baseSize}px;
            height: {baseSize}px;
            backface-visibility: hidden;
            transform: translateZ(0);
          "
        />
      </div>
    {/each}
  </div>

  <!-- Central text -->
  <div class="relative z-10 text-center px-4 -mt-2 sm:mt-0">
    <h1 class="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl leading-tight mb-6 font-bold">
      <span
        style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;"
      >
        Community.
      </span>
      <br />
      <span
        style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;"
      >
        Collaboration.
      </span>
    </h1>
    <p class="text-lg sm:text-xl text-muted-foreground max-w-[260px] sm:max-w-none mx-auto">
      Building communities together
    </p>
  </div>
</section>

<style>
  .gradient-orb {
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.6;
    animation: float 20s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% {
      transform: translate(0, 0) scale(1);
    }
    50% {
      transform: translate(30px, -30px) scale(1.1);
    }
  }
</style>

<script>
  import { onMount } from 'svelte';

  export let onExplore = undefined;

  let heroElement;
  let exploreButton;
  let scrollY = 0;
  let windowWidth = 1920;

  function handleExploreButtonMouseMove(event) {
    if (!exploreButton) return;
    const rect = exploreButton.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    exploreButton.style.setProperty('--mouse-x', `${x}px`);
    exploreButton.style.setProperty('--mouse-y', `${y}px`);
  }

  // Content type emoji configuration - using transparent PNG emojis
  // Desktop-first layout that scales and translates for mobile
  // Smaller sizes and simple rotation only (no 3D tilt)
  const emojiConfigs = [
    // Featured content types (medium-large, prominent positions)
    { imageUrl: `/images/emoji/community.png`, x: -480, y: -190, size: 1.4, rotation: 12 }, // moved up
    { imageUrl: `/images/emoji/forum.png`, x: 460, y: -210, size: 1.5, rotation: -15 }, // moved up
    { imageUrl: `/images/emoji/chat.png`, x: -400, y: 155, size: 1.5, rotation: 20 }, // moved more towards center
    { imageUrl: `/images/emoji/group.png`, x: 420, y: 160, size: 1.4, rotation: -18 }, // moved more towards center
    { imageUrl: `/images/emoji/note.png`, x: -140, y: -310, size: 1.4, rotation: 8 },
    { imageUrl: `/images/emoji/article.png`, x: 220, y: -290, size: 1.3, rotation: -12 },
    
    // Middle emojis - moved away from center
    { imageUrl: `/images/emoji/thread.png`, x: -500, y: 0, size: 1.0, rotation: -10 },
    { imageUrl: `/images/emoji/comment.png`, x: 500, y: -10, size: 0.95, rotation: 15 },
    
    // Bottom center left and right (NEW)
    { imageUrl: `/images/emoji/video.png`, x: -230, y: 240, size: 1.1, rotation: 18 },
    { imageUrl: `/images/emoji/music.png`, x: 230, y: 240, size: 1.1, rotation: -20 },
    
    // Secondary emojis (medium, fill out the space)
    { imageUrl: `/images/emoji/podcast.png`, x: -890, y: -400, size: 1.2, rotation: 25 },
    { imageUrl: `/images/emoji/event.png`, x: 890, y: -400, size: 1.1, rotation: -22 },
    { imageUrl: `/images/emoji/live.png`, x: -890, y: 600, size: 1.0, rotation: 18 },
    { imageUrl: `/images/emoji/book.png`, x: 890, y: 600, size: 1.0, rotation: -20 },
    { imageUrl: `/images/emoji/wiki.png`, x: -770, y: -300, size: 1.3, rotation: -15 },
    { imageUrl: `/images/emoji/poll.png`, x: 770, y: -300, size: 1.3, rotation: 15 },
    { imageUrl: `/images/emoji/task.png`, x: -770, y: 500, size: 1.2, rotation: 25 },
    { imageUrl: `/images/emoji/badge.png`, x: 770, y: 500, size: 1.2, rotation: -25 },
    
    // More grid positions
    { imageUrl: `/images/emoji/album.png`, x: -890, y: 0, size: 0.9, rotation: 22 },
    { imageUrl: `/images/emoji/supporter.png`, x: 890, y: 300, size: 0.7, rotation: -16 },
    { imageUrl: `/images/emoji/mail.png`, x: -680, y: -20, size: 0.7, rotation: 15 },
    { imageUrl: `/images/emoji/profile.png`, x: 680, y: -20, size: 0.65, rotation: -14 },
    { imageUrl: `/images/emoji/zap.png`, x: -770, y: 100, size: 0.6, rotation: 12 },
    { imageUrl: `/images/emoji/repository.png`, x: 770, y: 100, size: 0.55, rotation: -10 },
  ];

  // Calculate parallax speed based on size
  function calculateParallaxSpeed(size) {
    const minSize = 0.5;
    const maxSize = 2.0;
    const minSpeed = 0.15;
    const maxSpeed = 0.9;
    const normalizedSize = Math.max(minSize, Math.min(maxSize, size));
    const speed = minSpeed + ((normalizedSize - minSize) / (maxSize - minSize)) * (maxSpeed - minSpeed);
    return speed;
  }

  // Calculate opacity based on size
  function calculateOpacity(size) {
    const minSize = 0.5;
    const maxSize = 2.0;
    const minOpacity = 0.33;
    const maxOpacity = 1.0;
    const normalizedSize = Math.max(minSize, Math.min(maxSize, size));
    const opacity = minOpacity + ((normalizedSize - minSize) / (maxSize - minSize)) * (maxOpacity - minOpacity);
    return opacity;
  }

  // Calculate blur based on size
  function calculateBlur(size) {
    const baseSize = 1.4;
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
    // Set initial values
    windowWidth = window.innerWidth;
    scrollY = window.scrollY;
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  });
</script>

<section
  bind:this={heroElement}
  class="relative h-[500px] sm:h-[480px] md:h-[520px] lg:h-[600px] flex items-center justify-center overflow-hidden"
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
  >
    {#each emojiPositions as emojiData, index}
      {@const parallaxOffset = -scrollY * emojiData.parallaxSpeed}
      {@const cappedWidth = Math.min(windowWidth, 1440)}
      {@const baseSize = Math.max(30, (cappedWidth / 100) * 3.5)}
      {@const baseXFactor = 0.6}
      {@const mobileBoost = windowWidth < 768 ? (1 - windowWidth / 768) * 0.15 : 0}
      {@const xFactor = baseXFactor + mobileBoost}
      {@const positionScaleX = 1.0 + (cappedWidth / 1920 - 1) * xFactor}
      {@const yFactor = 0.5}
      {@const positionScaleY = 1.0 + (cappedWidth / 1920 - 1) * yFactor}
      {@const isTopFeatured = index === 0 || index === 1}
      {@const isBottomFeatured = index === 2 || index === 3}
      {@const isMiddle = index === 6 || index === 7}
      {@const mobileOffsetX =
        windowWidth < 768
          ? isTopFeatured
            ? emojiData.x > 0 ? -60 : 60
            : isBottomFeatured
              ? emojiData.x > 0 ? -70 : 70
              : isMiddle
                ? emojiData.x > 0 ? -45 : 45
                : emojiData.x > 0 ? -30 : 30
          : 0}
      {@const mobileYFactor = windowWidth < 768 ? 0.25 : 0}
      {@const scaledX = emojiData.x * positionScaleX + mobileOffsetX}
      {@const scaledY = emojiData.y * positionScaleY * (1 + mobileYFactor)}
      
      <div
        class="absolute flex items-center justify-center"
        style="
          left: 50%;
          top: 50%;
          transform: 
            translate(-50%, -50%)
            translateX({scaledX}px)
            translateY({parallaxOffset + scaledY}px)
            rotate({emojiData.rotation}deg)
            scale({emojiData.size});
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
          "
        />
      </div>
    {/each}
  </div>

  <!-- Central text -->
  <div class="relative z-10 text-center px-4 mt-8 sm:mt-12 lg:mt-0">
    <h1 class="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold mb-4 hero-title">
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
    <p class="hero-description text-muted-foreground max-w-[320px] sm:max-w-none mx-auto mb-8">
      Chat, Forum, Tasks and literally anything else
    </p>
    <button
      type="button"
      bind:this={exploreButton}
      onclick={onExplore}
      onmousemove={handleExploreButtonMouseMove}
      class="btn-glass-large"
    >
      Explore Communities
    </button>
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

  /* Exact btn-glass-large style from webapp */
  .btn-glass-large {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 46px;
    padding: 0 24px;
    font-size: 16px;
    font-weight: 500;
    color: hsl(var(--foreground));
    background-color: hsl(var(--white4));
    border: 1.4px solid hsl(var(--white16));
    border-radius: 16px;
    cursor: pointer;
    backdrop-filter: blur(var(--blur-sm));
    -webkit-backdrop-filter: blur(var(--blur-sm));
    transition: transform 0.2s ease;
    transform: scale(1);
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
  }

  .btn-glass-large::before {
    content: '';
    position: absolute;
    width: 100px;
    height: 100px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, transparent 70%);
    filter: blur(20px);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease, left 0.1s ease-out, top 0.1s ease-out;
    left: var(--mouse-x, 50%);
    top: var(--mouse-y, 50%);
    transform: translate(-50%, -50%);
  }

  .btn-glass-large:hover::before {
    opacity: 1;
  }

  .btn-glass-large:hover {
    transform: scale(1.015);
  }

  .btn-glass-large:active {
    transform: scale(0.98);
  }

  @media (max-width: 767px) {
    .btn-glass-large {
      height: 42px;
      padding: 0 18px;
    }
  }

  /* Hero title - tighter line height */
  .hero-title {
    line-height: 1.1;
  }

  /* Hero description sizing - same as app name */
  .hero-description {
    font-size: 1.125rem; /* 18px on mobile */
    line-height: 1.5;
  }

  @media (min-width: 1024px) {
    .hero-description {
      font-size: 1.375rem; /* 22px on desktop */
    }
  }
</style>

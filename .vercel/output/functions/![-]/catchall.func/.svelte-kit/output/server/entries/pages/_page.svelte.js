import { y as sanitize_props, z as rest_props, F as attributes, G as clsx, J as ensure_array_like, K as element, x as slot, N as bind_props, O as spread_props, P as attr_class, Q as attr_style, T as stringify, V as attr, X as head } from "../../chunks/index.js";
import { m as fallback } from "../../chunks/context.js";
/**
 * @license lucide-svelte v0.511.0 - ISC
 *
 * ISC License
 * 
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 * 
 */
const defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  "stroke-width": 2,
  "stroke-linecap": "round",
  "stroke-linejoin": "round"
};
function Icon($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  const $$restProps = rest_props($$sanitized_props, [
    "name",
    "color",
    "size",
    "strokeWidth",
    "absoluteStrokeWidth",
    "iconNode"
  ]);
  $$renderer.component(($$renderer2) => {
    let name = fallback($$props["name"], void 0);
    let color = fallback($$props["color"], "currentColor");
    let size = fallback($$props["size"], 24);
    let strokeWidth = fallback($$props["strokeWidth"], 2);
    let absoluteStrokeWidth = fallback($$props["absoluteStrokeWidth"], false);
    let iconNode = fallback($$props["iconNode"], () => [], true);
    const mergeClasses = (...classes) => classes.filter((className, index, array) => {
      return Boolean(className) && array.indexOf(className) === index;
    }).join(" ");
    $$renderer2.push(`<svg${attributes(
      {
        ...defaultAttributes,
        ...$$restProps,
        width: size,
        height: size,
        stroke: color,
        "stroke-width": absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
        class: clsx(mergeClasses("lucide-icon", "lucide", name ? `lucide-${name}` : "", $$sanitized_props.class))
      },
      void 0,
      void 0,
      void 0,
      3
    )}><!--[-->`);
    const each_array = ensure_array_like(iconNode);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let [tag, attrs] = each_array[$$index];
      element($$renderer2, tag, () => {
        $$renderer2.push(`${attributes({ ...attrs }, void 0, void 0, void 0, 3)}`);
      });
    }
    $$renderer2.push(`<!--]--><!--[-->`);
    slot($$renderer2, $$props, "default", {});
    $$renderer2.push(`<!--]--></svg>`);
    bind_props($$props, {
      name,
      color,
      size,
      strokeWidth,
      absoluteStrokeWidth,
      iconNode
    });
  });
}
function Search($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  /**
   * @license lucide-svelte v0.511.0 - ISC
   *
   * ISC License
   *
   * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
   *
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   *
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   *
   */
  const iconNode = [
    ["path", { "d": "m21 21-4.34-4.34" }],
    ["circle", { "cx": "11", "cy": "11", "r": "8" }]
  ];
  Icon($$renderer, spread_props([
    { name: "search" },
    $$sanitized_props,
    {
      /**
       * @component @name Search
       * @description Lucide SVG icon component, renders SVG Element with children.
       *
       * @preview ![img](data:image/svg+xml;base64,PHN2ZyAgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIgogIHdpZHRoPSIyNCIKICBoZWlnaHQ9IjI0IgogIHZpZXdCb3g9IjAgMCAyNCAyNCIKICBmaWxsPSJub25lIgogIHN0cm9rZT0iIzAwMCIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6ICNmZmY7IGJvcmRlci1yYWRpdXM6IDJweCIKICBzdHJva2Utd2lkdGg9IjIiCiAgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIgogIHN0cm9rZS1saW5lam9pbj0icm91bmQiCj4KICA8cGF0aCBkPSJtMjEgMjEtNC4zNC00LjM0IiAvPgogIDxjaXJjbGUgY3g9IjExIiBjeT0iMTEiIHI9IjgiIC8+Cjwvc3ZnPgo=) - https://lucide.dev/icons/search
       * @see https://lucide.dev/guide/packages/lucide-svelte - Documentation
       *
       * @param {Object} props - Lucide icons props and any valid SVG attribute
       * @returns {FunctionalComponent} Svelte component
       *
       */
      iconNode,
      children: ($$renderer2) => {
        $$renderer2.push(`<!--[-->`);
        slot($$renderer2, $$props, "default", {});
        $$renderer2.push(`<!--]-->`);
      },
      $$slots: { default: true }
    }
  ]));
}
function Header($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let onGetStarted = fallback($$props["onGetStarted"], void 0);
    let scrolled = false;
    $$renderer2.push(`<header${attr_class("fixed top-0 left-0 right-0 z-50 transition-all duration-300 h-16 svelte-1elxaub", void 0, { "scrolled": scrolled })} style="backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);"><nav class="container mx-auto h-full px-4 sm:px-6 md:px-8"><div class="flex items-center justify-between gap-6 h-full"><div class="flex items-center gap-3"><svg width="38" height="48" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="h-7 lg:h-8 w-auto flex-shrink-0"><defs><linearGradient id="chateau-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color: hsl(252, 100%, 72%);"></stop><stop offset="100%" style="stop-color: hsl(241, 100%, 68%);"></stop></linearGradient></defs><path d="M12.9331 46.8902L0.0607555 2.20135C-0.173983 1.38641 0.292202 0.534787 1.10201 0.299195C1.91182 0.0636028 2.75859 0.533255 2.99333 1.34819L15.8657 46.037C16.1005 46.852 15.6343 47.7036 14.8245 47.9392C14.0147 48.1748 13.1679 47.7051 12.9331 46.8902Z" fill="url(#chateau-logo-gradient)"></path><path d="M21.7663 1.39501C13.241 -0.316389 8.55784 -0.0736039 6.67019 0.176475C6.13863 0.246896 5.8744 0.800356 6.10004 1.28991C6.53476 2.2331 7.24506 3.78105 7.97765 5.40646C8.51885 6.60726 8.95486 7.6941 9.26865 8.51995C9.60411 9.40282 10.5604 9.92704 11.482 9.74561C12.4674 9.55164 13.9551 9.28876 16.0978 8.97692C19.3497 8.50368 22.9139 8.48585 24.8112 8.52028C25.1227 8.52593 25.1957 8.9502 24.9068 9.06739C23.2045 9.758 20.082 11.0742 17.3395 12.4995C14.9353 13.749 13.4495 14.8922 12.6445 15.6081C12.1233 16.0716 11.9119 16.7656 11.9858 17.4619C12.0876 18.4219 12.2487 19.9079 12.4308 21.4668C12.5805 22.7483 12.9067 24.4589 13.2039 25.8843C13.3792 26.7247 14.6933 26.8959 15.1691 26.1835C16.8451 23.6744 20.3135 19.5512 26.8793 15.4386C35.3623 10.1253 37.464 4.95103 37.9815 2.56559C38.118 1.93645 37.474 1.49021 36.8581 1.6653C34.7513 2.26428 29.9639 3.04065 21.7663 1.39501Z" fill="url(#chateau-logo-gradient)"></path></svg> <span class="app-name font-semibold tracking-tight svelte-1elxaub">Chateau</span></div> <div class="hidden sm:flex flex-1 justify-center px-3 min-w-0 max-w-xl"><button type="button" class="flex items-center gap-3 w-full h-10 px-3 rounded-lg border transition-all" style="border-color: hsl(var(--white16)); background: hsl(var(--white8) / 0.5);">`);
    Search($$renderer2, {
      class: "h-5 w-5 flex-shrink-0",
      style: "color: hsl(var(--white33));"
    });
    $$renderer2.push(`<!----> <span class="flex-1 text-left" style="color: hsl(var(--white33));">Search Communities</span></button></div> <button type="button" class="btn-primary-small h-10 px-4 svelte-1elxaub"><span class="sm:hidden">Start</span> <span class="hidden sm:inline">Get Started</span></button></div></nav></header>`);
    bind_props($$props, { onGetStarted });
  });
}
function ParallaxHero($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let emojiPositions;
    let onExplore = fallback($$props["onExplore"], void 0);
    let windowWidth = typeof window !== "undefined" ? window.innerWidth : 1920;
    const emojiConfigs = [
      // Featured content types (medium-large, prominent positions)
      {
        imageUrl: `/images/emoji/community.png`,
        x: -480,
        y: -190,
        size: 1.4,
        rotation: 12
      },
      // moved up
      {
        imageUrl: `/images/emoji/forum.png`,
        x: 460,
        y: -210,
        size: 1.5,
        rotation: -15
      },
      // moved up
      {
        imageUrl: `/images/emoji/chat.png`,
        x: -400,
        y: 155,
        size: 1.5,
        rotation: 20
      },
      // moved more towards center
      {
        imageUrl: `/images/emoji/group.png`,
        x: 420,
        y: 160,
        size: 1.4,
        rotation: -18
      },
      // moved more towards center
      {
        imageUrl: `/images/emoji/note.png`,
        x: -140,
        y: -310,
        size: 1.4,
        rotation: 8
      },
      {
        imageUrl: `/images/emoji/article.png`,
        x: 220,
        y: -290,
        size: 1.3,
        rotation: -12
      },
      // Middle emojis - moved away from center
      {
        imageUrl: `/images/emoji/thread.png`,
        x: -500,
        y: 0,
        size: 1,
        rotation: -10
      },
      {
        imageUrl: `/images/emoji/comment.png`,
        x: 500,
        y: -10,
        size: 0.95,
        rotation: 15
      },
      // Bottom center left and right (NEW)
      {
        imageUrl: `/images/emoji/video.png`,
        x: -230,
        y: 240,
        size: 1.1,
        rotation: 18
      },
      {
        imageUrl: `/images/emoji/music.png`,
        x: 230,
        y: 240,
        size: 1.1,
        rotation: -20
      },
      // Secondary emojis (medium, fill out the space)
      {
        imageUrl: `/images/emoji/podcast.png`,
        x: -890,
        y: -400,
        size: 1.2,
        rotation: 25
      },
      {
        imageUrl: `/images/emoji/event.png`,
        x: 890,
        y: -400,
        size: 1.1,
        rotation: -22
      },
      {
        imageUrl: `/images/emoji/live.png`,
        x: -890,
        y: 600,
        size: 1,
        rotation: 18
      },
      {
        imageUrl: `/images/emoji/book.png`,
        x: 890,
        y: 600,
        size: 1,
        rotation: -20
      },
      {
        imageUrl: `/images/emoji/wiki.png`,
        x: -770,
        y: -300,
        size: 1.3,
        rotation: -15
      },
      {
        imageUrl: `/images/emoji/poll.png`,
        x: 770,
        y: -300,
        size: 1.3,
        rotation: 15
      },
      {
        imageUrl: `/images/emoji/task.png`,
        x: -770,
        y: 500,
        size: 1.2,
        rotation: 25
      },
      {
        imageUrl: `/images/emoji/badge.png`,
        x: 770,
        y: 500,
        size: 1.2,
        rotation: -25
      },
      // More grid positions
      {
        imageUrl: `/images/emoji/album.png`,
        x: -890,
        y: 0,
        size: 0.9,
        rotation: 22
      },
      {
        imageUrl: `/images/emoji/supporter.png`,
        x: 890,
        y: 300,
        size: 0.7,
        rotation: -16
      },
      {
        imageUrl: `/images/emoji/mail.png`,
        x: -680,
        y: -20,
        size: 0.7,
        rotation: 15
      },
      {
        imageUrl: `/images/emoji/profile.png`,
        x: 680,
        y: -20,
        size: 0.65,
        rotation: -14
      },
      {
        imageUrl: `/images/emoji/zap.png`,
        x: -770,
        y: 100,
        size: 0.6,
        rotation: 12
      },
      {
        imageUrl: `/images/emoji/repository.png`,
        x: 770,
        y: 100,
        size: 0.55,
        rotation: -10
      }
    ];
    function calculateParallaxSpeed(size) {
      const minSize = 0.5;
      const maxSize = 2;
      const minSpeed = 0.15;
      const maxSpeed = 0.9;
      const normalizedSize = Math.max(minSize, Math.min(maxSize, size));
      const speed = minSpeed + (normalizedSize - minSize) / (maxSize - minSize) * (maxSpeed - minSpeed);
      return speed;
    }
    function calculateOpacity(size) {
      const minSize = 0.5;
      const maxSize = 2;
      const minOpacity = 0.33;
      const maxOpacity = 1;
      const normalizedSize = Math.max(minSize, Math.min(maxSize, size));
      const opacity = minOpacity + (normalizedSize - minSize) / (maxSize - minSize) * (maxOpacity - minOpacity);
      return opacity;
    }
    function calculateBlur(size) {
      const baseSize = 1.4;
      const sizeDifference = Math.abs(size - baseSize);
      return sizeDifference * 1.2;
    }
    emojiPositions = emojiConfigs.map((config) => {
      return {
        ...config,
        parallaxSpeed: calculateParallaxSpeed(config.size),
        opacity: calculateOpacity(config.size),
        blur: calculateBlur(config.size)
      };
    });
    $$renderer2.push(`<section class="relative h-[500px] sm:h-[480px] md:h-[520px] lg:h-[600px] flex items-center justify-center overflow-hidden svelte-1yn7q29"><div class="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] gradient-orb svelte-1yn7q29" style="background-color: hsl(var(--primary) / 0.09); filter: blur(280px);"></div> <div class="absolute top-40 right-1/3 w-[400px] h-[400px] gradient-orb svelte-1yn7q29" style="background-color: hsl(var(--primary) / 0.1); filter: blur(120px); animation-delay: -4s;"></div> <div class="absolute bottom-0 right-0 w-[500px] h-[500px] gradient-orb svelte-1yn7q29" style="background-color: hsl(var(--primary) / 0.15); filter: blur(140px); animation-delay: -2s;"></div> <div class="hidden md:block absolute left-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-20 pointer-events-none svelte-1yn7q29" style="background: linear-gradient(to right, hsl(var(--background) / 0.7) 0%, hsl(var(--background) / 0.5) 20%, hsl(var(--background) / 0.25) 50%, transparent 100%);"></div> <div class="hidden md:block absolute right-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-20 pointer-events-none svelte-1yn7q29" style="background: linear-gradient(to left, hsl(var(--background) / 0.7) 0%, hsl(var(--background) / 0.5) 20%, hsl(var(--background) / 0.25) 50%, transparent 100%);"></div> <div class="absolute left-0 right-0 top-0 h-[490px] sm:h-full pointer-events-none svelte-1yn7q29"><!--[-->`);
    const each_array = ensure_array_like(emojiPositions);
    for (let index = 0, $$length = each_array.length; index < $$length; index++) {
      let emojiData = each_array[index];
      const parallaxOffset = -0 * emojiData.parallaxSpeed;
      const cappedWidth = Math.min(windowWidth, 1440);
      const baseSize = Math.max(30, cappedWidth / 100 * 3.5);
      const baseXFactor = 0.6;
      const mobileBoost = windowWidth < 768 ? (1 - windowWidth / 768) * 0.15 : 0;
      const xFactor = baseXFactor + mobileBoost;
      const positionScaleX = 1 + (cappedWidth / 1920 - 1) * xFactor;
      const yFactor = 0.5;
      const positionScaleY = 1 + (cappedWidth / 1920 - 1) * yFactor;
      const isTopFeatured = index === 0 || index === 1;
      const isBottomFeatured = index === 2 || index === 3;
      const isMiddle = index === 6 || index === 7;
      const mobileOffsetX = windowWidth < 768 ? isTopFeatured ? emojiData.x > 0 ? -60 : 60 : isBottomFeatured ? emojiData.x > 0 ? -70 : 70 : isMiddle ? emojiData.x > 0 ? -45 : 45 : emojiData.x > 0 ? -30 : 30 : 0;
      const mobileYFactor = windowWidth < 768 ? 0.25 : 0;
      const scaledX = emojiData.x * positionScaleX + mobileOffsetX;
      const scaledY = emojiData.y * positionScaleY * (1 + mobileYFactor);
      $$renderer2.push(`<div class="absolute flex items-center justify-center svelte-1yn7q29"${attr_style(` left: 50%; top: 50%; transform: translate(-50%, -50%) translateX(${stringify(scaledX)}px) translateY(${stringify(parallaxOffset + scaledY)}px) rotate(${stringify(emojiData.rotation)}deg) scale(${stringify(emojiData.size)}); opacity: ${stringify(emojiData.opacity)}; filter: blur(${stringify(emojiData.blur)}px); `)}><img${attr("src", emojiData.imageUrl)} alt="Content type" decoding="async"${attr("fetchpriority", index < 6 ? "high" : "low")} class="w-full h-full object-contain svelte-1yn7q29"${attr_style(` width: ${stringify(baseSize)}px; height: ${stringify(baseSize)}px; `)}/></div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="relative z-10 text-center px-4 mt-8 sm:mt-12 lg:mt-0 svelte-1yn7q29"><h1 class="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold mb-4 hero-title svelte-1yn7q29"><span style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;" class="svelte-1yn7q29">Community.</span> <br class="svelte-1yn7q29"/> <span style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;" class="svelte-1yn7q29">Collaboration.</span></h1> <p class="hero-description text-muted-foreground max-w-[320px] sm:max-w-none mx-auto mb-8 svelte-1yn7q29">Chat, Forum, Tasks and literally anything else</p> <button type="button" class="btn-glass-large svelte-1yn7q29">Explore Communities</button></div></section>`);
    bind_props($$props, { onExplore });
  });
}
function Modal($$renderer, $$props) {
  let open = fallback($$props["open"], false);
  let ariaLabel = fallback($$props["ariaLabel"], "Modal dialog");
  let zIndex = fallback($$props["zIndex"], 50);
  let maxWidth = fallback($$props["maxWidth"], "max-w-lg");
  if (open) {
    $$renderer.push("<!--[-->");
    $$renderer.push(`<div class="modal-backdrop fixed inset-0 flex items-center justify-center bg-overlay svelte-ta60gp"${attr_style(`z-index: ${stringify(zIndex)};`)} role="dialog" aria-modal="true"${attr("aria-label", ariaLabel)} tabindex="-1"><div${attr_class(`modal-container relative w-full ${stringify(maxWidth)} m-4 border-subtle overflow-hidden backdrop-blur-lg rounded-[32px]`, "svelte-ta60gp")} style="background: hsl(var(--gray66)); border: 0.33px solid hsl(var(--white8));" role="document" tabindex="-1"><div class="modal-content p-6 svelte-ta60gp"><!--[-->`);
    slot($$renderer, $$props, "default", {});
    $$renderer.push(`<!--]--></div></div></div>`);
  } else {
    $$renderer.push("<!--[!-->");
  }
  $$renderer.push(`<!--]-->`);
  bind_props($$props, { open, ariaLabel, zIndex, maxWidth });
}
function _page($$renderer) {
  let comingSoonModalOpen = false;
  function openComingSoonModal() {
    comingSoonModalOpen = true;
  }
  let $$settled = true;
  let $$inner_renderer;
  function $$render_inner($$renderer2) {
    head("1uha8ag", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Chateau - Community Collaboration</title>`);
      });
      $$renderer3.push(`<meta name="description" content="Chat, Forum, Tasks and literally anything else"/>`);
    });
    Header($$renderer2, { onGetStarted: openComingSoonModal });
    $$renderer2.push(`<!----> <main class="pt-16">`);
    ParallaxHero($$renderer2, { onExplore: openComingSoonModal });
    $$renderer2.push(`<!----></main> `);
    Modal($$renderer2, {
      ariaLabel: "Coming soon",
      get open() {
        return comingSoonModalOpen;
      },
      set open($$value) {
        comingSoonModalOpen = $$value;
        $$settled = false;
      },
      children: ($$renderer3) => {
        $$renderer3.push(`<div class="modal-content svelte-1uha8ag"><div class="logo-container svelte-1uha8ag"><svg width="80" height="80" viewBox="0 0 38 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="logo svelte-1uha8ag"><defs><linearGradient id="modal-logo-gradient" x1="100%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#5C5FFF"></stop><stop offset="100%" stop-color="#4542FF"></stop></linearGradient></defs><path d="M12.9331 46.8902L0.0607555 2.20135C-0.173983 1.38641 0.292202 0.534787 1.10201 0.299195C1.91182 0.0636028 2.75859 0.533255 2.99333 1.34819L15.8657 46.037C16.1005 46.852 15.6343 47.7036 14.8245 47.9392C14.0147 48.1748 13.1679 47.7051 12.9331 46.8902Z" fill="url(#modal-logo-gradient)"></path><path d="M21.7663 1.39501C13.241 -0.316389 8.55784 -0.0736039 6.67019 0.176475C6.13863 0.246896 5.8744 0.800356 6.10004 1.28991C6.53476 2.2331 7.24506 3.78105 7.97765 5.40646C8.51885 6.60726 8.95486 7.6941 9.26865 8.51995C9.60411 9.40282 10.5604 9.92704 11.482 9.74561C12.4674 9.55164 13.9551 9.28876 16.0978 8.97692C19.3497 8.50368 22.9139 8.48585 24.8112 8.52028C25.1227 8.52593 25.1957 8.9502 24.9068 9.06739C23.2045 9.758 20.082 11.0742 17.3395 12.4995C14.9353 13.749 13.4495 14.8922 12.6445 15.6081C12.1233 16.0716 11.9119 16.7656 11.9858 17.4619C12.0876 18.4219 12.2487 19.9079 12.4308 21.4668C12.5805 22.7483 12.9067 24.4589 13.2039 25.8843C13.3792 26.7247 14.6933 26.8959 15.1691 26.1835C16.8451 23.6744 20.3135 19.5512 26.8793 15.4386C35.3623 10.1253 37.464 4.95103 37.9815 2.56559C38.118 1.93645 37.474 1.49021 36.8581 1.6653C34.7513 2.26428 29.9639 3.04065 21.7663 1.39501Z" fill="url(#modal-logo-gradient)"></path></svg></div> <h2 class="modal-title svelte-1uha8ag">Coming Soon</h2> <p class="modal-subtitle svelte-1uha8ag">We're building something special. Stay tuned!</p> <button type="button" class="btn-primary-large w-full svelte-1uha8ag">Close</button></div>`);
      },
      $$slots: { default: true }
    });
    $$renderer2.push(`<!---->`);
  }
  do {
    $$settled = true;
    $$inner_renderer = $$renderer.copy();
    $$render_inner($$inner_renderer);
  } while (!$$settled);
  $$renderer.subsume($$inner_renderer);
}
export {
  _page as default
};

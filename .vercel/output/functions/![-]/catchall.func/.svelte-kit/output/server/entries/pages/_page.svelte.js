import { x as sanitize_props, y as rest_props, z as attributes, F as clsx, G as ensure_array_like, J as element, K as slot, N as bind_props, O as spread_props, P as attr_class, Q as attr_style, T as stringify, V as attr, X as head } from "../../chunks/index.js";
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
    let scrolled = false;
    $$renderer2.push(`<header${attr_class("fixed top-0 left-0 right-0 z-50 transition-all duration-300 h-16 svelte-1elxaub", void 0, { "scrolled": scrolled })} style="backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);"><nav class="container mx-auto h-full px-4 sm:px-6 md:px-8"><div class="flex items-center justify-between gap-6 h-full"><div class="flex items-center gap-3"><span class="font-semibold text-lg lg:text-xl tracking-tight">Chateau</span></div> <div class="hidden sm:flex flex-1 justify-center px-3 min-w-0 max-w-xl"><button type="button" class="flex items-center gap-3 w-full h-10 px-3 rounded-lg border transition-all" style="border-color: hsl(var(--white16)); background: hsl(var(--white8) / 0.5);">`);
    Search($$renderer2, {
      class: "h-5 w-5 flex-shrink-0",
      style: "color: hsl(var(--white33));"
    });
    $$renderer2.push(`<!----> <span class="flex-1 text-left" style="color: hsl(var(--white33));">Search Communities</span></button></div> <div class="w-10"></div></div></nav></header>`);
  });
}
function ParallaxHero($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let emojiPositions;
    let windowWidth = typeof window !== "undefined" ? window.innerWidth : 1920;
    let emojiConfigs = fallback(
      $$props["emojiConfigs"],
      () => [
        {
          imageUrl: `/images/emoji/community.png`,
          x: -400,
          y: -170,
          size: 1.9,
          rotationX: 12,
          rotationY: -15
        },
        {
          imageUrl: `/images/emoji/forum.png`,
          x: 380,
          y: -190,
          size: 2,
          rotationX: 20,
          rotationY: 14
        },
        {
          imageUrl: `/images/emoji/chat.png`,
          x: -456,
          y: 155,
          size: 2,
          rotationX: -20,
          rotationY: -20
        },
        {
          imageUrl: `/images/emoji/group.png`,
          x: 470,
          y: 160,
          size: 1.9,
          rotationX: -16,
          rotationY: 16
        },
        {
          imageUrl: `/images/emoji/note.png`,
          x: -105,
          y: -310,
          size: 1.9,
          rotationX: 25,
          rotationY: -22
        },
        {
          imageUrl: `/images/emoji/thread.png`,
          x: -360,
          y: 0,
          size: 1.3,
          rotationX: -18,
          rotationY: -20
        },
        {
          imageUrl: `/images/emoji/comment.png`,
          x: 360,
          y: -10,
          size: 1.2,
          rotationX: 16,
          rotationY: 18
        },
        {
          imageUrl: `/images/emoji/article.png`,
          x: -840,
          y: -400,
          size: 1.6,
          rotationX: -20,
          rotationY: 25
        },
        {
          imageUrl: `/images/emoji/podcast.png`,
          x: 840,
          y: -400,
          size: 1.5,
          rotationX: -18,
          rotationY: -22
        },
        {
          imageUrl: `/images/emoji/video.png`,
          x: -840,
          y: 600,
          size: 1.4,
          rotationX: 20,
          rotationY: 18
        },
        {
          imageUrl: `/images/emoji/music.png`,
          x: 840,
          y: 600,
          size: 1.3,
          rotationX: 18,
          rotationY: -20
        },
        {
          imageUrl: `/images/emoji/event.png`,
          x: -720,
          y: -300,
          size: 1.8,
          rotationX: 20,
          rotationY: -15
        },
        {
          imageUrl: `/images/emoji/live.png`,
          x: 720,
          y: -300,
          size: 1.8,
          rotationX: 20,
          rotationY: 15
        },
        {
          imageUrl: `/images/emoji/book.png`,
          x: -720,
          y: 500,
          size: 1.7,
          rotationX: -20,
          rotationY: 25
        },
        {
          imageUrl: `/images/emoji/wiki.png`,
          x: 720,
          y: 500,
          size: 1.7,
          rotationX: -20,
          rotationY: -25
        },
        {
          imageUrl: `/images/emoji/poll.png`,
          x: -600,
          y: -200,
          size: 1.6,
          rotationX: 18,
          rotationY: -18
        },
        {
          imageUrl: `/images/emoji/task.png`,
          x: 600,
          y: -200,
          size: 1.6,
          rotationX: 18,
          rotationY: 18
        },
        {
          imageUrl: `/images/emoji/album.png`,
          x: -840,
          y: 0,
          size: 1.2,
          rotationX: 16,
          rotationY: 22
        },
        {
          imageUrl: `/images/emoji/badge.png`,
          x: 840,
          y: 300,
          size: 0.95,
          rotationX: -10,
          rotationY: -16
        },
        {
          imageUrl: `/images/emoji/mail.png`,
          x: -580,
          y: -20,
          size: 0.9,
          rotationX: 12,
          rotationY: 15
        },
        {
          imageUrl: `/images/emoji/profile.png`,
          x: 580,
          y: -20,
          size: 0.85,
          rotationX: 10,
          rotationY: -14
        },
        {
          imageUrl: `/images/emoji/zap.png`,
          x: -720,
          y: 100,
          size: 0.8,
          rotationX: -8,
          rotationY: 12
        },
        {
          imageUrl: `/images/emoji/supporter.png`,
          x: 720,
          y: 100,
          size: 0.75,
          rotationX: -6,
          rotationY: -10
        }
      ],
      true
    );
    function calculateParallaxSpeed(size) {
      const minSize = 0.5;
      const maxSize = 2.8;
      const minSpeed = 0.15;
      const maxSpeed = 0.9;
      const normalizedSize = Math.max(minSize, Math.min(maxSize, size));
      const speed = minSpeed + (normalizedSize - minSize) / (maxSize - minSize) * (maxSpeed - minSpeed);
      return speed;
    }
    function calculateOpacity(size) {
      const minSize = 0.5;
      const maxSize = 2.8;
      const minOpacity = 0.33;
      const maxOpacity = 1;
      const normalizedSize = Math.max(minSize, Math.min(maxSize, size));
      const opacity = minOpacity + (normalizedSize - minSize) / (maxSize - minSize) * (maxOpacity - minOpacity);
      return opacity;
    }
    function calculateBlur(size) {
      const baseSize = 1.9;
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
    $$renderer2.push(`<section class="relative h-[500px] sm:h-[480px] md:h-[520px] lg:h-[560px] flex items-center justify-center overflow-hidden svelte-1yn7q29" style="perspective: 2000px; perspective-origin: center center;"><div class="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] gradient-orb svelte-1yn7q29" style="background-color: hsl(var(--primary) / 0.09); filter: blur(280px);"></div> <div class="absolute top-40 right-1/3 w-[400px] h-[400px] gradient-orb svelte-1yn7q29" style="background-color: hsl(var(--primary) / 0.1); filter: blur(120px); animation-delay: -4s;"></div> <div class="absolute bottom-0 right-0 w-[500px] h-[500px] gradient-orb svelte-1yn7q29" style="background-color: hsl(var(--primary) / 0.15); filter: blur(140px); animation-delay: -2s;"></div> <div class="hidden md:block absolute left-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-20 pointer-events-none svelte-1yn7q29" style="background: linear-gradient(to right, hsl(var(--background) / 0.7) 0%, hsl(var(--background) / 0.5) 20%, hsl(var(--background) / 0.25) 50%, transparent 100%);"></div> <div class="hidden md:block absolute right-0 top-0 bottom-0 w-24 sm:w-32 md:w-48 lg:w-64 xl:w-80 z-20 pointer-events-none svelte-1yn7q29" style="background: linear-gradient(to left, hsl(var(--background) / 0.7) 0%, hsl(var(--background) / 0.5) 20%, hsl(var(--background) / 0.25) 50%, transparent 100%);"></div> <div class="absolute left-0 right-0 top-0 h-[490px] sm:h-full pointer-events-none svelte-1yn7q29" style="transform-style: preserve-3d;"><!--[-->`);
    const each_array = ensure_array_like(emojiPositions);
    for (let index = 0, $$length = each_array.length; index < $$length; index++) {
      let emojiData = each_array[index];
      const parallaxOffset = -0 * emojiData.parallaxSpeed;
      const cappedWidth = Math.min(windowWidth, 1440);
      const baseSize = Math.max(30, cappedWidth / 100 * 3.5);
      baseSize * emojiData.size;
      const baseXFactor = 0.6;
      const mobileBoost = windowWidth < 768 ? (1 - windowWidth / 768) * 0.15 : 0;
      const xFactor = baseXFactor + mobileBoost;
      const positionScaleX = 1 + (cappedWidth / 1920 - 1) * xFactor;
      const yFactor = 0.5;
      const positionScaleY = 1 + (cappedWidth / 1920 - 1) * yFactor;
      const scaledX = emojiData.x * positionScaleX;
      const scaledY = emojiData.y * positionScaleY;
      const translateZ = emojiData.size > 2 ? 150 : emojiData.size > 1.5 ? 120 : emojiData.size > 1 ? 100 : emojiData.size > 0.8 ? 0 : -100;
      $$renderer2.push(`<div class="absolute flex items-center justify-center svelte-1yn7q29"${attr_style(` left: 50%; top: 50%; transform: translate(-50%, -50%) translateX(${stringify(scaledX)}px) translateY(${stringify(parallaxOffset + scaledY)}px) translateZ(${stringify(translateZ)}px) rotateX(${stringify(emojiData.rotationX)}deg) rotateY(${stringify(emojiData.rotationY)}deg) scale(${stringify(emojiData.size)}); transform-style: preserve-3d; opacity: ${stringify(emojiData.opacity)}; filter: blur(${stringify(emojiData.blur)}px); `)}><img${attr("src", emojiData.imageUrl)} alt="Content type" decoding="async"${attr("fetchpriority", index < 6 ? "high" : "low")} class="w-full h-full object-contain svelte-1yn7q29"${attr_style(` width: ${stringify(baseSize)}px; height: ${stringify(baseSize)}px; backface-visibility: hidden; transform: translateZ(0); `)}/></div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="relative z-10 text-center px-4 -mt-2 sm:mt-0 svelte-1yn7q29"><h1 class="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl leading-tight mb-6 font-bold svelte-1yn7q29"><span style="background: var(--gradient-gray); -webkit-background-clip: text; background-clip: text; color: transparent;" class="svelte-1yn7q29">Community.</span> <br class="svelte-1yn7q29"/> <span style="background: var(--gradient-blurple-light); -webkit-background-clip: text; background-clip: text; color: transparent;" class="svelte-1yn7q29">Collaboration.</span></h1> <p class="text-lg sm:text-xl text-muted-foreground max-w-[260px] sm:max-w-none mx-auto svelte-1yn7q29">Building communities together</p></div></section>`);
    bind_props($$props, { emojiConfigs });
  });
}
function _page($$renderer) {
  head("1uha8ag", $$renderer, ($$renderer2) => {
    $$renderer2.title(($$renderer3) => {
      $$renderer3.push(`<title>Chateau - Community Collaboration</title>`);
    });
    $$renderer2.push(`<meta name="description" content="Building communities together"/>`);
  });
  Header($$renderer);
  $$renderer.push(`<!----> <main class="pt-16">`);
  ParallaxHero($$renderer, {});
  $$renderer.push(`<!----></main>`);
}
export {
  _page as default
};

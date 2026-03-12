<script>
/**
 * ProjectBox — pointy-top hexagon for project status.
 *
 * States:
 *   backlog    → transparent fill, dotted white33 border
 *   planned    → black33 fill, white33 border + small centered dot
 *   inProgress → black33 fill + goldColor66 border + Circle50 in gold
 *   completed  → blurple gradient fill + white checkmark (no border)
 *   canceled   → destructive/33 fill + rouge Cross icon (no border)
 *
 * Rounded-corner hexagon paths (corner radius ≈ 1.5px):
 *   Small  (R=11):  viewBox 24×24, vertices at R=11 from center (12,12)
 *   Large  (R=11.5): same viewBox, slightly expanded for size ≥ 32
 */
import Circle50 from "$lib/components/icons/Circle50.svelte";
import Cross from "$lib/components/icons/Cross.svelte";
import Check from "$lib/components/icons/Check.svelte";

let {
  state = "backlog",
  size = 24,
  onclick = null
} = $props();

// All completed hexagons share the same gradient definition — duplicate <defs>
// across multiple SVGs in the same page is harmless since the colors are identical.
const GRAD_ID = "project-hex-blurple";

const PATH = $derived(
  size >= 32
    ? 'M 13.299,1.25 L 20.661,5.5 Q 21.96,6.25 21.96,7.75 L 21.96,16.25 Q 21.96,17.75 20.661,18.5 L 13.299,22.75 Q 12,23.5 10.701,22.75 L 3.339,18.5 Q 2.04,17.75 2.04,16.25 L 2.04,7.75 Q 2.04,6.25 3.339,5.5 L 10.701,1.25 Q 12,0.5 13.299,1.25 Z'
    : 'M 13.299,1.75 L 20.227,5.75 Q 21.526,6.5 21.526,8 L 21.526,16 Q 21.526,17.5 20.227,18.25 L 13.299,22.25 Q 12,23 10.701,22.25 L 3.773,18.25 Q 2.474,17.5 2.474,16 L 2.474,8 Q 2.474,6.5 3.773,5.75 L 10.701,1.75 Q 12,1 13.299,1.75 Z'
);

const sw        = 1.4;
const checkSw   = $derived(size >= 20 ? 2.8 : 1.4);
// iconSize drives Circle50 (tall 1:2 icon — needs the full half-height)
const iconSize  = $derived(size * 0.5);
// checkSize is smaller since Check is a square icon at the same visual weight
const checkSize = $derived(size * 0.42);
const crossSize = $derived(size * 0.33);
// Fixed VB constant → rendered stroke scales proportionally with icon size (~2.2px at size=24, ~1.5px at size=16)
const crossSw   = 4.2;
const dotR      = $derived(size >= 20 ? 2.2 : 1.8);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  style="position:relative; width:{size}px; height:{size}px; flex-shrink:0; display:inline-flex; cursor:{onclick ? 'pointer' : 'default'};"
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
  aria-label={onclick ? 'project status' : undefined}
  {onclick}
  onkeydown={onclick ? (e) => e.key === 'Enter' && onclick(e) : undefined}
>
  <svg viewBox="0 0 24 24" width={size} height={size} style="position:absolute; inset:0; display:block;">
    {#if state === 'completed'}
      <defs>
        <radialGradient id={GRAD_ID} cx="0%" cy="0%" r="150%" gradientUnits="objectBoundingBox">
          <stop offset="0%" stop-color="#5C5FFF" />
          <stop offset="100%" stop-color="#4542FF" />
        </radialGradient>
      </defs>
    {/if}

    <!-- Background fill -->
    {#if state === 'planned'}
      <path d={PATH} fill="hsl(var(--black33))" stroke="none" />
    {:else if state === 'inProgress'}
      <path d={PATH} fill="hsl(var(--black33))" stroke="none" />
    {:else if state === 'completed'}
      <path d={PATH} fill="url(#{GRAD_ID})" stroke="none" />
    {:else if state === 'canceled'}
      <path d={PATH} fill="hsl(var(--destructive) / 0.33)" stroke="none" />
    {:else}
      <path d={PATH} fill="transparent" stroke="none" />
    {/if}

    <!-- Border (backlog, planned, inProgress only) -->
    {#if state === 'backlog'}
      <path
        d={PATH}
        fill="none"
        stroke="hsl(var(--white33))"
        stroke-width={sw}
        stroke-dasharray="3.5 2.5"
        stroke-linecap="round"
      />
    {:else if state === 'planned'}
      <path d={PATH} fill="none" stroke="hsl(var(--white33))" stroke-width={sw} />
    {:else if state === 'inProgress'}
      <path d={PATH} fill="none" stroke="hsl(var(--goldColor66))" stroke-width={sw} />
    {/if}

    <!-- Small centered dot for 'planned' -->
    {#if state === 'planned'}
      <circle cx="12" cy="12" r={dotR} fill="hsl(var(--white33))" />
    {/if}

  </svg>

  <!-- Icon overlays -->
  {#if state === 'inProgress'}
    <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding-left:{Math.round(size * 0.25)}px; pointer-events:none;">
      <Circle50 variant="fill" color="hsl(var(--goldColor))" size={iconSize} />
    </div>
  {:else if state === 'completed'}
    <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none;">
      <Check variant="outline" color="white" strokeWidth={checkSw} size={checkSize} />
    </div>
  {:else if state === 'canceled'}
    <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none;">
      <Cross variant="outline" color="hsl(var(--destructive))" strokeWidth={crossSw} size={crossSize} />
    </div>
  {/if}
</div>

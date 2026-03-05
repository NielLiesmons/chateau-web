<script>
/**
 * MilestoneBox — rounded diamond shape with a single `percentage` prop.
 *
 *   0     → white16 track ring only, transparent fill  ("not started")
 *   1–99  → black33 fill + white11 track + blurple progress arc (clockwise from top)
 *   100   → blurple fill (no arc needed)
 *
 * Vertices at ±11 from center (24×24 viewBox).
 * Corners rounded with r=2 using quadratic bezier (Q) curves.
 * PATH: rounded diamond, perimeter ≈ 59.2
 */

let {
  percentage = 0,
  size = 24,
  onclick = null
} = $props();

const PERIMETER = 59.2;
// Rounded diamond: vertices at (12,1),(23,12),(12,23),(1,12), corners rounded r=2 via quadratic bezier
const PATH = 'M 13.4,2.4 L 21.6,10.6 Q 23,12 21.6,13.4 L 13.4,21.6 Q 12,23 10.6,21.6 L 2.4,13.4 Q 1,12 2.4,10.6 L 10.6,2.4 Q 12,1 13.4,2.4 Z';

const pct       = $derived(Math.max(0, Math.min(100, percentage)));
const isDone    = $derived(pct >= 100);
const hasArc    = $derived(pct > 0 && pct < 100);
const dashOff   = $derived(PERIMETER * (1 - pct / 100));
const sw        = 1.4;
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  style="flex-shrink:0; cursor:{onclick ? 'pointer' : 'default'}; display:block;"
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
  aria-label={onclick ? 'milestone status' : undefined}
  {onclick}
  onkeydown={onclick ? (e) => e.key === 'Enter' && onclick(e) : undefined}
>
  <!-- Background fill -->
  <path
    d={PATH}
    fill={isDone ? 'hsl(var(--blurpleColor))' : 'hsl(var(--black33))'}
    stroke="none"
  />

  <!-- Track ring (suppressed at 100% since fill covers it) -->
  {#if !isDone}
    <path
      d={PATH}
      fill="none"
      stroke={hasArc ? 'hsl(var(--white11))' : 'hsl(var(--white16))'}
      stroke-width={sw}
      stroke-linejoin="miter"
    />
  {/if}

  <!-- Progress arc: blurple, clockwise from top vertex -->
  {#if hasArc}
    <path
      d={PATH}
      fill="none"
      stroke="hsl(var(--blurpleColor))"
      stroke-width={sw}
      stroke-linejoin="miter"
      stroke-dasharray="{PERIMETER} 9999"
      stroke-dashoffset={dashOff}
    />
  {/if}
</svg>

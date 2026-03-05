<script>
/**
 * ProjectBox — pointy-top hexagon with a single `percentage` prop.
 *
 *   0     → white16 track ring only, transparent fill  ("not started")
 *   1–99  → black33 fill + white11 track + blurple progress arc (clockwise from top)
 *   100   → blurple fill + white checkmark icon  ("done")
 *
 * Circumradius R=11, center (12,12):
 *   top (0°):       (12,  1)
 *   upper-right:    (21.53, 6.5)
 *   lower-right:    (21.53, 17.5)
 *   bottom (180°):  (12, 23)
 *   lower-left:     (2.47, 17.5)
 *   upper-left:     (2.47, 6.5)
 * Side = 11 → Perimeter = 66
 */

let {
  percentage = 0,
  size = 24,
  onclick = null
} = $props();

/* Large sizes (32px+) use a slightly bigger hex (R=11.5) to fill more of the viewBox */
const PATH = $derived(
  size >= 32
    ? 'M 12,0.5 L 21.96,6.25 L 21.96,17.75 L 12,23.5 L 2.04,17.75 L 2.04,6.25 L 12,0.5'
    : 'M 12,1 L 21.53,6.5 L 21.53,17.5 L 12,23 L 2.47,17.5 L 2.47,6.5 L 12,1'
);
const PERIMETER = $derived(size >= 32 ? 69 : 66);

const pct      = $derived(Math.max(0, Math.min(100, percentage)));
const isDone   = $derived(pct >= 100);
const hasArc   = $derived(pct > 0 && pct < 100);
const dashOff  = $derived(PERIMETER * (1 - pct / 100));
const sw       = $derived(size >= 20 ? 1.5 : 1);
const checkSw  = $derived(size >= 20 ? 2.5 : 1.5);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<svg
  viewBox="0 0 24 24"
  width={size}
  height={size}
  style="flex-shrink:0; cursor:{onclick ? 'pointer' : 'default'}; display:block;"
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
  aria-label={onclick ? 'project status' : undefined}
  {onclick}
  onkeydown={onclick ? (e) => e.key === 'Enter' && onclick(e) : undefined}
>
  <!-- Background fill -->
  <path
    d={PATH}
    fill={isDone ? 'hsl(var(--blurpleColor))' : hasArc ? 'hsl(var(--black33))' : 'transparent'}
    stroke="none"
  />

  <!-- Track ring -->
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

  <!-- Checkmark at 100% -->
  {#if isDone}
    <path
      d="M 7.5,12.5 L 10.5,15.5 L 16.5,9"
      fill="none"
      stroke="white"
      stroke-width={checkSw}
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {/if}
</svg>

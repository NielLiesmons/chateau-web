# Communities: Two‑page layout and right‑page scoping

## Problem

- **Overlays (modals, bottom bar, detail header)** are currently full-viewport (fixed to window). We want them to behave as if they belong only to the **right “page”**: centered and clipped to that column, so they feel like part of the community content, not the whole app.
- **Mobile** uses a different layout than desktop, so we risk maintaining two UIs. We want **one mental model**: “left page” (list) and “right page” (community), with the same components and overlay behavior; only the shell (side‑by‑side vs stack/drawer) changes.

## Direction: one layout, one “page” model

### 1. Right column = single “page” viewport

- Treat the **right column** as the **only** viewport for community content and its overlays.
- On **desktop**: left column (list) + right column (community) side by side.
- On **mobile**: same right-column content; the list is either:
  - a **drawer** that slides over the right content, or
  - a **separate route** (e.g. `/communities` = list, `/communities/c/[npub]` = community) with a back nav that returns to the list.

So we avoid “mobile-only” and “desktop-only” UIs: the **right page is always the same** (same components, same modals, same bottom bar). Only the **shell** (layout + how we show the list) is responsive.

### 2. Scope overlays to the right column

**Option A – CSS “containing block” (recommended first step)**  
- Make the right column `position: relative` and give it a **containing block** for fixed descendants:
  - Either use `transform: translateZ(0)` (or any transform) on the right column so that `position: fixed` children are positioned relative to it (they then “belong” to the column).
  - Or use `position: fixed` on the right column itself and size it with `left: 360px; right: 0` on desktop and `left: 0; right: 0` on mobile, so the column is the full viewport on mobile; then modals/bars inside it use `position: fixed` with `inset: 0` and are already scoped to that column.
- **Modals**: render inside the right column (same DOM tree). They use `position: fixed; inset: 0` so they fill the **right column** (which is the fixed-size panel on desktop, or full screen on mobile). No need for `left: 360px` on each modal; the column’s bounds are the reference.
- **Bottom bar / detail header**: already overridden with `left: 360px; right: 0` in the communities page. With the column as the fixed container, they can instead be `left: 0; right: 0` **within** the column, and the column is positioned once.

**Option B – Portal root inside the right column**  
- Add a single “overlay root” node inside the right column (e.g. `<div class="right-page-overlay-root">`).
- All modals and fixed bars are rendered (or portaled) **into** this node. They use `position: fixed; left: 0; top: 0; right: 0; bottom: 0` so they fill the overlay root. The overlay root is `position: relative` and has the same size as the right column; with a transform or similar, it becomes the containing block so the fixed elements are clipped and positioned to the column.
- Same idea as A, but makes the “everything that overlays the right page” boundary explicit in the DOM.

**Option C – Nested route / layout**  
- Split into a **layout** that owns the two-column (or mobile) shell and a **child route** that owns only the right content:
  - e.g. `routes/communities/+layout.svelte` → left column + `<Outlet />` for the right.
  - `routes/communities/+page.svelte` = list (maybe redirect or show list in left column only).
  - `routes/communities/c/[npub]/+page.svelte` = community view (forum, members, post detail, etc.).
- Modals and bottom bar live in the **community** layout or page (the right content). They are already inside the right column in the DOM, so with Option A/B they automatically scope to that column.
- **Benefit**: URL reflects “which page” (list vs community vs post). Mobile can be the same routes: list = full screen list, community = full screen right page with back to list. One component tree for the right page.

### 3. Recommended path (short term)

1. **Containing block (Option A)**  
   - Right column: `position: relative` and e.g. `transform: translateZ(0)` so it becomes the containing block for fixed descendants.  
   - Ensure all overlays (modals, bottom bar, detail header) are **DOM descendants** of the right column.  
   - Set their positioning to `left: 0; right: 0` (and top/bottom as needed) so they fill the column; remove any `left: 360px` from overlay components so the column’s position is the only place that knows “we’re the right column”.

2. **Single responsive shell**  
   - One layout: on small width, right column is `left: 0; width: 100%` (or the left column becomes a drawer).  
   - Same modals, same bottom bar, same header; they all stay inside the right column and thus stay scoped.

3. **Later (if you want clearer URLs and even less duplication)**  
   - Move to a nested route (Option C) so the “right page” is literally a route (e.g. `.../c/[npub]` and `.../c/[npub]/post/[id]`).  
   - Then the community page and its modals/bars are in one place, and mobile = same routes with a different shell (list full screen vs community full screen with back).

### 4. What to change in code (concrete)

- **Communities +page.svelte**  
  - Wrap the right column in a single wrapper that has `position: relative` and `transform: translateZ(0)` (or equivalent) so it creates a containing block.  
  - Ensure every modal, the bottom bar, and the detail header are rendered **inside** this wrapper (not at root of the page).  
  - Overlays: use `position: fixed; inset: 0` (or left/right/top/bottom 0) so they fill this wrapper, not the window.  
  - Remove `left: 360px` from `.right-column :global(.bottom-bar-wrapper)` and `.right-column :global(.detail-header)` and instead size the **right column** with `left: 360px; right: 0` on desktop and full width on mobile; the bars then use full width of the column.

- **Mobile**  
  - Use the same right-column component; only the layout (grid/flex) changes so that on small screens the right column is full width and the list is hidden or shown as a drawer.  
  - Optionally use a child route for the community so the URL is `/communities/c/[npub]` and the list is at `/communities`; then “back” goes to the list and you don’t need a separate mobile UI.

This gives you: overlays and bars scoped and centered to the right page, and one layout that works on desktop and mobile without maintaining two UIs.

# Communities Screen — Minimal Plan

## Goal

A working, performant Chateau app that respects `spec/guidelines/ARCHITECTURE.md` (local-first, Dexie/liveQuery, universal loads, minimal loading states), with:

1. **Hero CTA** → opens `/communities`.
2. **Communities screen** (desktop): **list of communities on the left**, **chat-like panel on the right**.
3. **Right panel**: under the community name/header, a **row of pills** for **all content sections** that community defines (Chat, Forum, General, Apps, etc.). Selecting a pill shows that section’s content (chat thread, forum list, etc.).

## Architecture Constraints (from ARCHITECTURE.md)

- **Local-first:** UI renders from Dexie (IndexedDB) first; network is background refresh.
- **Universal loads:** Use `+page.js` (not `+page.server.js`) for `/communities` so client-side navigation and offline work: `if (browser) return { seedEvents: [] }`; SSR path queries server cache for seed community events.
- **Reactivity:** Community list and section content via Dexie `liveQuery`; relay subscriptions write to Dexie → UI updates automatically.
- **NIP-01 filters:** Same filter objects for server cache, client relay pool, and Dexie `queryEvents`.
- **Batch queries:** No N+1; collect keys and issue single batch queries.

## Data Model (Nostr)

- **Communities:** `kind:10222` (community definition). Pubkey = community id. Metadata from `kind:0` (name, **display_name**, picture, about).
- **Content sections:** From 10222 tags: `content` (section name), `k` (event kinds), `a` (profile list address `30000:<pubkey>:<d-tag>`).
- **Section content:** Events with `h` tag = community pubkey; filter by kind per section and `authors` from that section’s profile list.
- **Profile lists:** `kind:30000` for membership. Lists have a **unique `d`** (identifier) and can have **any badge-style name** (e.g. “Zapstore Member”, “Chateau Club”) via `name` tag — they do not have to match the content section name. `p` = members; `form` = 30168 address for Join (forms only).

## Route

- **`/communities`** — Main app screen (list + panel).

## Layout (Desktop)

```
┌─────────────────────────────────────────────────────────────────┐
│  [Chateau header - same as landing, "Get Started" can go to /]   │
├──────────────┬──────────────────────────────────────────────────┤
│ Communities  │  [Community name]                    [Moderation]  │
│              ├──────────────────────────────────────────────────┤
│ • Community A│  [Chat] [Forum] [General] [Apps] …  (pills)       │
│ • Community B│──────────────────────────────────────────────────│
│ • Community C│  Content area (chat messages / forum list / …)   │
│   …          │  (based on selected pill)                        │
│              │                                                  │
│ [Search]     │  [Composer or "Apply for access" if no perms]    │
└──────────────┴──────────────────────────────────────────────────┘
```

- **Left:** Scrollable list of communities (icon, name; optional unread indicator later). Selection sets “current community.”
- **Right:**  
  - **Header:** Current community name (+ optional moderation entry for admins).  
  - **Pills row:** One pill per content section from 10222 (e.g. Chat, Forum, General, Apps). Active pill = current section.  
  - **Content area:** Renders section content (e.g. kind 9 for Chat, 11 for Forum) filtered by `h` = community pubkey **and** `authors` = pubkeys with write access (from that section’s profile list, kind 30000).  
  - **Footer:** Composer if user is in section’s profile list; otherwise **“Join”** (opens form; forms only).

## Layout (Mobile)

- **Stacked:** List view first; tap community → full-width panel with same header + pills + content + composer. Back returns to list. (Matches existing community-app-plan goals with simplified spec.)

## Implementation Phases (Minimal)

### Phase 1 — List + shell

- **Route:** `/communities` with universal `+page.js` (SSR: seed from server cache for 10222; browser: empty).
- **Dexie:** Store 10222 and 0; ensure schema/indices support `kinds: [10222]` and tag `#h` (for section content).
- **Left column:** Fetch communities from Dexie via liveQuery (10222 + 0 for names/pictures). Show list; on select, set current community in local state (or URL, e.g. `/communities?c=<npub>`).
- **Right column:** Placeholder or “Select a community” until one is selected.

### Phase 2 — Pills + content

- **Parse 10222:** From selected community event, read `content` + `k` + `a` tags to build list of sections (name, kinds, profile list address).
- **Pills:** Render one pill per section; active = current section state.
- **Content area:** For selected section, build NIP-01 filter: `kinds` from section, `#h` = [community pubkey], and **`authors`** = [pubkeys from that section’s profile list (kind 30000)] so only posts from members with write access are shown. Subscribe via relay + write to Dexie; render from Dexie liveQuery (e.g. chat messages or forum list).
- **Composer:** Show only if current user pubkey is in section’s profile list (30000); otherwise “Join” (form only).

### Phase 3 — Polish

- **Server cache:** Poll relays for 10222 (and optionally 0) so SSR seed for `/communities` has recent communities.
- **Relay subscriptions:** Client subscribes to 10222 and section events (by kind + `#h`); batch write to Dexie; liveQuery drives UI.
- **Offline:** Universal load + Dexie ensures list and content work from cache when offline.

## Event Kinds (Chateau)

| Kind   | Use |
|--------|-----|
| 10222  | Community definition (sections, relays, profile lists) |
| 30000  | Profile list (membership per section) |
| 0      | Profile (community + user metadata) |
| 9      | Chat (one `h` = community) |
| 11     | Forum (one `h` = community) |
| 1111   | Comments (General section) |
| 7      | Reactions |
| 1985   | Labels |

No kind 30222; targeting is via `h` tag(s) on events.

## File Structure (aligned with ARCHITECTURE)

- `src/routes/communities/+page.svelte` — Layout (list + panel), pills, content area.
- `src/routes/communities/+page.js` — Universal load: SSR seed communities from server cache; browser return empty.
- `src/lib/nostr/` — Reuse/adapt: dexie (schema for 10222, 30000, 9, 11, …), queryEvents, putEvents, service (relay subs), server (cache).
- `src/lib/stores/` — e.g. `communities.svelte.js`: createCommunitiesQuery(), createSectionContentQuery(communityPubkey, section), current community/section state.
- `src/lib/nostr/models.js` — Parse 10222 → { pubkey, relays, sections: [{ name, kinds, profileListAddress }] }, parse 30000 for member list.

This gives a minimal, ARCHITECTURE-respecting path to a working Communities screen with list, section pills, and section content.

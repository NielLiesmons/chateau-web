# Forum-First Communities — Test Plan

## Scope (MVP for testing)

- **Content types:** **Forum (kind 11)** is the only section with real content for now. Other section types (Tasks, Chat, Apps, …) appear as **pills** but show **EmptyState** until implemented.
- **Community creation:** Allow **Forum** and **General** sections in the backend (10222). Each section has a **profile list** (kind 30000) and a **form** (kind 30168) for joining. **Join is forms-only** — no join path without a form.
- **Community kind 0:** Must include **display_name** (and name, picture, about) for the community.
- **Moderation:** Profile-list based. Members in the list can post; others see **“Join”** and submit the section’s form (kind 1069). Admin adds pubkey to profile list (30000) to grant access.

Reuse and adapt:

- **`ForumPost.svelte`** — list/card for forum posts (title, preview, author, timestamp, labels). Adapt props if needed for Nostr event shape.
- **`SocialTabs.svelte`** — make it **event-agnostic**: accept a “main event” (app, stack, or **forum post**) and load comments, zaps, labels, details. Same pattern as app/stack detail page.
- **`EmptyState.svelte`** — use for section pills that are not yet implemented (Tasks, Chat, Apps, …).
- **Forum post detail page** — same layout as app/stack detail: post on top (title, markdown + max height + “Read more”, label row), then **SocialTabs** below.

---

## 1. Community creation (simplified)

- **Kind 0 (community profile):** name, **display_name**, picture, about. display_name is the primary label for the community.
- **Kind 10222** with at least:
  - **Forum:** `content` = "Forum", `k` = 11, `a` = `30000:<community-pubkey>:<list-d-tag>` (profile list address). The list’s `d` tag is a unique id; the list’s **name** (e.g. “Chateau Club”) is independent — see Profile lists below.
  - **General:** `content` = "General", `k` = 1111, `k` = 7, `k` = 1985, `a` = `30000:<community-pubkey>:<list-d-tag>`.
- **Profile lists (30000):** Each list has a **unique `d`** (identifier, e.g. "forum-members", "general"). The list’s **display name** can be anything that makes sense for a badge: “Zapstore Member”, “Chateau Club”, “Forum Contributors”, etc. It does **not** have to match the content section name. Profile lists **are** the badge; use `name` tag (and optional `image`, `content` description) on 30000. **Form required for join:** `form` tag = `30168:<community-pubkey>:<form-id>`. No form = no join in MVP (forms only).
- **Form template (30168):** Simple fields (e.g. “Why do you want to join?”). Form response (kind 1069): content MUST be **NIP-44 encrypted** to the community pubkey (owner).

**Create-community flow (minimal):**

1. Community metadata (kind 0): name, **display_name**, picture, about.
2. Add section “Forum”: create profile list (30000) with a **badge-style name** (e.g. “Chateau Club”), unique `d`; create form (30168) and set `form` on profile list.
3. Add section “General”: same (profile list with its own name + `d`, form required for join).
4. Publish 10222 with `r` (relays), and for each section: `content`, `k`, `a` (profile list address). Publish 30000 and 30168 as needed.

---

## 2. Communities screen

- **Left:** List of communities (from 10222 + kind 0). Show **display_name** (fallback to name) and picture.
- **Right:**  
  - **Pills:** **Forum** (active content) plus **Tasks, Chat, Apps, …** (or other section names from 10222). **General is not a pill** — General is for comments/reactions/labels on content; it doesn’t get its own feed pill. For any non-Forum pill, show **EmptyState** (“Coming soon” or similar) for now.
  - **Forum list:** Query kind 11 with `#h` = [community pubkey] and `authors` = [pubkeys from the Forum section’s profile list]. Render each with **ForumPost.svelte** (link to forum post detail page).
  - **Composer:** Shown only if current user is in the section’s profile list; otherwise **“Join”** button that opens the form (form is required — no join without form).

---

## 3. Forum post detail page

- **Route:** e.g. `/communities/[communityNpub]/forum/[eventId]` or `/forum/[nevent]`.
- **Layout (same idea as app/stack detail):**
  - **Above the fold:** Forum post: author (ProfilePic + name), **title**, **body** (markdown with max height + “Read more”), **labels row**.
  - **Below:** **SocialTabs** — Comments, Zaps, Labels, Details for this forum post event.
- **SocialTabs:** Refactor to accept a generic main event (id, pubkey, kind, content, tags) so it works for apps, stacks, and forum posts.

---

## 4. Profile lists and Join (forms only)

- **Profile list (30000):** `d` = unique identifier (not necessarily section name). `name` (and optional `image`, `content`) = badge-style display name, e.g. “Zapstore Member”, “Chateau Club”. `p` = list of pubkeys. **`form` tag required for join in MVP:** `30168:<community-pubkey>:<form-id>`. Join is **forms only** — if there is no form, we do not offer a join path for that list.
- **Form template (30168):** Simple fields. **Form response (1069):** User submits; admin sees pending requests, approves by adding the user’s pubkey to the profile list (30000).

**Join flow:**

1. User clicks **“Join”** on a section they’re not in.
2. **Only if** the profile list has a `form` tag: fetch 30168, render form, on submit publish 1069.
3. If no form: do not show Join (or show disabled “Join” with tooltip “No form configured”). **Forms only** — no fallback “request access” event.
4. Admin: list pending 1069s for the community’s forms; approve = add pubkey to the right 30000.

---

## 5. Data flow (recap)

| What | How |
|------|-----|
| Communities | kind 10222; kind 0 with **display_name**, name, picture, about. |
| Section membership | kind 30000: **any badge-style name** (name tag), unique `d`, `p` = members, **form** = 30168 address (required for join). |
| Forum posts | kind 11, `#h` = community pubkey; filter `authors` by section’s profile list. |
| Comments / reactions / labels | kinds 1111, 7, 1985; target event by `#e` / `#a`. |
| Join | kind 30168 (template), kind 1069 (response). **Forms only.** Response content **NIP-44 encrypted** to community pubkey. |
| Grant access | Update 30000: add `p` for the new member. |

---

## 6. Implementation order

1. **Dexie + relays:** Support kinds 10222, 30000, 11, 1111, 7, 1985, 30168, 1069; `#h` and authors filter for forum list.
2. **Communities screen:** List communities (display_name); select one; pills: **Forum** + others (Tasks, Chat, Apps, …) with **EmptyState** for non-Forum. Forum tab = forum post list (ForumPost.svelte) + composer or Join (form only).
3. **Forum post detail page:** Post at top (title, markdown + Read more, labels); **SocialTabs** below (event-agnostic).
4. **Create community:** kind 0 (with display_name), 10222 (Forum + General sections), 30000 per section with **badge-style name** and unique `d`, 30168 form and `form` on 30000.
5. **Join:** “Join” opens form; submit 1069; admin approves by updating 30000. Forms only.

# Chateau

A fast, local-first web interface for Nostr-native communities.

Chateau lets communities publish and govern content — forum posts, tasks, wikis, chat — through access-controlled content sections backed by profile lists. Everything is built on the [Nostr community spec](spec/nostr/community.md): a single `kind:10222` event declares a community's relays, blossom servers, and content sections, each with a profile list controlling write access.

## What Chateau Does

- **Community feed** — Browse, filter, and engage with forum posts, tasks, and wikis in community sections
- **Access-controlled publishing** — Members can publish to sections they belong to; admins manage profile lists and form templates for join requests
- **Task tracking** — Create, assign, and track tasks with status, priority, and labels
- **Wiki articles** — Publish and browse wiki content (kind 30818) with editable slugs
- **Profile management** — Fetch and display author profiles, profile pic stacks, and membership badges
- **Local-first** — All data lives in IndexedDB via Dexie; the UI renders immediately from local data and updates reactively as relay events arrive

## Tech Stack

- **SvelteKit** — App framework with Svelte 5 (runes)
- **Dexie.js** — Reactive IndexedDB layer with `liveQuery`
- **nostr-tools** — Nostr protocol implementation
- **Tailwind CSS 4** — Styling
- **@sveltejs/adapter-vercel** — Deployed on Vercel

## Development

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun run dev
```

Open [http://localhost:5174](http://localhost:5174) in your browser (or whichever port Vite assigns).

## Commands

```bash
bun run build      # Build for production (Vercel adapter)
bun run preview    # Preview production build locally
bun run lint       # Run ESLint
bun run format     # Format code with Prettier
```

## Documentation

- `spec/guidelines/` — Architecture, design system, vision, invariants, and quality bar
- `spec/nostr/` — Nostr protocol specs (community, wiki, tasks, …)

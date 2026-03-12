/**
 * Pre-navigation event handoff.
 *
 * When navigating from a list card to a detail route, the source page stashes:
 *   - the full Nostr event
 *   - the resolved communityNpub (so the route page needs zero async work)
 *   - the relevant profile events already in memory (author + community)
 *     so the detail component can render the header on frame 0
 *
 * Each entry is consumed once (deleted on read) so stale data never leaks.
 *
 * @typedef {{
 *   event: import('nostr-tools').NostrEvent,
 *   communityNpub?: string,
 *   profiles?: Map<string, import('nostr-tools').NostrEvent>
 * }} HandoffEntry
 *
 * @type {Map<string, HandoffEntry>}
 */
export const navHandoff = new Map();

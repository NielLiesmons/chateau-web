/**
 * Application configuration
 */
// Catalog relays — the two sources for app/release/stack data
export const DEFAULT_CATALOG_RELAYS = [
    'wss://relay.zapstore.dev',
    'wss://relay.vertexlab.io'
];
// Social relays (profiles, comments, zaps) — damus first for broad profile visibility
export const DEFAULT_SOCIAL_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
];
// Community relay fallback — used ONLY when a community's kind:10222 declares no 'r' tags.
// Per the Nostr community spec, ALL community content must be fetched from the community's own
// declared relays. Only fall back here when none are declared.
export const DEFAULT_COMMUNITY_RELAYS = [...DEFAULT_SOCIAL_RELAYS];

// Profile relays (social + catalog for broad coverage)
export const PROFILE_RELAYS = [
    ...DEFAULT_SOCIAL_RELAYS,
    ...DEFAULT_CATALOG_RELAYS,
];
// Write-safe community relays — excludes relay.primal.net which is read-only and silently drops
// writes. Used as a last-resort fallback when a community declares no 'r' relays of its own.
export const COMMUNITY_WRITE_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
];
// Server-side poll interval (ms) — how often the server polls upstream relays
export const POLL_INTERVAL_MS = 60_000;
// Relay subscription timeout (ms after first EOSE)
export const EOSE_TIMEOUT = 2500;
// Dexie database name (used for clear-local-data fallback)
export const IDB_NAME = 'zapstore';
// Event kinds
export const EVENT_KINDS = {
    PROFILE: 0,
    RELAY_LIST: 10002, // NIP-65
    COMMENT: 1111,
    FILE_METADATA: 1063,
    ZAP_REQUEST: 9734,
    ZAP_RECEIPT: 9735,
    RELEASE: 30063,
    APP: 32267,
    APP_STACK: 30267,
    // Community (Chateau)
    COMMUNITY: 10222,
    PROFILE_LIST: 30000,
    FORUM_POST: 11,
    FORM_TEMPLATE: 30168,
    FORM_RESPONSE: 1069,
    REACTION: 7,
    LABEL: 1985,
    TASK: 37060,
    STATUS: 1983,
    WIKI: 30818,
    PROJECT: 30315,
    MILESTONE: 30316
};
// Platform filter — only Android arm64 is supported for now.
// Spread into every APP / RELEASE relay filter so the relay only returns matching events.
export const PLATFORM_FILTER = { '#f': ['android-arm64-v8a'] };
// Subscription prefixes (for relay backend identification)
export const SUB_PREFIX = 'web-';

/**
 * Personal Notification Store — per-community unread mention counts.
 *
 * Architecture:
 *  - A single Dexie liveQuery watches all kind:1111 events with a `p:<userPubkey>` tag.
 *  - For each mention, the root event (forum post / task) is looked up to find its
 *    `h` tag (community pubkey), since comments carry no h-tag of their own.
 *  - "Unread" = created_at > lastSeen[communityPubkey], persisted in localStorage.
 *  - A background relay subscription (subscribePersonalMentions) streams new
 *    mention events into Dexie, which triggers the liveQuery reactively.
 *
 * Usage:
 *   import { initNotifications, markCommRead, getNotifCount } from '$lib/stores/notifications.svelte.js';
 *
 *   // In a $effect (once communities + userPubkey are ready):
 *   const cleanup = initNotifications(communities, userPubkey);
 *   onDestroy(cleanup);
 *
 *   // When user selects a community:
 *   markCommRead(community.pubkey);
 *
 *   // In template (reactive — auto-tracks $state):
 *   {getNotifCount(community.pubkey)}
 */

import { browser } from '$app/environment';
import { liveQuery } from 'dexie';
import { db } from '$lib/nostr/dexie';
import { EVENT_KINDS, DEFAULT_COMMUNITY_RELAYS } from '$lib/config';
import { parseCommunity } from '$lib/nostr/models';
import { subscribePersonalMentions } from '$lib/nostr/service';

// ============================================================================
// State — module-level $state runes (Svelte 5 store pattern)
// ============================================================================

/**
 * Map<communityPubkey, number[]> — mention timestamps per community from Dexie.
 * Updated by the liveQuery whenever new kind:1111 events land in the DB.
 */
let _mentionTsByComm = $state(/** @type {Map<string, number[]>} */ (new Map()));

/**
 * Map<communityPubkey, unixTimestamp> — when the user last viewed each community.
 * Persisted in localStorage; read once on initNotifications().
 */
let _lastSeen = $state(/** @type {Map<string, number>} */ (new Map()));

// ============================================================================
// localStorage persistence
// ============================================================================

const STORAGE_KEY = 'chateau:notif:lastSeen';

function loadLastSeen() {
	if (!browser) return;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const obj = JSON.parse(raw);
			_lastSeen = new Map(Object.entries(obj).map(([k, v]) => [k, Number(v)]));
		}
	} catch {
		/* ignore — stale or corrupt data */
	}
}

function saveLastSeen() {
	if (!browser) return;
	try {
		/** @type {Record<string, number>} */
		const obj = {};
		for (const [k, v] of _lastSeen) obj[k] = v;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
	} catch {
		/* ignore */
	}
}

// ============================================================================
// Internal subscription handles
// ============================================================================

/** @type {{ unsubscribe: () => void } | null} */
let _liveQuerySub = null;

/** @type {(() => void) | null} */
let _relaySub = null;

// ============================================================================
// Public API
// ============================================================================

/**
 * Returns the number of unread mentions for a community.
 * Reactive: reading this inside a Svelte reactive context auto-tracks _mentionTsByComm
 * and _lastSeen, so the component re-renders when either changes.
 *
 * @param {string} communityPubkey
 * @returns {number}
 */
export function getNotifCount(communityPubkey) {
	const tss = _mentionTsByComm.get(communityPubkey);
	if (!tss?.length) return 0;
	const lastSeen = _lastSeen.get(communityPubkey) ?? 0;
	return tss.filter((ts) => ts > lastSeen).length;
}

/**
 * Mark all mentions in a community as read (sets lastSeen to now).
 * Call when the user selects / opens a community.
 *
 * @param {string} communityPubkey
 */
export function markCommRead(communityPubkey) {
	if (!communityPubkey) return;
	const now = Math.floor(Date.now() / 1000);
	// Replace the Map instance so $state tracking picks up the change
	const next = new Map(_lastSeen);
	next.set(communityPubkey, now);
	_lastSeen = next;
	saveLastSeen();
}

/**
 * Initialise the notification system for the current user.
 * Sets up a Dexie liveQuery and a background relay subscription.
 * Returns a cleanup function — call it on component destroy or re-init.
 *
 * Safe to call multiple times: always tears down any previous state first.
 *
 * @param {Array<{ pubkey: string, raw?: any, mainRelay?: string, relays?: string[], enforcedRelays?: string[] }>} communities
 * @param {string} userPubkey  Hex pubkey of the signed-in user.
 * @returns {() => void}  Cleanup / unsubscribe function.
 */
export function initNotifications(communities, userPubkey) {
	if (!browser || !userPubkey || !communities?.length) return () => {};

	loadLastSeen();

	// ── liveQuery ──────────────────────────────────────────────────────────────
	// Runs inside IndexedDB — no relay hops; very fast for small result sets.

	if (_liveQuerySub) {
		_liveQuerySub.unsubscribe();
		_liveQuerySub = null;
	}

	_liveQuerySub = liveQuery(async () => {
		// 1. Find all comments (kind:1111) that have a lowercase `p` tag with this pubkey.
		//    The *_tags multi-entry index makes this an efficient index-range scan.
		const mentions = await db.events
			.where('_tags')
			.equals(`p:${userPubkey}`)
			.filter((e) => e.kind === EVENT_KINDS.COMMENT)
			.toArray();

		if (!mentions.length) return new Map();

		// 2. Collect root event IDs from E (preferred, root marker) or e tags.
		//    Comments on forum posts have E:<postId>; comments on tasks similarly.
		const rootIdSet = new Set();
		for (const m of mentions) {
			const eTag =
				m.tags?.find((t) => t[0] === 'E') ??
				m.tags?.find((t) => t[0] === 'e');
			if (eTag?.[1]) rootIdSet.add(eTag[1]);
		}

		// 3. Batch-fetch root events to find their community h-tag.
		//    If the root post isn't in Dexie yet, that mention is silently skipped
		//    until the post loads (graceful degradation).
		const commByRootId = new Map();
		if (rootIdSet.size > 0) {
			const rootEvents = await db.events
				.where('id')
				.anyOf([...rootIdSet])
				.toArray();
			for (const re of rootEvents) {
				const hTag = re.tags?.find((t) => t[0] === 'h')?.[1];
				if (hTag) commByRootId.set(re.id, hTag);
			}
		}

		// 4. Build Map<communityPubkey, createdAt[]> for all resolved mentions.
		/** @type {Map<string, number[]>} */
		const tsByComm = new Map();
		for (const m of mentions) {
			const eTag =
				m.tags?.find((t) => t[0] === 'E') ??
				m.tags?.find((t) => t[0] === 'e');
			const rootId = eTag?.[1];
			const commPubkey = rootId ? commByRootId.get(rootId) : null;
			if (!commPubkey) continue;

			if (!tsByComm.has(commPubkey)) tsByComm.set(commPubkey, []);
			tsByComm.get(commPubkey).push(m.created_at);
		}

		return tsByComm;
	}).subscribe({
		next: (val) => {
			_mentionTsByComm = val ?? new Map();
		},
		error: (e) => console.error('[Notifications] liveQuery error', e)
	});

	// ── Relay subscription ─────────────────────────────────────────────────────
	// Streams new mention events into Dexie in the background.
	// Deduped by relay URL: one subscription per unique relay URL.

	if (_relaySub) {
		_relaySub();
		_relaySub = null;
	}

	// Build the relay map from community data.
	// Each community contributes one main relay + optional backups.
	// The subscription function groups by main relay so we open one connection per
	// unique main relay, not one per community.
	/** @type {Map<string, { mainRelay: string | null, backupRelays: string[] }>} */
	const communityRelayMap = new Map();

	for (const comm of communities) {
		const parsed = parseCommunity(comm.raw ?? comm);
		if (!parsed?.pubkey) continue;
		// Fallback: if no relays declared, use the first default community relay as main
		const mainRelay = parsed.mainRelay ?? DEFAULT_COMMUNITY_RELAYS[0] ?? null;
		const backupRelays = parsed.relays?.length > 1
			? parsed.relays.slice(1)
			: DEFAULT_COMMUNITY_RELAYS.slice(1);
		communityRelayMap.set(parsed.pubkey, { mainRelay, backupRelays });
	}

	if (communityRelayMap.size > 0) {
		_relaySub = subscribePersonalMentions(communityRelayMap, userPubkey);
	}

	return () => {
		if (_liveQuerySub) {
			_liveQuerySub.unsubscribe();
			_liveQuerySub = null;
		}
		if (_relaySub) {
			_relaySub();
			_relaySub = null;
		}
	};
}

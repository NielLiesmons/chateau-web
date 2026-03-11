/**
 * Universal load for /communities.
 * Browser: return empty (Dexie + liveQuery handle data).
 * SSR: optional seed from server cache when we have community relay cache.
 */
import { browser } from '$app/environment';

export async function load() {
	if (browser) {
		return { seedCommunities: [], seedProfiles: [] };
	}
	// SSR: could dynamic-import server and return seed 10222 events
	return { seedCommunities: [], seedProfiles: [] };
}

/**
 * Nostr module exports
 *
 * Main entry point for Nostr functionality.
 */

// Dexie database and helpers
export { db, putEvents, queryEvents, queryEvent, liveQuery } from './dexie';

// Service layer (client-side)
export {
	searchApps,
	fetchAppsByAuthorFromRelays,
	fetchAppFromRelays,
	fetchReleasesFromRelays,
	fetchFromRelays,
	fetchProfile,
	fetchProfilesBatch,
	cleanup,
	// Social features
	queryCommentsFromStore,
	fetchComments,
	fetchCommentRepliesByE,
	fetchForumPostComments,
	fetchZapReceiptsByPubkeys,
	fetchZaps,
	fetchZapsByEventIds,
	parseZapReceipt,
	parseComment,
	publishComment,
	// Community (Chateau)
	fetchProfileListFromRelays,
	fetchFormTemplateFromRelays,
	fetchCommunityForumPosts,
	subscribeCommunityForumPosts,
	subscribeForumPostComments,
	publishToRelays
} from './service';

// Models (event parsing)
export {
	parseApp,
	parseRelease,
	parseFileMetadata,
	parseProfile,
	parseAppStack,
	encodeAppNaddr,
	encodeStackNaddr,
	decodeNaddr,
	parseCommunity,
	parseProfileList,
	parseFormTemplate,
	parseForumPost
} from './models';

// Zap utilities
export { createZap, subscribeToZapReceipt } from './zap';

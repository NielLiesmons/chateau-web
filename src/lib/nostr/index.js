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
	getLocalFormTemplate,
	fetchFreshFormTemplate,
	fetchCommunityForumPosts,
	subscribeCommunityForumPosts,
	subscribeForumPostComments,
	subscribeTaskComments,
	subscribeTaskStatuses,
	fetchLabelEvents,
	publishToRelays,
	fetchCommunityWikis,
	fetchEventsNoStore,
	fetchCommunityProjects,
	fetchProjectMilestones,
	subscribeCommunityProjects
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
	parseEventAddress,
	parseCommunity,
	parseProfileList,
	parseFormTemplate,
	parseForumPost,
	parseProject,
	parseMilestone
} from './models';

// Zap utilities
export { createZap, subscribeToZapReceipt } from './zap';

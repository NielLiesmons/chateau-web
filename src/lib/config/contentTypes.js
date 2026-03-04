/**
 * Content type registry — maps Nostr event kinds and section IDs to
 * human-readable labels and emoji asset paths (from /images/emoji/).
 *
 * Used wherever the app needs to display content types with visual identity:
 * join modal "CAN WRITE IN" pills, community info panels, section headers, etc.
 */

/** @type {Record<number, { label: string, emoji: string }>} */
export const CONTENT_TYPE_BY_KIND = {
	1: { label: 'Notes', emoji: '/images/emoji/thread.png' },
	7: { label: 'Reactions', emoji: '/images/emoji/joke.png' },
	11: { label: 'Forum Posts', emoji: '/images/emoji/forum.png' },
	1111: { label: 'Comments', emoji: '/images/emoji/comment.png' },
	9802: { label: 'Highlights', emoji: '/images/emoji/article.png' },
	1985: { label: 'Labels', emoji: '/images/emoji/label.png' },
	30315: { label: 'Projects', emoji: '/images/emoji/graph.png' },
	30316: { label: 'Projects', emoji: '/images/emoji/graph.png' },
	30818: { label: 'Wiki', emoji: '/images/emoji/wiki.png' },
	37060: { label: 'Tasks', emoji: '/images/emoji/task.png' },
};

/** @type {Record<string, { label: string, emoji: string, kinds: number[] }>} */
export const CONTENT_TYPE_BY_SECTION = {
	forum: { label: 'Forum Posts', emoji: '/images/emoji/forum.png', kinds: [11] },
	tasks: { label: 'Tasks', emoji: '/images/emoji/task.png', kinds: [37060] },
	projects: { label: 'Projects', emoji: '/images/emoji/graph.png', kinds: [30315, 30316] },
	wikis: { label: 'Wiki', emoji: '/images/emoji/wiki.png', kinds: [30818] },
	chat: { label: 'Chat', emoji: '/images/emoji/chat.png', kinds: [] },
	notes: { label: 'Notes', emoji: '/images/emoji/thread.png', kinds: [1] },
};

/**
 * Derive a deduplicated list of content type descriptors from an array of kind numbers.
 * Multiple kinds that map to the same label are merged into one entry.
 *
 * @param {number[]} kinds
 * @returns {{ label: string, emoji: string }[]}
 */
export function contentTypesFromKinds(kinds) {
	const seen = new Set();
	const result = [];
	for (const kind of kinds) {
		const ct = CONTENT_TYPE_BY_KIND[kind];
		if (ct && !seen.has(ct.label)) {
			seen.add(ct.label);
			result.push(ct);
		}
	}
	return result;
}

/**
 * Get content type descriptor for a section id, falling back to a generic entry.
 *
 * @param {string} sectionId
 * @returns {{ label: string, emoji: string } | null}
 */
export function contentTypeForSection(sectionId) {
	return CONTENT_TYPE_BY_SECTION[sectionId] ?? null;
}

/**
 * Event Models
 *
 * Single source of truth for parsing Nostr events into typed objects.
 * Used by both client and SSR/prerendering.
 */
import { nip19 } from 'nostr-tools';
import { EVENT_KINDS } from '$lib/config';
// =============================================================================
// Parsers
// =============================================================================
/**
 * Parse a kind 32267 App event
 */
export function parseApp(event) {
    const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    let content = {};
    try {
        content = JSON.parse(event.content);
    }
    catch {
        content = { description: event.content };
    }
    const naddr = nip19.naddrEncode({
        kind: EVENT_KINDS.APP,
        pubkey: event.pubkey,
        identifier: dTag
    });
    const npub = nip19.npubEncode(event.pubkey);
    const description = content.description ?? '';
    return {
        id: event.id,
        pubkey: event.pubkey,
        npub,
        dTag,
        name: event.tags.find((t) => t[0] === 'name')?.[1] ?? content.name ?? dTag,
        description,
        descriptionHtml: description ? `<p>${description.replace(/\n/g, '</p><p>')}</p>` : undefined,
        icon: event.tags.find((t) => t[0] === 'icon')?.[1] ?? content.icon,
        images: event.tags.filter((t) => t[0] === 'image').map((t) => t[1]),
        platform: event.tags.find((t) => t[0] === 'platform')?.[1] ?? content.platform ?? 'Android',
        repository: event.tags.find((t) => t[0] === 'repository')?.[1] ?? content.repository,
        license: event.tags.find((t) => t[0] === 'license')?.[1] ?? content.license,
        url: event.tags.find((t) => t[0] === 'url')?.[1] ?? content.url,
        createdAt: event.created_at,
        naddr
    };
}
/**
 * Parse a kind 30063 Release event
 */
/**
 * Derive display version from release: prefer 'version' tag, else extract from dTag (package@version).
 * Matches website behavior so we show e.g. "v1.5.1-release" not "com.oxchat.nostr@v1.5.1-release".
 */
function releaseDisplayVersion(versionTag, dTag) {
    if (versionTag)
        return versionTag;
    const atIndex = dTag.lastIndexOf('@');
    if (atIndex !== -1 && atIndex < dTag.length - 1)
        return dTag.slice(atIndex + 1);
    return dTag;
}
export function parseRelease(event) {
    const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    const aTag = event.tags.find((t) => t[0] === 'a')?.[1] ?? '';
    const versionTag = event.tags.find((t) => t[0] === 'version')?.[1];
    const version = releaseDisplayVersion(versionTag, dTag);
    const url = event.tags.find((t) => t[0] === 'url')?.[1];
    // Extract app d-tag from a-tag (format: "kind:pubkey:identifier")
    const appDTag = aTag.split(':')[2] ?? '';
    const notes = event.content || undefined;
    return {
        id: event.id,
        pubkey: event.pubkey,
        dTag,
        appDTag,
        version,
        releaseNotes: notes,
        notes,
        notesHtml: notes ? `<p>${notes.replace(/\n/g, '</p><p>')}</p>` : undefined,
        artifacts: event.tags.filter((t) => t[0] === 'e').map((t) => t[1]),
        createdAt: event.created_at,
        url
    };
}
/**
 * Parse a kind 1063 File Metadata event
 */
export function parseFileMetadata(event) {
    const url = event.tags.find((t) => t[0] === 'url')?.[1] ?? '';
    const mimeType = event.tags.find((t) => t[0] === 'm')?.[1] ?? '';
    const hash = event.tags.find((t) => t[0] === 'x')?.[1] ?? '';
    const size = parseInt(event.tags.find((t) => t[0] === 'size')?.[1] ?? '0', 10);
    return {
        id: event.id,
        pubkey: event.pubkey,
        url,
        mimeType,
        hash,
        size,
        createdAt: event.created_at
    };
}
/**
 * Parse a kind 0 Profile event
 */
export function parseProfile(event) {
    let content = {};
    try {
        content = JSON.parse(event.content);
    }
    catch {
        content = {};
    }
    return {
        pubkey: event.pubkey,
        name: content.name,
        displayName: content.display_name,
        picture: content.picture,
        about: content.about,
        nip05: content.nip05,
        lud16: content.lud16,
        createdAt: event.created_at
    };
}
/**
 * Parse a kind 30267 App Stack event
 */
export function parseAppStack(event) {
    const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    const title = event.tags.find((t) => t[0] === 'title')?.[1] ??
        event.tags.find((t) => t[0] === 'name')?.[1] ?? dTag;
    const description = event.content || '';
    const image = event.tags.find((t) => t[0] === 'image')?.[1];
    // Parse 'a' tags to get app references (format: "kind:pubkey:identifier")
    const appRefs = event.tags
        .filter((t) => t[0] === 'a')
        .map((t) => {
        const parts = t[1]?.split(':') ?? [];
        return {
            kind: parseInt(parts[0] ?? '0', 10),
            pubkey: parts[1] ?? '',
            identifier: parts[2] ?? ''
        };
    })
        .filter((ref) => ref.pubkey && ref.identifier);
    const naddr = nip19.naddrEncode({
        kind: EVENT_KINDS.APP_STACK,
        pubkey: event.pubkey,
        identifier: dTag
    });
    return {
        id: event.id,
        pubkey: event.pubkey,
        dTag,
        title,
        description,
        image,
        appRefs,
        createdAt: event.created_at,
        naddr
    };
}
// =============================================================================
// Utilities
// =============================================================================

/**
 * Parse a NIP-33 event address string ("kind:pubkey:d-tag") into its parts.
 * Returns null for malformed input.
 */
export function parseEventAddress(address) {
	if (!address || typeof address !== 'string') return null;
	const parts = address.split(':');
	if (parts.length < 3) return null;
	return {
		kind: parseInt(parts[0], 10),
		pubkey: parts[1],
		dTag: parts.slice(2).join(':')
	};
}

/**
 * Encode an app to its naddr
 */
export function encodeAppNaddr(pubkey, identifier) {
    return nip19.naddrEncode({
        kind: EVENT_KINDS.APP,
        pubkey,
        identifier
    });
}
/**
 * Encode an app stack to its naddr
 */
export function encodeStackNaddr(pubkey, identifier) {
    return nip19.naddrEncode({
        kind: EVENT_KINDS.APP_STACK,
        pubkey,
        identifier
    });
}
/**
 * Decode an naddr to its components
 */
export function decodeNaddr(naddr) {
    try {
        const decoded = nip19.decode(naddr);
        if (decoded.type === 'naddr') {
            return {
                kind: decoded.data.kind,
                pubkey: decoded.data.pubkey,
                identifier: decoded.data.identifier
            };
        }
    }
    catch {
        // Invalid naddr
    }
    return null;
}

// =============================================================================
// Community (Chateau)
// =============================================================================

/**
 * Parse kind 10222 Community definition
 */
export function parseCommunity(event) {
    if (!event?.tags) return null;
    const rTags = event.tags.filter((t) => t[0] === 'r' && t[1]);
    const mainRelay = rTags[0]?.[1] ?? null;
    const relays = rTags.map((t) => t[1]);
    const enforcedRelays = rTags.filter((t) => t[2] === 'enforced').map((t) => t[1]);
    // Main relay is enforced when its r tag has "enforced" as the third element
    const mainRelayEnforced = rTags.length > 0 && rTags[0]?.[2] === 'enforced';
    const sections = [];
    for (let i = 0; i < event.tags.length; i++) {
        if (event.tags[i][0] === 'content') {
            const name = event.tags[i][1];
            const kinds = [];
            const aTags = [];
            for (let j = i + 1; j < event.tags.length; j++) {
                if (event.tags[j][0] === 'content') break;
                if (event.tags[j][0] === 'k') kinds.push(Number(event.tags[j][1]));
                if (event.tags[j][0] === 'a') aTags.push(event.tags[j][1]);
            }
            const profileListAddresses = aTags.filter(Boolean);
            const profileListAddress = profileListAddresses[0] || null;
            sections.push({ name, kinds, profileListAddress, profileListAddresses });
        }
    }
    return {
        id: event.id,
        pubkey: event.pubkey,
        mainRelay,
        relays,
        enforcedRelays,
        mainRelayEnforced,
        sections,
        createdAt: event.created_at
    };
}

/**
 * Parse kind 30000 Profile list (badge-style name, any d-tag)
 */
export function parseProfileList(event) {
    if (!event?.tags) return null;
    const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    const name = event.tags.find((t) => t[0] === 'name')?.[1] ?? dTag;
    const form = event.tags.find((t) => t[0] === 'form')?.[1] ?? null;
    const image = event.tags.find((t) => t[0] === 'image')?.[1] ?? null;
    const members = event.tags.filter((t) => t[0] === 'p').map((t) => t[1]).filter(Boolean);
    return {
        id: event.id,
        pubkey: event.pubkey,
        dTag,
        name,
        form,
        image,
        members,
        content: event.content || '',
        createdAt: event.created_at
    };
}

/**
 * Parse kind 30168 Form template
 */
export function parseFormTemplate(event) {
	if (!event?.tags) return null;
	const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
	const name = event.tags.find((t) => t[0] === 'name')?.[1] ?? event.tags.find((t) => t[0] === 'title')?.[1] ?? '';
	const description = event.tags.find((t) => t[0] === 'description')?.[1] ?? '';
	const confirmationMessage = event.tags.find((t) => t[0] === 'confirmation_message')?.[1] ?? '';
	const isPublic = event.tags.some((t) => t[0] === 'public');
	// ["field", "<field-id>", "<type>", "<label>", "<default-value>", "<options-json>"]
	const fields = event.tags
		.filter((t) => t[0] === 'field' && t[1])
		.map((t) => {
			let options = {};
			try { if (t[5]) options = JSON.parse(t[5]); } catch { /* ignore */ }
			return {
				id: t[1] ?? '',
				type: t[2] ?? 'text',
				label: t[3] ?? '',
				defaultValue: t[4] ?? '',
				required: options.required === true,
				placeholder: options.placeholder ?? '',
				min: options.min ?? '',
				max: options.max ?? '',
				selectOptions: Array.isArray(options.options) ? options.options : []
			};
		});
	return {
		id: event.id,
		pubkey: event.pubkey,
		dTag,
		name,
		description,
		confirmationMessage,
		isPublic,
		content: event.content || '',
		fields,
		createdAt: event.created_at
	};
}

/**
 * Parse kind 30315 Project event
 */
export function parseProject(event) {
    if (!event?.tags) return null;
    const get = (name) => event.tags.find((t) => t[0] === name)?.[1];
    const milestoneAddrs = event.tags.filter((t) => t[0] === 'a' && t[1]?.startsWith('30316:')).map((t) => t[1]);
    const members = event.tags.filter((t) => t[0] === 'p' && t[1]).map((t) => ({ pubkey: t[1], role: t[2] ?? '' }));
    const labels = event.tags.filter((t) => t[0] === 't' && t[1]).map((t) => t[1]);
    const communityPubkey = get('h') ?? '';
    return {
        id: event.id,
        pubkey: event.pubkey,
        dTag: get('d') ?? '',
        title: get('title') ?? '',
        summary: get('summary') ?? '',
        content: event.content || '',
        start: get('start') ? parseInt(get('start')) : null,
        due: get('due') ? parseInt(get('due')) : null,
        milestoneAddrs,
        members,
        labels,
        communityPubkey,
        createdAt: event.created_at,
        raw: event
    };
}

/**
 * Parse kind 30316 Milestone event
 */
export function parseMilestone(event) {
    if (!event?.tags) return null;
    const get = (name) => event.tags.find((t) => t[0] === name)?.[1];
    const projectAddr = event.tags.find((t) => t[0] === 'a' && t[1]?.startsWith('30315:'))?.[1] ?? null;
    const labels = event.tags.filter((t) => t[0] === 't' && t[1]).map((t) => t[1]);
    const communityPubkey = get('h') ?? '';
    return {
        id: event.id,
        pubkey: event.pubkey,
        dTag: get('d') ?? '',
        title: get('title') ?? '',
        summary: get('summary') ?? '',
        content: event.content || '',
        due: get('due') ? parseInt(get('due')) : null,
        projectAddr,
        labels,
        communityPubkey,
        createdAt: event.created_at,
        raw: event
    };
}

// =============================================================================
// Content display helpers
// =============================================================================

/**
 * Get a one-line label and emoji for any raw Nostr event, for use in the
 * "root event" row of the CommentCard (Interactions feed).
 *
 * Add new kinds here — this is the single place to configure per-kind display.
 *
 * @param {import('nostr-tools').NostrEvent | null | undefined} event
 * @returns {{ label: string, emoji: string }}
 */
export function getEventOneliner(event) {
	if (!event) return { label: 'Unknown event', emoji: '/images/emoji/unknown.png' };
	const get = (/** @type {string} */ name) => event.tags?.find((t) => t[0] === name)?.[1];
	const truncate = (/** @type {string|undefined} */ s, n = 80) =>
		s ? (s.length > n ? s.slice(0, n) + '…' : s) : '';

	switch (event.kind) {
		// Forum post (kind 11)
		case 11:
			return {
				label: truncate(get('title') || event.content?.split('\n')[0]) || 'Forum post',
				emoji: '/images/emoji/forum.png'
			};
		// Comment (kind 1111) — shown when commenting on a comment
		case 1111:
			return {
				label: truncate(event.content) || 'Comment',
				emoji: '/images/emoji/comment.png'
			};
		// Note (kind 1)
		case 1:
			return {
				label: truncate(event.content) || 'Note',
				emoji: '/images/emoji/note.png'
			};
		// Task (kind 37060)
		case 37060:
			return {
				label: truncate(get('title') || event.content) || 'Task',
				emoji: '/images/emoji/task.png'
			};
		// Project (kind 30315)
		case 30315:
			return {
				label: truncate(get('title') || event.content) || 'Project',
				emoji: '/images/emoji/project.png'
			};
		// Milestone (kind 30316)
		case 30316:
			return {
				label: truncate(get('title') || event.content) || 'Milestone',
				emoji: '/images/emoji/graph.png'
			};
		// Wiki (kind 30818)
		case 30818:
			return {
				label: truncate(get('title') || get('d') || event.content) || 'Wiki article',
				emoji: '/images/emoji/wiki.png'
			};
		// Profile list (kind 30000)
		case 30000:
			return {
				label: truncate(get('name') || get('d')) || 'Profile list',
				emoji: '/images/emoji/profile.png'
			};
		// App (kind 32267)
		case 32267:
			return {
				label: truncate(get('name') || get('d')) || 'App',
				emoji: '/images/emoji/app.png'
			};
		// Label (kind 1985)
		case 1985:
			return {
				label: truncate(event.content) || 'Label',
				emoji: '/images/emoji/label.png'
			};
		// Reaction (kind 7)
		case 7:
			return {
				label: event.content || 'Reaction',
				emoji: '/images/emoji/joke.png'
			};
		default:
			return {
				label: truncate(get('title') || event.content) || `Event kind ${event.kind}`,
				emoji: '/images/emoji/unknown.png'
			};
	}
}

/**
 * Parse kind 11 Forum post
 */
export function parseForumPost(event) {
    if (!event?.tags) return null;
    const communityPubkey = event.tags.find((t) => t[0] === 'h')?.[1] ?? '';
    const titleTag = event.tags.find((t) => t[0] === 'title');
    const title = titleTag?.[1] ?? (event.content?.split('\n')[0]?.slice(0, 80) || 'Untitled');
    const labels = event.tags.filter((t) => t[0] === 't' && t[1]).map((t) => t[1]);
    return {
        id: event.id,
        pubkey: event.pubkey,
        communityPubkey,
        title,
        content: event.content || '',
        createdAt: event.created_at,
        labels: labels || [],
        raw: event
    };
}

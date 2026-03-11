/**
 * Short-text parser for comments, zap messages, profile descriptions, etc.
 * Produces a list of segments so the UI can render text, @mentions (npub/nprofile),
 * custom emoji (:shortcode:), and nostr refs (nevent/naddr) without raw @html.
 *
 * Input format matches ShortTextInput serialization:
 * - text may contain nostr:npub..., nostr:nprofile..., nostr:nevent..., nostr:naddr..., and :shortcode:
 * - emojiTags maps shortcode -> url for custom emoji
 */
import * as nip19 from "nostr-tools/nip19";

// ============================================================================
// Types
// ============================================================================

/**
 * @typedef {{ type: 'text'; value: string }} TextSegment
 * @typedef {{ type: 'mention'; npub: string; pubkey: string; label: string | undefined }} MentionSegment
 * @typedef {{ type: 'emoji'; shortcode: string; url: string }} EmojiSegment
 * @typedef {{
 *   type: 'nostr_ref';
 *   raw: string;
 *   bech32Type: 'naddr' | 'nevent';
 *   kind: number | null;
 *   pubkey?: string;
 *   identifier?: string;
 *   id?: string;
 *   author?: string | null;
 *   relays: string[];
 * }} NostrRefSegment
 * @typedef {{ type: 'wiki_link'; slug: string; label: string }} WikiLinkSegment
 * @typedef {TextSegment | MentionSegment | EmojiSegment | NostrRefSegment | WikiLinkSegment} Segment
 */
/** Bech32 data part: alphanumeric (excluding b,i,o); length varies by type */
const NOSTR_PREFIX = "nostr:(npub|nprofile|nevent|naddr)1";
const NOSTR_REGEX = new RegExp(`${NOSTR_PREFIX}[a-z0-9]+`, "gi");
/** Emoji shortcode: colon-delimited, no spaces (1–100 chars) */
const EMOJI_REGEX = /:([^:\s]{1,100}):/g;
/** Wikilink: [[slug]] or [[slug|label]] — same syntax as MarkdownBody */
const WIKI_LINK_REGEX = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

/** Normalize a wiki slug: lowercase, hyphens only */
function normalizeWikiSlug(raw) {
    return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
const emojiMap = (emojiTags) => {
    const m = new Map();
    if (!emojiTags)
        return m;
    for (const { shortcode, url } of emojiTags) {
        const key = shortcode.toLowerCase();
        if (!m.has(key))
            m.set(key, url);
    }
    return m;
};

/**
 * Decode a bech32 Nostr string (with or without "nostr:" prefix) into a nostr_ref segment.
 * Returns null for unsupported types (npub/nprofile handled separately as mentions).
 *
 * @param {string} raw - Full "nostr:naddr1..." or bare "naddr1..." string
 * @returns {NostrRefSegment | null}
 */
export function decodeNostrRef(raw) {
    const bech32 = raw.startsWith("nostr:") ? raw.slice(6) : raw;
    const normalised = raw.startsWith("nostr:") ? raw : `nostr:${raw}`;
    try {
        const decoded = nip19.decode(bech32);
        if (decoded.type === "naddr") {
            const d = decoded.data;
            return {
                type: "nostr_ref",
                raw: normalised,
                bech32Type: "naddr",
                kind: d.kind,
                pubkey: d.pubkey,
                identifier: d.identifier,
                relays: d.relays ?? [],
            };
        } else if (decoded.type === "nevent") {
            const d = decoded.data;
            return {
                type: "nostr_ref",
                raw: normalised,
                bech32Type: "nevent",
                kind: d.kind ?? null,
                id: d.id,
                author: d.author ?? null,
                relays: d.relays ?? [],
            };
        }
    } catch {
        // Invalid bech32
    }
    return null;
}

/**
 * Parse short text into segments for rendering.
 * Escapes are not applied here; the renderer must escape text segments.
 *
 * @param {{ text: string; emojiTags: { shortcode: string; url: string }[] }} input
 * @returns {Segment[]}
 */
export function parseShortText(input) {
    const { text, emojiTags } = input;
    const emojiLookup = emojiMap(emojiTags);
    const matches = [];
    // Find all nostr:... mentions and refs
    let m;
    NOSTR_REGEX.lastIndex = 0;
    while ((m = NOSTR_REGEX.exec(text)) !== null) {
        const raw = m[0];
        const rest = raw.slice(6); // strip "nostr:" prefix
        try {
            const decoded = nip19.decode(rest);
            if (decoded.type === "npub" || decoded.type === "nprofile") {
                const pubkey = decoded.type === "npub" ? decoded.data : decoded.data.pubkey;
                matches.push({
                    index: m.index,
                    length: raw.length,
                    segment: {
                        type: "mention",
                        npub: rest,
                        pubkey,
                        label: undefined
                    }
                });
            } else if (decoded.type === "naddr") {
                const d = decoded.data;
                matches.push({
                    index: m.index,
                    length: raw.length,
                    /** @type {NostrRefSegment} */
                    segment: {
                        type: "nostr_ref",
                        raw,
                        bech32Type: "naddr",
                        kind: d.kind,
                        pubkey: d.pubkey,
                        identifier: d.identifier,
                        relays: d.relays ?? [],
                    }
                });
            } else if (decoded.type === "nevent") {
                const d = decoded.data;
                matches.push({
                    index: m.index,
                    length: raw.length,
                    /** @type {NostrRefSegment} */
                    segment: {
                        type: "nostr_ref",
                        raw,
                        bech32Type: "nevent",
                        kind: d.kind ?? null,
                        id: d.id,
                        author: d.author ?? null,
                        relays: d.relays ?? [],
                    }
                });
            }
        }
        catch {
            // Invalid bech32: treat as text (don't add to matches)
        }
    }
    // Find all :shortcode: emoji (only if not already part of a nostr match)
    EMOJI_REGEX.lastIndex = 0;
    while ((m = EMOJI_REGEX.exec(text)) !== null) {
        const full = m[0];
        const shortcode = m[1];
        const start = m.index;
        const end = start + full.length;
        // Skip if this span overlaps any existing match
        const overlaps = matches.some((x) => (start >= x.index && start < x.index + x.length) || (end > x.index && end <= x.index + x.length));
        if (!overlaps && shortcode) {
            const url = emojiLookup.get(shortcode.toLowerCase()) ?? null;
            matches.push({
                index: start,
                length: full.length,
                segment: { type: "emoji", shortcode, url: url ?? "" }
            });
        }
    }
    // Find all [[slug]] / [[slug|label]] wikilinks
    WIKI_LINK_REGEX.lastIndex = 0;
    while ((m = WIKI_LINK_REGEX.exec(text)) !== null) {
        const full = m[0];
        const target = m[1];
        const display = m[2];
        const start = m.index;
        const end = start + full.length;
        const overlaps = matches.some((x) => (start >= x.index && start < x.index + x.length) || (end > x.index && end <= x.index + x.length));
        if (!overlaps && target) {
            const slug = normalizeWikiSlug(target);
            const label = (display ?? target).trim();
            matches.push({
                index: start,
                length: full.length,
                /** @type {WikiLinkSegment} */
                segment: { type: "wiki_link", slug, label }
            });
        }
    }
    // Sort by index and merge overlapping (first wins)
    matches.sort((a, b) => a.index - b.index);
    const merged = [];
    for (const match of matches) {
        const last = merged[merged.length - 1];
        if (merged.length === 0 || !last || match.index >= last.index + last.length) {
            merged.push(match);
        }
    }
    // Build segments with text in between
    const segments = [];
    let lastEnd = 0;
    for (const { index, length, segment } of merged) {
        if (index > lastEnd) {
            const value = text.slice(lastEnd, index);
            segments.push({ type: "text", value });
        }
        segments.push(segment);
        lastEnd = index + length;
    }
    if (lastEnd < text.length) {
        segments.push({ type: "text", value: text.slice(lastEnd) });
    }
    if (segments.length === 0) {
        segments.push({ type: "text", value: text });
    }
    return segments;
}

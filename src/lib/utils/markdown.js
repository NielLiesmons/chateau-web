import { Marked, Lexer } from 'marked';

/**
 * Nostr Markdown renderer
 *
 * Handles the full Nostr Markdown spec (see /Nostr/markdown.md):
 *   - Standard GFM (headings, lists, emphasis, code, tables, blockquotes, …)
 *   - Nostr URIs  — bare `nostr:npub1…` / `nostr:note1…` / `nostr:naddr1…` etc.
 *                   become clickable links; `[text](nostr:…)` just works natively.
 *   - Custom emoji — `:shortcode:` → <img> when `emojiMap` is provided; kept as-is otherwise.
 *   - Wikilinks    — `[[slug]]` / `[[slug|label]]` → links when `wikiLinkFn` is provided.
 *                   Slug is normalised per spec (lower-case, non-alphanumeric → `-`).
 *
 * All output is sanitised before returning (no XSS).
 */

const marked = new Marked({
    breaks: true,  // single \n → <br>
    gfm: true,     // GitHub Flavoured Markdown
});

// ── Sanitiser ─────────────────────────────────────────────────────────────────

const DANGEROUS_TAG_RE = /<(script|style|iframe|object|embed|form|input|textarea|select|button|applet|base|link|meta)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_SELF_CLOSING_RE = /<\/?(script|style|iframe|object|embed|form|input|textarea|select|button|applet|base|link|meta)\b[^>]*\/?>/gi;
const EVENT_HANDLER_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URL_RE = /href\s*=\s*(?:"[^"]*javascript\s*:[^"]*"|'[^']*javascript\s*:[^']*'|javascript\s*:[^\s>]*)/gi;

function sanitizeHtml(html) {
    html = html.replace(DANGEROUS_TAG_RE, '');
    html = html.replace(DANGEROUS_SELF_CLOSING_RE, '');
    html = html.replace(EVENT_HANDLER_RE, '');
    html = html.replace(JAVASCRIPT_URL_RE, 'href="#"');
    // External links open in new tab; nostr: links are left for the client's protocol handler
    html = html.replace(/<a\s+(?![^>]*target=)/gi, '<a target="_blank" rel="noopener noreferrer" ');
    html = html.replace(/<a\s+([^>]*?)target="[^"]*"([^>]*)>/gi, (match, pre, post) => {
        if (/rel=/.test(pre + post)) return match;
        return `<a ${pre}target="_blank" rel="noopener noreferrer"${post}>`;
    });
    return html;
}

// ── Nostr URI helpers ─────────────────────────────────────────────────────────

/** Valid bech32 characters used in nostr entity ids */
const NOSTR_BECH32_RE = /nostr:[a-z]+1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+/g;
/** Already-linked: preceded by `(` — skip those (they're inside `[text](nostr:…)`) */
const ALREADY_LINKED_RE = /\(nostr:[a-z]+1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+\)/g;

function shortenNostrUri(uri) {
    const entity = uri.slice('nostr:'.length);      // e.g. "npub1abc…"
    const prefix = entity.match(/^[a-z]+/)?.[0] ?? '';  // "npub", "note", etc.
    const data = entity.slice(prefix.length);
    if (data.length > 12) {
        return `@${prefix}1${data.slice(0, 6)}…${data.slice(-4)}`;
    }
    return `@${entity}`;
}

/**
 * Replace bare `nostr:` URIs (not already inside a markdown link URL) with
 * Markdown link syntax so `marked` renders them as <a> elements.
 */
function processNostrUris(text) {
    // Collect positions of already-linked URIs (inside `(…)`) so we can skip them
    const skip = new Set();
    let m;
    const skipRe = new RegExp(ALREADY_LINKED_RE.source, 'g');
    while ((m = skipRe.exec(text)) !== null) {
        // Mark the nostr: start index inside the parens
        skip.add(m.index + 1); // +1 to skip the `(`
    }

    return text.replace(new RegExp(NOSTR_BECH32_RE.source, 'g'), (match, offset) => {
        if (skip.has(offset)) return match;
        return `[${shortenNostrUri(match)}](${match})`;
    });
}

// ── Wikilink helpers ──────────────────────────────────────────────────────────

/**
 * Normalise a wikilink target per the Nostr Markdown spec:
 * lower-case, non-alphanumeric sequences → single `-`, trim leading/trailing `-`.
 */
function normalizeWikiSlug(raw) {
    return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Custom emoji helpers ──────────────────────────────────────────────────────

/** Safe URL: only http(s) and data: (for inline SVG) are allowed as emoji src */
function isSafeUrl(url) {
    return /^https?:\/\//.test(url) || /^data:image\//.test(url);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Render Nostr-flavoured markdown to sanitised HTML.
 *
 * @param {string} text
 * @param {{
 *   emojiMap?: Record<string, string>,
 *   wikiLinkFn?: (slug: string) => string,
 * }} [options]
 * @returns {string} Safe HTML for use with Svelte `{@html …}`
 */
export function renderNostrMarkdown(text, options = {}) {
    if (!text) return '';
    const { emojiMap = {}, wikiLinkFn } = options;
    let processed = text;

    // 1. Wikilinks  →  standard Markdown links (before marked so it parses them)
    if (wikiLinkFn) {
        processed = processed.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, target, display) => {
            const slug = normalizeWikiSlug(target);
            const label = (display ?? target).trim();
            return `[${label}](${wikiLinkFn(slug)})`;
        });
    }

    // 2. Bare nostr: URIs  →  Markdown links
    processed = processNostrUris(processed);

    // 3. Custom emoji  →  <img> (before marked so it survives as raw HTML)
    const hasEmoji = Object.keys(emojiMap).length > 0;
    if (hasEmoji) {
        processed = processed.replace(/:([a-zA-Z0-9_]+):/g, (match, shortcode) => {
            const url = emojiMap[shortcode];
            if (url && isSafeUrl(url)) {
                return `<img class="nostr-emoji" src="${url}" alt=":${shortcode}:" title=":${shortcode}:" loading="lazy" />`;
            }
            return match;
        });
    }

    const html = /** @type {string} */ (marked.parse(processed));
    return sanitizeHtml(html);
}

/**
 * Simple markdown render (no Nostr extensions).
 * Kept for backwards compatibility — now delegates to `renderNostrMarkdown`
 * which also activates bare `nostr:` URI linking automatically.
 *
 * @param {string} text
 */
export function renderMarkdown(text) {
    return renderNostrMarkdown(text);
}

// ── Token-based API (for MarkdownBody.svelte) ─────────────────────────────────

/**
 * Tokenize Nostr-flavoured markdown into a marked token tree.
 *
 * Use with `<MarkdownBody>` for fully component-based rendering where you need
 * custom Svelte components per token type (code blocks, tables, embeds, etc.).
 *
 * All the same Nostr extensions as `renderNostrMarkdown` are applied:
 *   - Wikilinks, bare nostr: URIs, custom emoji (as inline html tokens)
 *
 * @param {string} text
 * @param {{
 *   emojiMap?: Record<string, string>,
 *   wikiLinkFn?: (slug: string) => string,
 * }} [options]
 * @returns {import('marked').Token[]}
 */
export function tokenizeNostrMarkdown(text, options = {}) {
    if (!text) return [];
    const { emojiMap = {}, wikiLinkFn } = options;
    let processed = text;

    // 1. Wikilinks → standard Markdown links
    if (wikiLinkFn) {
        processed = processed.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, target, display) => {
            const slug = normalizeWikiSlug(target);
            const label = (display ?? target).trim();
            return `[${label}](${wikiLinkFn(slug)})`;
        });
    }

    // 2. Bare nostr: URIs → Markdown links
    processed = processNostrUris(processed);

    // 3. Custom emoji → <img> inline html (safe — URLs validated before insertion)
    const hasEmoji = Object.keys(emojiMap).length > 0;
    if (hasEmoji) {
        processed = processed.replace(/:([a-zA-Z0-9_]+):/g, (match, shortcode) => {
            const url = emojiMap[shortcode];
            if (url && isSafeUrl(url)) {
                return `<img class="nostr-emoji" src="${url}" alt=":${shortcode}:" title=":${shortcode}:" loading="lazy" />`;
            }
            return match;
        });
    }

    // Tokenize with the same options as the string renderer (breaks + gfm)
    const lexer = new Lexer({ breaks: true, gfm: true });
    return lexer.lex(processed);
}

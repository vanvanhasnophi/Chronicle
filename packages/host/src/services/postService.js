/**
 * Chronicle Host — Post Content Service
 *
 * Pure functions for reading, writing, parsing, and generating post content,
 * frontmatter, HTML artifacts, and table-of-contents.
 * Extracted from the original monolithic index.js — behavior preserved exactly.
 *
 * Dependencies:
 *   - fs, path (Node.js stdlib)
 *   - config (POSTS_DIR, INDEX_FILE)
 *   - auth (encrypt, decrypt)
 */

const fs = require('fs');
const path = require('path');
const { POSTS_DIR, INDEX_FILE } = require('../config');
const { encrypt, decrypt } = require('../middleware/auth');

// ── Tag Sorting ──────────────────────────────────────────

function sortTags(tags) {
    if (!tags || !Array.isArray(tags)) return [];
    return tags.sort((a, b) => {
        if (a === 'featured') return -1;
        if (b === 'featured') return 1;
        return a.localeCompare(b);
    });
}

// ── Front Matter Helpers ─────────────────────────────────

function parseFrontMatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { attributes: {}, body: content };

    const attributes = {};
    match[1].split('\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join(':').trim();
            if (key === 'tags') {
                try { attributes[key] = JSON.parse(value); } catch(e) { attributes[key] = []; }
            } else {
                attributes[key] = value;
            }
        }
    });
    return { attributes, body: match[2] };
}

function stringifyFrontMatter(attributes, body) {
    const cleanBody = body.replace(/^---\n[\s\S]*?\n---\n?/, '')
    // 必需字段先写（保证顺序），其余全部透传
    const required = new Set(['title','date','updatedAt','tags','font','author','aiGenerated'])
    let fm = '---\n';
    for (const k of ['title','date','updatedAt','tags','font','author','aiGenerated']) {
      if (k === 'font' && attributes.type === 'slides') continue  // slides 不写 font
      if (k === 'updatedAt' && attributes.updatedAt === attributes.date) continue
      const v = attributes[k]
      if (k === 'tags') fm += `tags: ${JSON.stringify(v || [])}\n`
      else if (k === 'aiGenerated') fm += `aiGenerated: ${!!v}\n`
      else if (v !== undefined && v !== null) fm += `${k}: ${v}\n`
    }
    // 其余全部透传
    for (const [k, v] of Object.entries(attributes)) {
      if (required.has(k)) continue
      if (v === undefined || v === null) continue
      if (typeof v === 'boolean') fm += `${k}: ${v}\n`
      else if (typeof v === 'object') fm += `${k}: ${JSON.stringify(v)}\n`
      else fm += `${k}: ${v}\n`
    }
    fm += '---\n';
    return fm + cleanBody.replace(/^\n+/, '');
}

// Helper: get directory path for a post (supports legacy filename)
function getPostDir(post) {
    if (!post) return '';
    const dirName = post.dir || (post.filename ? post.filename.replace(/\.md$/, '') : post.id);
    return path.join(POSTS_DIR, String(dirName || ''));
}

function isValidId(id) {
    return typeof id === 'string' && /^[0-9a-fA-F\-]+$/.test(id)
}

/** Check if raw content looks encrypted (starts with hex IV + colon) */
function isEncryptedContent(raw) {
    return /^[0-9a-fA-F]+:/.test(String(raw || ''))
}

/**
 * Parse post content that may be plaintext or encrypted.
 *
 * Three branches (checked in order):
 *   1. Starts with '---'  →  plaintext frontmatter, parse directly
 *   2. Matches hex:hex     →  encrypted, decrypt → may have frontmatter or not
 *   3. Neither             →  plaintext without frontmatter, return as-is
 *
 * Always returns just the body (backward compatible with existing callers).
 */
function parseContentText(raw) {
    if (!raw) return ''
    // Branch 1: Plaintext with frontmatter
    if (raw.startsWith('---')) {
        const { body } = parseFrontMatter(raw)
        return body
    }
    // Branch 2: Encrypted (IV hex : ciphertext hex)
    if (isEncryptedContent(raw)) {
        try {
            const decrypted = decrypt(raw)
            if (decrypted && decrypted.startsWith('---')) {
                const { body } = parseFrontMatter(decrypted)
                return body
            }
            // Decrypted but no frontmatter — whole content is body
            return decrypted || ''
        } catch (e) {
            // Decrypt failed — return raw as-is (could be garbled or wrong key)
            return raw
        }
    }
    // Branch 3: Plaintext without frontmatter — return as-is
    return raw
}

function readPostContentFromDisk(post) {
    const dir = getPostDir(post)
    const id = post.id
    if (!isValidId(id)) return ''
    const expectedName = `${id}-content.md`
    const p = path.join(dir, expectedName)
    if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8')
        return parseContentText(raw)
    }
    // Fallback to legacy filename if present and appears to match id
    if (post.filename && post.filename.startsWith(id)) {
        const legacy = path.join(POSTS_DIR, post.filename)
        if (fs.existsSync(legacy)) {
            const raw = fs.readFileSync(legacy, 'utf-8')
            return parseContentText(raw)
        }
    }
    return ''
}

function writePostContentToDisk(post, content, options = {}) {
    const dir = getPostDir(post)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const id = post.id
    if (!isValidId(id)) throw new Error('Invalid post id')
    const filename = options.draft ? `${id}-draft.md` : `${id}-content.md`
    const target = path.join(dir, filename)

    // ── 原样写入，客户端 buildFileContent() 是唯一真相源 ──
    fs.writeFileSync(target, content || '')
}

/**
 * 从 content 提取 index.json 所需元数据。
 * 与 writePostContentToDisk 分离——写入不改内容，提取只读。
 */
function extractMetaFromContent(content, fallback = {}) {
    if (!content || typeof content !== 'string') return fallback
    const parsed = parseFrontMatter(content)
    const attrs = parsed.attributes || {}
    const hasMarp = attrs.marp === 'true' || attrs.marp === true
    const hasType = attrs.type || fallback.type
    return {
        title:   attrs.title || fallback.title || 'Untitled',
        date:    attrs.date || fallback.date || new Date().toISOString(),
        tags:    attrs.tags || fallback.tags || [],
        font:    attrs.font || fallback.font || 'sans',
        author:  attrs.author !== undefined ? attrs.author : (fallback.author || ''),
        aiGenerated: attrs.aiGenerated !== undefined
          ? (attrs.aiGenerated === 'true' || attrs.aiGenerated === true)
          : !!fallback.aiGenerated,
        type:    hasType || (hasMarp ? 'slides' : undefined),
        slideshow: attrs.slideshow || fallback.slideshow || undefined,
        marp:    hasMarp || undefined,
    }
}


// ── HTML / Entities Helpers ────────────────────────────

// Server-side TOC generation utilities (robust against code blocks and file-cards)
function decodeHtmlEntities(text) {
    return String(text || '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function normalizePostTitle(title) {
    return decodeHtmlEntities(String(title || ''));
}

function normalizePostForResponse(post) {
    if (!post) return post;
    const title = normalizePostTitle(post.title);
    if (title === post.title) return post;
    return { ...post, title };
}

// ── Post Metadata & Index ──────────────────────────────

function refreshPostMetadataFromDisk(post) {
    if (!post || !isValidId(post.id)) return post;

    const dir = getPostDir(post);
    const candidatePaths = [
        path.join(dir, `${post.id}-content.md`),
        path.join(dir, `${post.id}-draft.md`),
        post.filename ? path.join(POSTS_DIR, post.filename) : null,
    ].filter(Boolean);

    const existingPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath));
    if (!existingPath) return post;

    try {
        let raw = fs.readFileSync(existingPath, 'utf-8');
        try { raw = decrypt(raw); } catch (e) {}

        const { attributes } = parseFrontMatter(raw);
        if (!attributes || typeof attributes !== 'object') return post;

        const next = { ...post };
        let changed = false;

        if (typeof attributes.title === 'string') {
            const title = normalizePostTitle(attributes.title);
            if (title && title !== next.title) {
                next.title = title;
                changed = true;
            }
        }

        if (attributes.date && String(attributes.date) !== String(next.date || '')) {
            next.date = String(attributes.date);
            changed = true;
        }

        if (attributes.font && String(attributes.font) !== String(next.font || '')) {
            next.font = String(attributes.font);
            changed = true;
        }

        if (attributes.author !== undefined) {
            const author = String(attributes.author || '').trim();
            if (author !== String(next.author || '')) {
                next.author = author;
                changed = true;
            }
        }

        if (attributes.aiGenerated !== undefined) {
            const aiGenerated = attributes.aiGenerated === true || attributes.aiGenerated === 'true' || attributes.aiGenerated === '1';
            if (!!aiGenerated !== !!next.aiGenerated) {
                next.aiGenerated = !!aiGenerated;
                changed = true;
            }
        }

        if (Array.isArray(attributes.tags)) {
            const tags = sortTags(attributes.tags || []);
            const currentTags = Array.isArray(next.tags) ? sortTags(next.tags) : [];
            if (JSON.stringify(tags) !== JSON.stringify(currentTags)) {
                next.tags = tags;
                changed = true;
            }
        }

        return changed ? next : post;
    } catch (e) {
        return post;
    }
}

function normalizeIndexPostRecord(post) {
    if (!post || typeof post !== 'object') return post;
    const next = { ...post };
    delete next.html;
    return next;
}

function writeIndexFile(posts) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify((posts || []).map(normalizeIndexPostRecord), null, 2));
}

// ── HTML Sanitization ────────────────────────────────

function sanitizeHtml(html) {
    if (!html) return '';
    try {
        // Remove <script>...</script>
        let s = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
        // Remove javascript: URIs
        s = s.replace(/href\s*=\s*["']?javascript:[^"'>\s]*/gi, '');
        s = s.replace(/src\s*=\s*["']?javascript:[^"'>\s]*/gi, '');
        // Strip on* event handlers e.g. onclick, onerror
        s = s.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
        return s;
    } catch (e) {
        return '';
    }
}

// ── Post Artifacts ────────────────────────────────────

function republishPostArtifacts(post) {
    // Republish is now a no-op: markdown rendering happens at build time
    // in template-astro (localDataSource) and CMS preview (manager).
    // No compiled HTML or TOC files are persisted to disk.
    const result = { republished: true, hadContent: false };
    if (!post || !isValidId(post.id)) {
        result.republished = false;
        return result;
    }
    const content = readPostContentFromDisk(post) || '';
    result.hadContent = !!String(content || '').trim();
    return result;
}

function stripHtml(text) {
    return decodeHtmlEntities(String(text || '').replace(/<[^>]+>/g, ''));
}

// Inject ids into headings in compiled HTML. Returns { html, toc }
function injectIdsIntoHtml(html) {
    if (!html) return { html: '', toc: [] };
    const used = new Set();
    // Replace headings and ensure unique ids. Capture attrs too.
    const headingRegex = /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi;
    let idx = 0;
    const out = html.replace(headingRegex, (full, level, attrs, inner) => {
        // extract existing id if any
        let idMatch = attrs && String(attrs).match(/\sid=(?:"|')([^"']+)(?:"|')/);
        let id = idMatch ? idMatch[1] : null;
        // compute text
        const text = stripHtml(inner).trim();
        if (!text) return full;

        if (!id) {
            // generate id from heading text
            id = slugifyHeading(text);
            let base = id; let suffix = 1;
            while (used.has(id)) id = `${base}-${suffix++}`;
            // inject id into tag
            const newAttrs = `${attrs || ''} id="${id}"`;
            used.add(id);
            return `<h${level}${newAttrs}>${inner}</h${level}>`;
        } else {
            // ensure uniqueness
            let base = id; let suffix = 1;
            while (used.has(id)) id = `${base}-${suffix++}`;
            used.add(id);
            // if id was changed due to collision, replace attrs
            if (id !== idMatch?.[1]) {
                const newAttrs = String(attrs).replace(/\sid=(?:"|')[^"']+(?:"|')/, ` id="${id}"`);
                return `<h${level}${newAttrs}>${inner}</h${level}>`;
            }
            return full;
        }
    });

    // After injection, build TOC items from the new HTML
    const toc = buildTocFromHtml(out);
    return { html: out, toc };
}

// ── TOC Utilities ────────────────────────────────────────

function slugifyHeading(text) {
    const cleaned = stripHtml(text).trim().replace(/\s+/g, ' ');
    if (!cleaned) return 'heading';
    // Prefer a readable, hyphen-separated slug to avoid percent-encoding differences
    return cleaned.replace(/\s+/g, '-').replace(/[^\w\-一-鿿]/g, '');
}

function buildTocFromHtml(html) {
    if (!html) return [];
    const items = [];
    const used = new Set();
    // capture attrs so we can prefer existing id attribute and avoid touching non-heading content
    const headingRegex = /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi;
    let match;

    while ((match = headingRegex.exec(html)) !== null) {
        const level = Number(match[1]);
        const attrs = String(match[2] || '');
        const inner = String(match[3] || '');
        const text = stripHtml(inner).trim();
        if (!text) continue; // skip headings with no visible text (e.g., templated code)

        // prefer id from attributes if present (server-injected), otherwise generate
        let id = null;
        const idMatch = attrs.match(/\sid=(?:"|')([^"']+)(?:"|')/);
        if (idMatch) id = idMatch[1];

        if (!id) {
            id = slugifyHeading(text);
        }

        // ensure uniqueness
        const base = id; let suffix = 1;
        while (used.has(id)) id = `${base}-${suffix++}`;
        used.add(id);

        items.push({ id, text, level });
    }

    if (!items.length) return [];
    const minLevel = Math.min(...items.map((item) => item.level));
    return items.map((item) => ({
        id: item.id,
        text: item.text,
        level: item.level - minLevel + 1,
    }));
}

function generateToc({ html, markdown }) {
    // Prefer sanitized HTML if present (SSR/compiled HTML), else fallback to markdown parsing
    try {
        if (html && String(html).trim()) return buildTocFromHtml(html);
    } catch (e) {}
    try { return buildTocFromMarkdown(markdown || ''); } catch (e) { return []; }
}

// ── Index Consistency ─────────────────────────────────────

// Ensure Index Consistency on Startup
function syncIndexWithFiles() {
    try {
        if (!fs.existsSync(INDEX_FILE)) return;
        let posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
        let modified = false;

        posts.forEach(post => {
            if (Object.prototype.hasOwnProperty.call(post, 'html')) {
                delete post.html;
                modified = true;
            }

            const normalizedTitle = normalizePostTitle(post.title);
            if (normalizedTitle !== (post.title || '')) {
                post.title = normalizedTitle;
                modified = true;
                console.log(`[Sync] Decoded title entities for ${post.id}`);
            }

            // Support new per-post directory layout: POSTS_DIR/<id>/<id>-content.md
            const dirName = post.dir || (post.filename ? post.filename.replace(/\.md$/, '') : post.id);
            const dirPath = path.join(POSTS_DIR, dirName || '')
            const expected = path.join(dirPath, `${post.id}-content.md`)
            let mdPath = ''
            if (fs.existsSync(expected)) {
                mdPath = expected
            } else if (post.filename && fs.existsSync(path.join(POSTS_DIR, post.filename))) {
                mdPath = path.join(POSTS_DIR, post.filename)
            }

            if (mdPath && fs.existsSync(mdPath)) {
                let content = fs.readFileSync(mdPath, 'utf-8');
                try { content = decrypt(content); } catch(e) {}

                const { attributes } = parseFrontMatter(content);
                if (attributes.font && attributes.font !== post.font) {
                    post.font = attributes.font;
                    modified = true;
                    console.log(`[Sync] Updated font for ${post.id} from file metadata: ${post.font}`);
                }
                const author = typeof attributes.author === 'string' ? attributes.author.trim() : '';
                if ((author || '') !== (post.author || '')) {
                    post.author = author;
                    modified = true;
                    console.log(`[Sync] Updated author for ${post.id} from file metadata`);
                }
                const aiGenerated = attributes.aiGenerated === true || attributes.aiGenerated === 'true' || attributes.aiGenerated === '1';
                if (!!aiGenerated !== !!post.aiGenerated) {
                    post.aiGenerated = !!aiGenerated;
                    modified = true;
                    console.log(`[Sync] Updated aiGenerated for ${post.id} from file metadata`);
                }
            }
        });

        if (modified) {
            writeIndexFile(posts);
            console.log('[Sync] Index updated based on file metadata');
        }
    } catch (e) {
        console.error('[Sync] Failed to sync index:', e);
    }
}

// ── File Name Parsing ─────────────────────────────────────

// Helper function to parse standard filename and extract displayname
// Standard format: <timestamp>_<4-char-random>_<displayname>
function parseStandardFilename(filename) {
    const match = filename.match(/^(\d+)_[a-zA-Z0-9]{4}_(.+)$/);
    if (match) {
        return {
            timestamp: parseInt(match[1], 10),
            displayname: match[2]
        };
    }
    return null;
}

// ── Exports ───────────────────────────────────────────

module.exports = {
    sortTags,
    parseFrontMatter,
    stringifyFrontMatter,
    extractMetaFromContent,
    getPostDir,
    isValidId,
    isEncryptedContent,
    parseContentText,
    readPostContentFromDisk,
    writePostContentToDisk,
    decodeHtmlEntities,
    normalizePostTitle,
    normalizePostForResponse,
    refreshPostMetadataFromDisk,
    normalizeIndexPostRecord,
    writeIndexFile,
    sanitizeHtml,
    republishPostArtifacts,
    stripHtml,
    injectIdsIntoHtml,
    slugifyHeading,
    buildTocFromHtml,
    generateToc,
    syncIndexWithFiles,
    parseStandardFilename,
};

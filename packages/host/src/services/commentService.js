/**
 * Chronicle Host — Comment Service
 *
 * File-based comment CRUD. Comments are stored as JSON arrays on disk:
 *   data/comments/{postId}.json          — approved (publicly visible)
 *   data/comments-pending/{postId}.json  — pending review (admin only)
 *
 * All content is sanitized through DOMPurify before write.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const BASE_DIR = path.join(__dirname, '..', '..', '..', '..');
const DATA_DIR = path.join(BASE_DIR, 'data');
const COMMENTS_DIR = path.join(DATA_DIR, 'comments');
const PENDING_DIR = path.join(DATA_DIR, 'comments-pending');

// ── Sanitizer ──────────────────────────────────────────────

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Reuse shared sanitize config if available, else minimal safe defaults
let SANITIZE_CONFIG;
try {
  const shared = require('@chronicle/shared/src/utils/sanitize');
  SANITIZE_CONFIG = shared.SANITIZE_CONFIG;
} catch {
  SANITIZE_CONFIG = {
    ALLOWED_TAGS: ['a', 'img', 'p', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'em', 'strong', 'del', 'b', 'i', 'u', 'div', 'span',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'figure', 'figcaption', 'details', 'summary'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'class', 'target', 'rel'],
    ALLOW_DATA_ATTR: true,
  };
}

function sanitize(html) {
  if (!html || typeof html !== 'string') return '';
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

/** Block dangerous URL schemes (javascript:, data:, vbscript:). Returns empty string for unsafe URLs. */
function sanitizeUrl(raw) {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Only allow http, https, and relative URLs
  const dangerous = /^(javascript|data|vbscript|file):/i;
  if (dangerous.test(trimmed)) return undefined;
  return trimmed;
}

// ── Helpers ────────────────────────────────────────────────

/** Ensure a directory exists */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Generate a unique comment ID */
function generateId() {
  return `cmt-${crypto.randomUUID().slice(0, 12)}`;
}

/** Read JSON file, return parsed array or empty */
function readJson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Write array to JSON file */
function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/** Walk parent chain to find the root comment ID. Returns null if parent chain is broken. */
function resolveRootId(postId, parentId) {
  if (!parentId) return null;
  const visited = new Set();
  let current = parentId;
  while (current) {
    if (visited.has(current)) return null; // circular reference
    visited.add(current);
    // Look in both approved and pending
    const parent = findComment(readComments(postId), current) || findComment(readPendingComments(postId), current);
    if (!parent) return null;
    if (!parent.parent) return parent.rootId || parent.id;
    current = parent.parent;
  }
  return null;
}

/** Find a comment by ID in a flat array (parent-reference format — no tree traversal needed). */
function findComment(comments, commentId) {
  return comments.find(c => c.id === commentId) || null;
}

/** Remove a comment by ID from a flat array. Returns true if found and removed. */
function removeComment(comments, commentId) {
  const idx = comments.findIndex(c => c.id === commentId);
  if (idx === -1) return false;
  comments.splice(idx, 1);
  return true;
}

// ── Public API ─────────────────────────────────────────────

/** Read approved comments for a post */
function readComments(postId) {
  return readJson(path.join(COMMENTS_DIR, `${postId}.json`));
}

/** Read pending comments for a post */
function readPendingComments(postId) {
  return readJson(path.join(PENDING_DIR, `${postId}.json`));
}

/** Write approved comments (overwrites file) */
function writeComments(postId, data) {
  writeJson(path.join(COMMENTS_DIR, `${postId}.json`), data);
}

/** Write pending comments (overwrites file) */
function writePendingComments(postId, data) {
  writeJson(path.join(PENDING_DIR, `${postId}.json`), data);
}

/**
 * Add a new comment from a public submission.
 * Content is sanitized. Writes to comments-pending/ directory.
 * No status field — directory is the state (pending/ = unreviewed, comments/ = approved).
 */
function addPendingComment(postId, { author, email, website, content, parent }) {
  const comment = {
    id: generateId(),
    author: String(author || '').trim().slice(0, 64),
    email: email ? String(email).trim().slice(0, 128) : undefined,
    website: sanitizeUrl(String(website || '').trim().slice(0, 256)),
    content: sanitize(String(content || '')),
    date: new Date().toISOString(),
    parent: parent || null,
  };

  // Compute rootId — walk up parent chain, fallback to self
  comment.rootId = resolveRootId(postId, comment.parent) || comment.id;

  if (!comment.author || !comment.content) {
    throw new Error('Author and content are required');
  }

  const pending = readPendingComments(postId);
  pending.push(comment);
  writePendingComments(postId, pending);

  return comment;
}

/**
 * Scan all pending comments across all posts.
 * Returns [{ postId, comments: Comment[] }] sorted by date desc.
 */
function listAllPending() {
  ensureDir(PENDING_DIR);
  const results = [];

  if (!fs.existsSync(PENDING_DIR)) return results;

  const files = fs.readdirSync(PENDING_DIR);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const postId = file.replace('.json', '');
    const comments = readJson(path.join(PENDING_DIR, file));
    if (comments.length > 0) {
      results.push({ postId, comments });
    }
  }

  // Sort: posts with most recent comments first
  results.sort((a, b) => {
    const aMax = Math.max(...a.comments.map(c => new Date(c.date).getTime()));
    const bMax = Math.max(...b.comments.map(c => new Date(b.date).getTime()));
    return bMax - aMax;
  });

  return results;
}

/**
 * Approve a pending comment: move from pending to approved.
 * Sets hidden: false (visible by default after approval).
 */
function approveComment(postId, commentId) {
  const pending = readPendingComments(postId);
  const comment = findComment(pending, commentId);
  if (!comment) throw new Error(`Pending comment ${commentId} not found`);

  // Remove from pending
  removeComment(pending, commentId);
  writePendingComments(postId, pending);

  // Set defaults for approved comments and add to approved
  comment.hidden = false;
  const approved = readComments(postId);
  approved.push(comment);
  writeComments(postId, approved);

  return comment;
}

/**
 * Toggle hidden state on an approved comment.
 */
function hideComment(postId, commentId) {
  const approved = readComments(postId);
  const comment = findComment(approved, commentId);
  if (!comment) throw new Error(`Comment ${commentId} not found in approved`);
  comment.hidden = true;
  writeComments(postId, approved);
  return comment;
}

function unhideComment(postId, commentId) {
  const approved = readComments(postId);
  const comment = findComment(approved, commentId);
  if (!comment) throw new Error(`Comment ${commentId} not found in approved`);
  comment.hidden = false;
  writeComments(postId, approved);
  return comment;
}

/**
 * Delete a comment from either approved or pending.
 * Rejection of pending = deletion.
 */
function deleteComment(postId, commentId) {
  // Try approved first
  const approved = readComments(postId);
  if (removeComment(approved, commentId)) {
    writeComments(postId, approved);
    return true;
  }

  // Try pending
  const pending = readPendingComments(postId);
  if (removeComment(pending, commentId)) {
    writePendingComments(postId, pending);
    return true;
  }

  throw new Error(`Comment ${commentId} not found`);
}

/**
 * Get all comments for a post (both approved and pending, for admin view).
 * Returns { approved: Comment[], pending: Comment[] }
 */
function getAllComments(postId) {
  return {
    approved: readComments(postId),
    pending: readPendingComments(postId),
  };
}

// ── Rate Limiting ──────────────────────────────────────────

/** In-memory rate-limit store (cleared on restart) */
const rateLimitMap = new Map();

/**
 * Check if an IP has exceeded the rate limit.
 * Limits: 2 per minute, 20 per day.
 * Throws with a human-readable message if exceeded.
 */
function checkRateLimit(ip) {
  const now = Date.now();
  const key = String(ip || 'unknown');

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, []);
  }

  const timestamps = rateLimitMap.get(key);
  // Purge old entries
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const recent = timestamps.filter(t => t > oneDayAgo);

  // Check daily limit
  if (recent.length >= 20) {
    throw new Error('Daily comment limit reached. Please try again tomorrow.');
  }

  // Check per-minute limit
  const oneMinuteAgo = now - 60 * 1000;
  const perMinute = recent.filter(t => t > oneMinuteAgo);
  if (perMinute.length >= 2) {
    throw new Error('Too many comments. Please wait a minute before trying again.');
  }

  recent.push(now);
  rateLimitMap.set(key, recent);
}

module.exports = {
  // CRUD
  readComments,
  readPendingComments,
  writeComments,
  writePendingComments,
  addPendingComment,
  getAllComments,
  // Moderation
  listAllPending,
  approveComment,
  hideComment,
  unhideComment,
  deleteComment,
  // Security
  checkRateLimit,
  sanitize,
};

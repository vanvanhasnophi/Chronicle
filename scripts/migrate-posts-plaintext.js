#!/usr/bin/env node
/**
 * Chronicle Data Structure Reform — Migration Script
 *
 * Converts all published (and modifying) posts from AES-256-CBC encrypted
 * hex format to plaintext Markdown with YAML frontmatter.
 *
 * Usage:
 *   node scripts/migrate-posts-plaintext.js           # dry run (preview only)
 *   node scripts/migrate-posts-plaintext.js --apply   # execute migration
 *
 * After migration:
 *   - Published posts: plaintext `<id>-content.md` (starts with "---")
 *   - Draft posts:      encrypted (untouched)
 *   - Old encrypted files: backed up as `<id>-content.md.bak`
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Resolve data paths ────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const POSTS_DIR = path.join(DATA_DIR, 'posts');
const INDEX_FILE = path.join(POSTS_DIR, 'index.json');

// ── Crypto (mirrors host/src/middleware/auth.js) ─────

const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = crypto.scryptSync('chronicle-secret-key-123', 'salt', 32);

function decrypt(text) {
  if (!text || typeof text !== 'string') return '';
  const parts = text.split(':');
  if (parts.length < 2) return text; // not encrypted, return as-is
  const [ivHex, ...rest] = parts;
  const encryptedText = rest.join(':'); // handle colons in ciphertext
  if (!ivHex || !encryptedText) return text;
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return ''; // decrypt failed
  }
}

function isEncryptedContent(raw) {
  return /^[0-9a-fA-F]+:/.test(String(raw || ''));
}

// ── Frontmatter helpers ───────────────────────────────

function parseFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { attributes: {}, body: content };
  const attributes = {};
  match[1].split('\n').forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx >= 0) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      if (key === 'tags') {
        try { attributes[key] = JSON.parse(value); } catch(e) { attributes[key] = []; }
      } else if (key === 'aiGenerated') {
        attributes[key] = value === 'true';
      } else {
        attributes[key] = value;
      }
    }
  });
  return { attributes, body: match[2] };
}

// ── Main ──────────────────────────────────────────────

const DRY_RUN = !process.argv.includes('--apply');

console.log('Chronicle Post Migration —', DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE (applying changes)');
console.log(`Data dir: ${DATA_DIR}`);
console.log(`Posts dir: ${POSTS_DIR}`);
console.log(`Index file: ${INDEX_FILE}`);
console.log('');

if (!fs.existsSync(INDEX_FILE)) {
  console.error('ERROR: index.json not found at', INDEX_FILE);
  process.exit(1);
}

const posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]');
console.log(`Total posts in index: ${posts.length}`);

const migratable = posts.filter(
  p => p.status === 'published' || p.status === 'modifying' || !p.status
);
const drafts = posts.filter(p => p.status === 'draft');

console.log(`Published/modifying (will migrate): ${migratable.length}`);
console.log(`Drafts (skip): ${drafts.length}`);
console.log('');

let migrated = 0;
let skipped = 0;
let failed = 0;

for (const post of migratable) {
  const dirName = post.dir || post.id;
  const dir = path.join(POSTS_DIR, dirName);
  const contentPath = path.join(dir, `${post.id}-content.md`);

  if (!fs.existsSync(contentPath)) {
    console.log(`  SKIP  ${post.id}: no content file`);
    skipped++;
    continue;
  }

  const raw = fs.readFileSync(contentPath, 'utf-8');

  // Already plaintext?
  if (raw.startsWith('---')) {
    console.log(`  OK    ${post.id}: already plaintext`);
    skipped++;
    continue;
  }

  // Not encrypted either?
  if (!isEncryptedContent(raw)) {
    console.log(`  WARN  ${post.id}: not encrypted, no frontmatter — wrapping in frontmatter`);
    if (!DRY_RUN) {
      const frontmatter = `---\ntitle: ${post.title || ''}\ndate: ${post.date || ''}\nupdatedAt: ${post.updatedAt || ''}\ntags: ${JSON.stringify(post.tags || [])}\nfont: ${post.font || 'sans'}\n---\n`;
      const bak = contentPath + '.bak';
      fs.copyFileSync(contentPath, bak);
      fs.writeFileSync(contentPath, frontmatter + raw);
    }
    migrated++;
    continue;
  }

  // Encrypted — decrypt and rewrite
  const decrypted = decrypt(raw);
  if (!decrypted) {
    console.log(`  FAIL  ${post.id}: decryption returned empty`);
    failed++;
    continue;
  }

  console.log(`  MIGR  ${post.id}: encrypted → plaintext (${raw.length} → ${decrypted.length} chars)`);

  if (!DRY_RUN) {
    const bak = contentPath + '.bak';
    fs.copyFileSync(contentPath, bak);
    fs.writeFileSync(contentPath, decrypted);
  }
  migrated++;
}

console.log('');
console.log('═══════════════════════════════════════');
console.log(`  Migrated: ${migrated}`);
console.log(`  Skipped:  ${skipped}`);
console.log(`  Failed:   ${failed}`);
console.log('═══════════════════════════════════════');

if (DRY_RUN) {
  console.log('');
  console.log('💡 This was a DRY RUN. To apply changes, run:');
  console.log('   node scripts/migrate-posts-plaintext.js --apply');
} else {
  console.log('');
  console.log('✅ Migration complete. Old files backed up as .bak.');
  console.log('   Published posts are now plaintext Markdown with YAML frontmatter.');
}

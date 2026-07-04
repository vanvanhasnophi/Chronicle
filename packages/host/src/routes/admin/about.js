/**
 * Chronicle Host — About Page Routes
 *
 * GET  /api/admin/about  — read about.md (content + lastModified)
 * PUT  /api/admin/about  — write about.md body, auto-set lastModified
 */

const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { success, fail } = require('../../services/response');
const { requireAdminToken } = require('../../middleware/auth');
const { DATA_DIR } = require('../../config');

const router = Router();

const ABOUT_FILE = path.join(DATA_DIR, 'about.md');

function ensureAboutFile() {
  if (!fs.existsSync(ABOUT_FILE)) {
    const now = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(ABOUT_FILE, `---\nlastModified: ${now}\n---\n\n`);
  }
}

function readAbout() {
  ensureAboutFile();
  const raw = fs.readFileSync(ABOUT_FILE, 'utf-8');
  const lines = raw.split('\n');
  let lastModified = '';
  let contentStart = 0;

  if (lines[0] && lines[0].trim() === '---') {
    let i = 1;
    while (i < lines.length && lines[i].trim() !== '---') {
      const m = lines[i].match(/^lastModified:\s*(.+)/);
      if (m) lastModified = m[1].trim();
      i++;
    }
    contentStart = i + 1; // after closing ---
  }

  // skip at most 1 blank line between frontmatter separator and content
  if (contentStart < lines.length && lines[contentStart] === '') {
    contentStart++
  }
  const content = lines.slice(contentStart).join('\n');
  return { lastModified, content };
}

function writeAbout(content) {
  ensureAboutFile();
  const existing = readAbout();
  const lastModified = new Date().toISOString().slice(0, 10);
  const frontmatter = `---\nlastModified: ${lastModified}\n---\n\n`;
  fs.writeFileSync(ABOUT_FILE, frontmatter + (content || ''), 'utf-8');
  return { lastModified };
}

// ── GET /api/admin/about ──────────────────────────────────
router.get('/about', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const { lastModified, content } = readAbout();
    return success(res, { id: '__about__', content, lastModified });
  } catch (e) {
    return fail(res, 'Failed to read about page', 500);
  }
});

// ── PUT /api/admin/about ──────────────────────────────────
router.put('/about', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const { content } = req.body || {};
    if (typeof content !== 'string') {
      return fail(res, 'content is required', 400);
    }
    const { lastModified } = writeAbout(content);
    return success(res, { id: '__about__', lastModified });
  } catch (e) {
    return fail(res, 'Failed to write about page', 500);
  }
});

module.exports = router;

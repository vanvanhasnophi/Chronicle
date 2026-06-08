#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '..', 'data', 'posts');
const crypto = require('crypto');
const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = crypto.scryptSync('chronicle-secret-key-123', 'salt', 32);

function decrypt(text) {
  try {
    const [ivHex, encryptedText] = String(text || '').split(':');
    if (!ivHex || !encryptedText) return text;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return text;
  }
}

function parseFrontMatter(content) {
  const match = String(content || '').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
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

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripHtml(text) {
  return decodeHtmlEntities(String(text || '').replace(/<[^>]+>/g, ''));
}

function slugifyHeading(text) {
  const cleaned = stripHtml(text).trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'heading';
  return cleaned.replace(/\s+/g, '-').replace(/[^\w\-\u4E00-\u9FFF]/g, '');
}

function buildTocFromHtml(html) {
  const items = [];
  const used = new Set();
  const headingRegex = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const level = Number(match[1]);
    const text = stripHtml(match[2]).trim();
    if (!text) continue;
    let id = slugifyHeading(text);
    let base = id; let suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    items.push({ id, text, level });
  }
  if (!items.length) return [];
  const minLevel = Math.min(...items.map(i => i.level));
  return items.map(i => ({ id: i.id, text: i.text, level: i.level - minLevel + 1 }));
}

function buildTocFromMarkdown(content) {
  const itemsRaw = [];
  const used = new Set();
  const lines = String(content || '').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (!m) continue;
    const raw = String(m[2] || '').trim();
    // skip pure link or image headings
    const pureLinkMatch = raw.match(/^\[([^\]]+)\]\(([^)]+)\)\s*$/);
    const imageLinkMatch = raw.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (pureLinkMatch || imageLinkMatch) {
      const url = (pureLinkMatch ? pureLinkMatch[2] : imageLinkMatch ? imageLinkMatch[2] : '') || '';
      const extMatch = url.match(/\.([0-9a-z]+)(?:[?#]|$)/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : '';
      const mediaExts = new Set(['mp3','wav','ogg','m4a','flac','aac','mp4','webm','mkv','mov','avi','pdf','doc','docx','ppt','pptx','xls','xlsx','jpg','jpeg','png','gif','svg','bmp','webp','zip','rar','7z','tar','gz']);
      if (ext && mediaExts.has(ext)) continue;
    }
    if (raw.includes('<div class="file-card"') || raw.includes("class='file-card'") || raw.includes('data-type="')) continue;
    if (/^`[^`]+`$/.test(raw)) continue;
    const level = m[1].length;
    const text = stripHtml(m[2]).replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
    if (!text) continue;
    let id = slugifyHeading(text);
    let base = id; let suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    itemsRaw.push({ id, text, level });
  }
  if (!itemsRaw.length) return [];
  const minLevel = Math.min(...itemsRaw.map(i => i.level));
  return itemsRaw.map(i => ({ id: i.id, text: i.text, level: i.level - minLevel + 1 }));
}

function processPostDir(dirPath) {
  const files = fs.readdirSync(dirPath);
  const id = path.basename(dirPath);
  const compiledPath = path.join(dirPath, `${id}-compiled.html`);
  const contentPath = path.join(dirPath, `${id}-content.md`);
  let html = '';
  let md = '';
  if (fs.existsSync(compiledPath)) html = fs.readFileSync(compiledPath, 'utf-8');
  if (!html && fs.existsSync(contentPath)) {
    let raw = fs.readFileSync(contentPath, 'utf-8');
    // try decrypting; if not encrypted, decrypt() returns original
    raw = decrypt(raw);
    const parsed = parseFrontMatter(raw);
    md = parsed.body || '';
  }

  let toc = [];
  try {
    // Prefer compiled HTML only. Do NOT parse raw markdown to avoid false positives
    // from code blocks or commented lines that look like headings.
    if (html && String(html).trim()) {
      toc = buildTocFromHtml(html);
    } else {
      // No compiled HTML available — skip generating TOC to avoid incorrect ids.
      toc = [];
    }
  } catch (e) {
    toc = [];
  }

  const outPath = path.join(dirPath, `${id}-toc.json`);
  try {
    fs.writeFileSync(outPath, JSON.stringify(toc, null, 2));
    return { id, written: true, count: toc.length };
  } catch (e) {
    return { id, written: false, error: String(e) };
  }
}

function main() {
  if (!fs.existsSync(POSTS_DIR)) {
    console.error('Posts dir not found:', POSTS_DIR);
    process.exit(1);
  }
  const entries = fs.readdirSync(POSTS_DIR, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(POSTS_DIR, entry.name);
    const res = processPostDir(dir);
    if (res) results.push(res);
  }
  console.log('Regenerated TOC for', results.length, 'posts');
  results.forEach(r => console.log(r.id, '->', r.written ? `${r.count} entries` : `failed: ${r.error}`));
}

if (require.main === module) main();

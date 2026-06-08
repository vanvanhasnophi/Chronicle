const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, '..', 'data', 'posts');

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
  return decodeHtmlEntities(String(text || '').replace(/<[^>]+>/g, '')).trim();
}

function buildTocFromCompiledHtml(html) {
  if (!html) return [];
  const items = [];
  const used = new Set();
  const headingRegex = /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const level = Number(match[1]);
    const attrs = String(match[2] || '');
    const inner = String(match[3] || '');
    const text = stripHtml(inner);
    if (!text) continue;
    let id = null;
    const idMatch = attrs.match(/\sid=(?:"|')([^"']+)(?:"|')/);
    if (idMatch) id = idMatch[1];
    if (!id) {
      // fallback slug: use text with hyphens, remove problematic chars
      id = text.replace(/\s+/g, '-').replace(/[^\w\-\u4E00-\u9FFF]/g, '').replace(/-+/g, '-');
    }
    let base = id; let suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    items.push({ id, text, level });
  }
  if (!items.length) return [];
  const minLevel = Math.min(...items.map(i => i.level));
  return items.map(i => ({ id: i.id, text: i.text, level: i.level - minLevel + 1 }));
}

function run() {
  const dirs = fs.readdirSync(POSTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  let count = 0;
  dirs.forEach(dir => {
    const dirPath = path.join(POSTS_DIR, dir);
    const id = dir;
    const compiledPath = path.join(dirPath, `${id}-compiled.html`);
    if (!fs.existsSync(compiledPath)) return;
    try {
      const html = fs.readFileSync(compiledPath, 'utf8');
      const toc = buildTocFromCompiledHtml(html);
      const tocPath = path.join(dirPath, `${id}-toc.json`);
      if (fs.existsSync(tocPath)) {
        fs.copyFileSync(tocPath, tocPath + '.bak');
      }
      fs.writeFileSync(tocPath, JSON.stringify(toc, null, 2));
      console.log(`Wrote toc for ${id} -> ${toc.length} entries`);
      count++;
    } catch (e) {
      console.error('Failed for', id, e);
    }
  });
  console.log('Processed', count, 'posts');
}

run();

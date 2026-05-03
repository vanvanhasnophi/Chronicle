import { parseMarkdown } from './markdownParser';

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

type TocSourceItem = Partial<TocItem> & {
  title?: string;
  label?: string;
  name?: string;
};

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripHtml(text: string) {
  return decodeHtmlEntities(String(text || '').replace(/<[^>]+>/g, ''));
}

export function slugifyHeading(text: string) {
  const cleaned = stripHtml(text).trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'heading';

  try {
    return encodeURIComponent(cleaned);
  } catch (error) {
    return cleaned.replace(/\s+/g, '-').replace(/[^\w\-\u4E00-\u9FFF]/g, '');
  }
}

export function normalizeTocItems(toc: unknown): TocItem[] {
  if (!Array.isArray(toc)) return [];

  const used = new Set<string>();
  const items: TocItem[] = [];

  toc.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const source = item as TocSourceItem;
    const text = stripHtml(String(source.text || source.title || source.label || source.name || '')).trim();
    if (!text) return;

    const level = Math.min(6, Math.max(1, Number(source.level) || 1));
    let id = String(source.id || '').trim() || slugifyHeading(text);
    let base = id;
    let suffix = 1;
    while (used.has(id)) {
      id = `${base}-${suffix++}`;
    }
    used.add(id);

    items.push({ id, text, level });
  });

  return items;
}

export function buildTocFromBlocks(blocks: Array<{ type?: string; content?: string }>) {
  const itemsRaw: TocItem[] = [];
  const used = new Set<string>();

  blocks.forEach((block) => {
    if (block.type !== 'heading') return;

    const content = String(block.content || '');
    const match = content.match(/^\s*(#{1,6})\s+(.*)$/);
    if (!match) return;

    const level = match[1].length;
    const text = stripHtml(match[2]).replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').trim();
    if (!text) return;

    let id = slugifyHeading(text);
    let base = id;
    let suffix = 1;
    while (used.has(id)) {
      id = `${base}-${suffix++}`;
    }
    used.add(id);

    itemsRaw.push({ id, text, level });
  });

  if (!itemsRaw.length) return [];

  const minLevel = Math.min(...itemsRaw.map((item) => item.level));
  return itemsRaw.map((item) => ({
    id: item.id,
    text: item.text,
    level: item.level - minLevel + 1,
  }));
}

export function buildTocFromMarkdown(content: string) {
  return buildTocFromBlocks(parseMarkdown(content));
}

export function buildTocFromHtml(html: string) {
  const items: TocItem[] = [];
  const used = new Set<string>();
  const headingRegex = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(html)) !== null) {
    const level = Number(match[1]);
    const text = stripHtml(match[2]).trim();
    if (!text) continue;

    let id = slugifyHeading(text);
    let base = id;
    let suffix = 1;
    while (used.has(id)) {
      id = `${base}-${suffix++}`;
    }
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

export function buildTocItems(content: string, isHtml = false, toc?: unknown) {
  const normalized = normalizeTocItems(toc);
  if (normalized.length) return normalized;
  if (!content) return [];
  return isHtml ? buildTocFromHtml(content) : buildTocFromMarkdown(content);
}

export function injectHeadingIds(html: string, toc: TocItem[]) {
  if (!html || !toc.length) return html;

  let index = 0;
  return html.replace(/<h([1-6])(\b[^>]*)>([\s\S]*?)<\/h\1>/g, (full, level, attrs, inner) => {
    if (/\sid=/.test(attrs)) return full;
    const item = toc[index];
    if (!item) return full;
    index += 1;
    return `<h${level}${attrs} id="${item.id}" data-toc-level="${item.level}">${inner}</h${level}>`;
  });
}
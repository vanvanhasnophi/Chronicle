/**
 * Chronicle Shared Utilities
 *
 * Pure functions with zero dependencies — safe to use in any environment
 * (browser, Node.js, edge functions).
 */

/** Slugify a string for URLs */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

/** Extract plain text from markdown (strip formatting) */
export function stripMarkdown(md: string): string {
  return md
    .replace(/!\[.*?\]\(.*?\)/g, '')       // images
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // links
    .replace(/[#*`~>_|-]/g, '')            // formatting chars
    .replace(/\n{2,}/g, '\n')             // collapse blank lines
    .trim()
}

/** Extract first N characters of plain text as excerpt */
export function extractExcerpt(md: string, maxLen = 200): string {
  const plain = stripMarkdown(md)
  if (plain.length <= maxLen) return plain
  return plain.slice(0, maxLen).replace(/\s+\S*$/, '') + '…'
}

/** Generate a URL-friendly slug from a post title */
export function titleToSlug(title: string): string {
  return slugify(title) || 'untitled'
}

/** Safely parse JSON with a fallback */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

/** Check if a post status means it's publicly visible */
export function isPublishedStatus(status: string): boolean {
  return status === 'published' || status === 'modifying'
}

/** Format an ISO date string for display (locale-aware) */
export function formatDate(iso: string, locale = 'zh-CN'): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

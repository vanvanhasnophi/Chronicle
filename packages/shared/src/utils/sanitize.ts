/**
 * Chronicle — Shared HTML Sanitization Config
 *
 * Zero-dependency whitelist used by both template-astro (SSG build time)
 * and manager (browser CMS preview) to produce identical sanitized output.
 *
 * Intended to be consumed by DOMPurify:
 *   DOMPurify.sanitize(html, SANITIZE_CONFIG)
 */

/** Tags allowed through. Everything else is stripped, including:
 *  script, iframe, object, embed, style, form, base, svg, math, link, meta. */
export const ALLOWED_TAGS: string[] = [
  // Structure
  'a', 'img', 'video', 'audio', 'source', 'track',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'blockquote', 'pre', 'code', 'hr', 'br',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // Inline
  'em', 'strong', 'del', 'ins', 'sup', 'sub',
  'b', 'i', 'u', 's', 'small', 'mark', 'abbr', 'cite', 'dfn', 'q', 'time',
  'kbd', 'samp', 'var',
  // Containers
  'div', 'span', 'section',
  'figure', 'figcaption',
  'details', 'summary',
  // Chronicle-specific
  'input',   // code-block checkboxes in tasks
]

/** Allowed attributes per tag (or '*' for global). Everything else, including
 *  all on* event handlers, is stripped by DOMPurify. */
export const ALLOWED_ATTR: string[] = [
  'href', 'src', 'alt', 'title', 'width', 'height',
  'class', 'id', 'target', 'rel', 'loading', 'decoding',
  'controls', 'autoplay', 'loop', 'muted', 'playsinline',
  'type', 'start', 'reversed',
  'colspan', 'rowspan', 'scope',
  'open',                          // <details>
  'checked', 'disabled',           // <input>
  'datetime', 'cite',              // <time>, <blockquote>/<q>
  'data-*',                        // data-url, data-name, data-type, etc.
  'style',                         // image sizing (width/height via =WxH) — DOMPurify validates
  'srcset', 'sizes',
]

/**
 * DOMPurify-ready config object. Use with:
 *   import DOMPurify from 'dompurify'
 *   DOMPurify.sanitize(dirtyHtml, SANITIZE_CONFIG)
 */
export const SANITIZE_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  // Keep safe data-* attributes used by Chronicle file cards, image wrapper, etc.
  ALLOW_DATA_ATTR: true,
  // We use DOMPurify's built-in RETURN_TRUSTED_TYPE off; just return a string.
}

/**
 * Chronicle Post Types
 *
 * Mirrors the data structures in server/data/posts/index.json
 * and the individual <uuid>-content.md files on disk.
 */

/** TOC entry generated from markdown headings */
export interface TocEntry {
  id: string
  text: string
  level: number
}

/** A post entry in posts/index.json — metadata only, no body */
export interface PostMeta {
  /** UUID v4 */
  id: string
  title: string
  /** ISO 8601 creation date */
  date: string
  /** ISO 8601 last-modification date */
  updatedAt: string
  /** Filename on disk, e.g. "<uuid>.md" */
  filename: string
  /** First ~200 chars of content, used in list views */
  summary: string
  tags: string[]
  /** published | draft | modifying */
  status: PostStatus
  /** Font preference: "sans" | "serif" */
  font: string
  /** Which collection this post belongs to (name) */
  collection?: string
  /** Dot-path within the collection tree, e.g. "r/1/1" */
  collectionPath?: string
  author: string
  aiGenerated: boolean
  /** Directory name (= id, used on disk) */
  dir: string
  toc: TocEntry[]
  /** True if a compiled HTML version exists on disk */
  hasHtml?: boolean
}

/** Full post including markdown body and compiled HTML */
export interface Post extends PostMeta {
  /** Raw markdown content read from <uuid>-content.md */
  content: string
  /** Pre-compiled HTML read from <uuid>-compiled.html (may be empty) */
  compiledHtml: string
}

export type PostStatus = 'published' | 'draft' | 'modifying'

/** Input for creating or updating a post via API */
export interface SavePostInput {
  id?: string
  title: string
  content: string
  tags?: string[]
  status?: PostStatus
  font?: string
  collection?: string
  collectionPath?: string
  author?: string
  date?: string
}

/** Normalized post shape sent to public consumers (no draft content, no internals) */
export interface PublicPost {
  id: string
  title: string
  date: string
  updatedAt: string
  summary: string
  tags: string[]
  status: 'published' | 'modifying'
  font: string
  collection?: string
  collectionPath?: string
  author: string
  toc: TocEntry[]
  hasHtml: boolean
}

/** Paginated post list response */
export interface PaginatedPosts {
  posts: PublicPost[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

/** Arguments for listing posts */
export interface ListPostsOptions {
  page?: number
  perPage?: number
  includeDrafts?: boolean
  featured?: boolean
}

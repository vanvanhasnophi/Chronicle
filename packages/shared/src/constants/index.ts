/**
 * Chronicle Shared Constants
 */

/** Default server port */
export const DEFAULT_PORT = 3000

/** Default Astro dev server port */
export const ASTRO_DEV_PORT = 4321

/** Default Vite dev server port (manager) */
export const MANAGER_DEV_PORT = 5173

/** Data directory name (relative to server root) */
export const DATA_DIR_NAME = 'data'

/** Subdirectories under data/ */
export const POSTS_DIR_NAME = 'posts'
export const UPLOAD_DIR_NAME = 'upload'
export const BACKGROUND_DIR_NAME = 'background'

/** Data file names */
export const SETTINGS_FILE_NAME = 'settings.json'
export const SECURITY_FILE_NAME = 'security.json'
export const COLLECTION_FILE_NAME = 'collection.json'
export const INDEX_FILE_NAME = 'index.json'

/** Post content file suffix */
export const CONTENT_FILE_SUFFIX = '-content.md'
export const COMPILED_FILE_SUFFIX = '-compiled.html'
export const TOC_FILE_SUFFIX = '-toc.json'

/** Auth header name */
export const AUTH_HEADER = 'x-chronicle-auth'

/** Valid build granularities */
export const BUILD_GRANULARITIES = ['full', 'posts', 'index'] as const

/** Valid post statuses */
export const POST_STATUSES = ['published', 'draft', 'modifying'] as const

/** Manager API base path (when bundled with server) */
export const ADMIN_API_PREFIX = '/api/admin'

/** Public API base path */
export const PUBLIC_API_PREFIX = '/api/public'

/** Legacy API base path (deprecated) */
export const LEGACY_API_PREFIX = '/api'

/** Static file serve paths */
export const UPLOAD_SERVE_PATH = '/server/data/upload'
export const BACKGROUND_SERVE_PATH = '/server/data/background'
export const THUMB_SERVE_PATH = '/thumb'

# Changelog

All notable changes to this project will be documented in this file.
This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and uses [Semantic Versioning](https://semver.org/).

## [2.0.5] - 2026-06-14

### Fixed
- **Electron close-guard dialog**: replaced `will-prevent-unload` with `BrowserWindow.close` event as the primary guard. `BlogEditor` syncs `isDirty` to `window.__chronicleDirty`; 3 s `executeJavaScript` timeout prevents permanent uncloseability if the renderer hangs.
- **Electron CSP — inline event handlers dropped**: production `script-src` was missing `'unsafe-inline'`. The image wrapper's `onload`/`onerror` handlers were silently stripped by CSP, causing all editor preview images to stay at `opacity:0` behind the "Loading..." placeholder forever.
- **Electron CSP — local file resources blocked**: `img-src` and `connect-src` were missing `file:` scheme. `<img src="file:///...">` (preview) and `fetch('file:///...')` (upload recovery) both blocked. Also added `file:` to dev CSP for consistency.
- **DOMPurify stripped `file:///` URLs**: `SANITIZE_CONFIG` lacked `ALLOWED_URI_REGEXP`; DOMPurify's default whitelist (http/https/data/blob) cleared `file:///` from `src` attributes. Added explicit regex with `file:` scheme.
- **markdown-it `validateLink` rejected `file:` scheme**: default `validateLink` blocks `file:` alongside `javascript:` and `vbscript:`. Overrode on both markdown-it instances (`markdownPreview.ts` + `chronicleMarkdown.ts`) to allow `file:` — safe because `file:///` URLs only exist in local drafts and are resolved to HTTPS on publish.
- **`file:///` URLs with spaces not encoded**: `fileToUrl`, `insertMediaMarkdown`, and `FileManager.copyLink` now encode spaces/control chars that break markdown link syntax. CJK and other non-ASCII is intentionally left as-is — browsers handle it, and encoding would desync from server-side filenames in the cloud file list.
- **FilePicker `showOpenFilePicker` lost file paths in Electron**: `FileSystemFileHandle.getFile()` returns in-memory Files without `file.path`. Bypassed in Electron, falling back to `<input type="file">` which preserves `file.path` for `fileToUrl()`.
- **`applyUrlMappings` dropped type prefixes after upload**: `[song](audio:file:///...)` was replaced to `[song](/server/...)` — the `audio:` prefix was lost. Now preserved: `[song](audio:/server/...)`.
- **`getFileFromUrl` could not recover files after page refresh in Electron**: `fetch('file:///...')` is blocked by SOP in dev mode (http→file) and unreliable in production. Replaced with preload IPC `readFileByPath` → main process `fs.readFileSync` → base64 → renderer decodes to Blob/File. Added path validation (`isAbsolute`, 4KB length cap).
- **FilePicker cloud URL in local editing**: `handleMediaPicked` required `isCloudEditing` to match `uploadedUrl` entries — selecting cloud files in local/Electron mode silently did nothing.
- **FilePicker dialog inserted blob URLs instead of `file:///`**: `ent.preview` short-circuited `fileToUrl()` in the local-file branch. Now calls `fileToUrl()` directly, same pipeline as drag-and-drop/paste.
- **Preview modal showed thumbnails instead of originals**: URL priority reordered: `uploadedUrl → url → preview` (original before thumbnail).
- **`performance.ts` type error**: `setUserOverride` accepted `PerfMode` which includes `'auto'` — but `'auto'` is not a valid override. Extracted `ResolvedMode = 'full' | 'reduced'` type.

### Changed
- **FilePicker selected chips**: replaced comma-separated text with styled dismissible chips (filename + × button). Click chip to preview via `usePreview` imperative API. Multi-select chips wrap with flexbox.
- **Unified preview pipeline**: deleted `useImagePreview.ts` and `ImagePreviewModal.vue` (dead code). All file/image previews now go through `usePreview.ts` (module-level reactive singleton) → `FilePreviewModal.vue` (global mount in App.vue). Electron multi-window is safe — each window has its own JS context.
- **BREAKING: `file:` type prefix renamed to `attach:`**: the generic-file markdown prefix `file:` was indistinguishable from the `file:///` URL scheme, causing regex bugs (images silently skipped during upload, replaced URLs wrongly prefixed with `file:`). Renamed to `attach:` — short, descriptive, zero ambiguity. Existing posts using `file:` prefix in `[link](file:...)` syntax need manual migration (replace `file:` → `attach:`).

### Internal
- All packages bumped to `2.0.5`.

## [2.0.4] - 2026-06-14

### Fixed
- **Electron new window URL parsing**: Fixed `createChildWindow` on Windows to strip drive letters from window hashes (e.g., `#/C:/editor?id=xxx` → `#/editor?id=xxx`), preventing blank editor pages.

## [2.0.3] - 2026-06-13

### Changed
- **Syntax highlighting**: replaced ~800 lines of triplicated regex rules with `highlight.js` v11 across manager, markdownParser, and shared code. Custom grammars for KaTeX and Mermaid. Added `hljsSetup.ts` as single source of truth for 40+ languages.
- **Homepage footer**: profile links (`data/profile.json`) now render dynamically, replacing hardcoded GitHub/Twitter/Email links. RSS and About links retain independent feature toggles.
- **StripMarkdown unified**: `shared/utils/index.ts` now contains the canonical `stripMarkdown()` — handles YAML frontmatter, code blocks, math, tables, HTML, images, links in 18 ordered steps. Both manager and template-astro import it instead of maintaining local copies.
- **Summary generation**: host `admin/index.js` saves use `stripSummary()` instead of raw `content.slice(0,200)`. Posts saved via CMS now get clean plain-text summaries. All existing polluted summaries in `data/posts/index.json` migrated.
- **Lite mode summaries**: `chronicle-gen convert` `rebuildIndex()` now generates summaries via `stripSummary()`, so lite posts have summaries in `index.json`.
- **Dependency consolidation**: all `@codemirror/*` packages moved from root to `@chronicle/manager`. Eliminates duplicate `node_modules` copies that caused TypeScript type incompatibility (`EditorView` has private `dispatchTransactions` member — two physical copies = incompatible types).
- **Highlight architecture refactor**: markdown structure classes renamed to `cm-md-*` (editor-only, no collision with code tokens). Code token `hljs-*` rules merged into `chronicle-markdown.css` with bare class selectors — single source of truth shared by SSG output, CMS preview, and editor. Removed `.syntax-highlight` / `.cm-editor-host` prefix selectors.
- **Code block languages**: expanded from 6 to 25. Added 8 official CM6 packages (SQL, YAML, Rust, Go, Java, C++, PHP, XML) + 10 legacy modes via `StreamLanguage` (Shell, Diff, Dockerfile, TOML, Ruby, Lua, Nginx, INI, PowerShell, Makefile). All lazy-loaded via dynamic `import()`.
- **HighlightStyle function tags**: added `tags.function(tags.propertyName)` (method calls), `tags.definition(tags.function(tags.variableName))` (function defs), `tags.function(tags.macroName)` (Rust/C macros) — functions now consistently get `--code-type` color regardless of parser convention.

### Added
- **GFM task list support**: CmEditor `taskMarkerPlugin` ViewPlugin decorates `[ ]`/`[x]` as checkboxes; `markdown-it` inline rule in both `chronicleMarkdown.ts` and `markdownPreview.ts` renders `<input class="md-task-checkbox">`. CSS in `chronicle-markdown.css`.
- **Footnotes** (`markdown-it-footnote` v4): `chronicleMarkdown.ts` + `markdownPreview.ts` use plugin with custom renderer — capsule-styled number refs, no brackets, no `<sup>`. Footnote section rendered separately in preview (outside cursor→block focus mapping).
- **ICP Filing Number**: `icpNumber` field in template settings schema (`x-tab: template-homepage`). When set, renders `备案号：<value>` as a link to miit.gov.cn below the copyright line. Empty → hidden.
- **Missing settings fields in host API**: `siteName`, `siteDescription`, `singleColumnHomepage`, `cardVisibility` now exposed via `GET /api/public/settings`.
- **`extractExcerpt()`**: sentence/word-boundary truncation with CJK awareness in shared utils.
- i18n: theme follow-mode labels (`followFull`, `follow`).

### Fixed
- **Electron child window editor navigation**: `createChildWindow` URL parser now correctly handles `file:///editor?id=xxx` (without `/dist/` in path) by falling back to pathname as route.
- **Electron child window auth token loss**: main process reads token from main window, passes it to child via `?_auth=` URL parameter; preload script extracts it into `localStorage` before Vue boots.
- **Electron paste/drop file blob URL**: added `webUtils.getPathForFile()` (Electron 32+) to `preload.cjs`; `fileToUrl()` in BlogEditor now resolves clipboard File objects to real filesystem paths instead of `blob:file://` UUIDs.
- **Video file card SVG**: added `x`, `y`, `rx`, `ry` to DOMPurify `ALLOWED_ATTR` — `<rect>` position and rounded corners were stripped during sanitization.
- **Footnotes breaking preview focus**: `renderBlockHtml` and `getBlockRanges` used fixed `i += 3` offsets for paragraph/heading tokens; `markdown-it-footnote` inserted extra `footnote_anchor` tokens. Fixed with depth-loop matching (same pattern as list/blockquote/table).
- **Inter font missing in production print**: `index.html` used relative `./fonts/` path → deep routes like `/editor/print` resolved to `/editor/fonts/` (404). Changed to absolute `/fonts/`; `vite.config.ts` `transformIndexHtml` converts back to `./fonts/` for Electron `file://` builds.
- **Schema loading on editor pages**: `useSchemaNav` and `App.vue` route guards extended from `path === '/editor'` to `path.startsWith('/editor')` — editor sub-pages no longer fire `syncSchemas()` requests.

### Removed
- **`syntaxHighlight.ts`** — dead code, zero imports across the entire codebase.

### Internal
- All 6 packages bumped to `2.0.3`.
- `markdownParser.ts` (manager + template-astro) now re-exports `stripMarkdown` and `extractExcerpt` from `@chronicle/shared/utils`.

## [2.0.2] - 2026-06-13

### Added
- **Editor file handling**: drag/drop/paste local files insert type-prefixed blob URLs (`audio:blob:...`); fileMap preserves original File objects for upload without extension/MIME loss
- **File-card type-prefix rendering**: `markdownParser.ts` and `markdownPreview.ts` detect `audio:`/`video:`/`document:`/`text:` prefixes for file cards; link-text extension fallback for bare blob URLs
- **Text-file drop modal**: drag a text/code file → choose "Insert as text" / "Insert as code block" (auto language detection) / "Insert as file card"
- **Properties panel**: ⚙ button in editor toolbar row 2 opens a modal to edit title, tags, author, AI-generated flag without saving/uploading
- **Frontmatter serialization**: local `.md` files now include YAML frontmatter (`title`, `tags`, `author`, `font`, `aiGenerated`); `parseFrontmatter()` and `serializeFrontmatter()` in shared composables
- **Frontmatter date parsing**: `data/` to `site/` round-trip date handling
- **`data.backup` on convert**: `chronicle-gen convert` creates a single `data.backup/` snapshot before overwriting `data/`
- **Nested YAML parsing**: `yamlToJson` in `convert.mjs` supports indent-based nesting for `cardVisibility` etc.
- **Settings defaults injection**: `convertSettings()` fills all Chronicle-standard defaults for missing fields
- **Settings YAML→JSON mappings**: `site/settings.yml` lite keys (`title`, `theme`, `accent`, `homepage`) mapped to Chronicle JSON keys
- **`useFileTypes.ts`** composable: centralized file-type detection, type prefixes, thumbnail URLs for FilePicker and FileManager
- **`useFrontmatter.ts`** composable: YAML frontmatter parse/serialize for local `.md` files
- **`file-browser.css`** shared stylesheet: `chronicle-fb-*` classes for cloud file browser UI
- **FileManager redesign**: sorting (date/name/type), card/list view toggle, sidebar category tabs, responsive touch-friendly toolbar
- **PostManager redesign**: hybrid card-list posts view, status filter sidebar (All/Published/Draft/Modifying), search + sort, inline rename, BroadcastChannel live sync with BlogEditor
- **Dashboard redesign**: 4-row layout with template version card, storage usage + paths side by side, monthly posts bar chart, recent posts + top tags
- **Quick menu additions**: Welcome (home) + Editor quick actions in sidebar popover
- **401 global guard**: `fetchWithAuth` redirects to `/login` on 401 (exempt: `/login`, `/setup`, `/recover`, `/editor`, `/`)
- **Auth pages redirect**: already-authenticated users skip `/login`, `/setup`, `/recover` → `/dashboard`
- **Ctrl+A / Tab capture**: always act on editor content regardless of focus pane
- **Find/Search overlay**: Ctrl+F/Cmd+F opens in-editor search, Ctrl+H for replace
- **Editor save shortcuts**: Ctrl+S local save, Ctrl+P print preview
- **`site/settings.yml` complete spec**: all available fields documented with defaults and comments
- **`chronicle-fb-*` responsive breakpoints**: narrow-width toolbar wrapping, collapsible sidebar, touch-friendly sizes
- **Fieldset titles in CMS**: `NativeFieldset.vue` renders `title` from schema
- **Textarea styling**: global `textarea` matches `.modern-input` look
- **Homepage card toggles** in CMS schema: Author, Taxonomy, Activity cards under `cardVisibility` fieldset
- **`singleColumnHomepage`** toggle: forces single-column layout regardless of screen width or card presence
- **`siteDescription`** field: used as homepage card subtitle, editable in CMS Homepage settings
- **`siteName`** wired to NavHeader `app-title` and homepage card title
- **Performance mode SSR**: `data-perf` baked into static HTML for instant correct initial state; `astro:page-load` persistence
- **Tag cloud direct route**: `/search?view=tags` shows full tag cloud immediately

### Changed
- **Breaking**: `settings.json` `featureFlags` flattened to top-level fields (collectionPage, aboutPage, friendsPage, rss, sitemap, searchSuggestions, relatedPosts, traffic); `cardVisibility` remains nested; includes schema migration and `localDataSource` fallback
- **Breaking**: Traffic page removed — route de-registered, nav link removed, Dashboard card removed; `Traffic.vue` preserved for direct access
- **Breaking**: blob URL creation removed from `FilePicker.vue` — local files no longer get synthetic `uploadedUrl`
- **Electron**: window control IPC now targets the sending window via `BrowserWindow.fromWebContents(event.sender)` instead of always `mainWindow`
- **Electron**: child windows (editor) now inherit frameless `titleBarStyle: 'hidden'`, `stripOrigin`, maximize listener, and unsaved guard
- **Electron**: `getDistIndex()` no longer crashes dev mode (guarded behind `isDev` check)
- **Electron**: editor uses `file:///absolute/path` for local file references; `resolveLocalFileUrls` can read `file://` from disk when fileMap is cold
- **Manager**: all `textarea` elements now match `.modern-input` styling (padding, border-radius, focus ring)
- **Manager**: file upload in local mode waits for cloud auth before replacing blob URLs
- **FilePicker**: empty state shows "No files in this category." placeholder
- **PostManager**: category sidebar replaced by toolbar select on narrow screens
- **FileManager**: category sidebar replaced by toolbar select on narrow screens
- **Search page**: `markdownParser.ts` supports `document:` and `text:` type prefixes
- **File preview modal**: uses DOMPurify to sanitize fetched text content before `v-html`; friendly message for expired blob URLs
- **Dashboard**: `totalUploads` metric added to overview cards
- **Settings schema**: `featureFlags` restructured into groups (pages, content, syndication, analytics)
- **BlogEditor**: `handleFileSelect` simplified to unified `handleLocalFiles`; old XHR upload path removed
- **CSS**: `.card-flows.single-col` handles single-column homepage mode

### Fixed
- Tab key ignored when focus outside editor → capture-phase handler forces editor focus
- `editorRef` is Vue component not HTMLElement → fixed focus detection via `.cm-editor` DOM query
- `cardVisibility` values parsed with inline comments → `parseYamlValue` strips `# comments`
- Quoted empty strings (`""`) parsed as empty objects → fixed in `parseYamlValue`
- `getPublicSettings()` missing `siteName` → added to `LocalSettings` and return object
- `localDataSource` missing `siteDescription` → added
- Theme button in quick-popover not reflecting server settings on first login → `syncSettings` seeds `theme.value` from `backendTheme`
- SearchBox event listeners lost after Astro view transitions → wrapped in `initSearchBox()` + `astro:after-swap`
- `NativeFieldset` not rendering schema title → added `<legend>` with `resolveLocale()`
- `FilePreviewModal` click logic: all `https://` URLs redirected instead of previewing → now checks card type (Audio/Video/Document preview, only Link/Email navigate)

### Security
- `FilePreviewModal` text content sanitized with DOMPurify before `v-html` — prevents XSS from fetched text files

## [2.0.1] - 2026-07 (July Release)

### Added
- Patch 3: about page route + about editor button in CMS
- Patch 2: various CMS editor improvements
- Patch 1: initial 2.0.1 fixes

## [2.0.0] - 2026-06-08

### Added
- Monorepo architecture: `packages/host`, `packages/manager`, `packages/template-astro`, `packages/gen`, `packages/shared`
- `data/branding/` directory for avatars, favicons, and compressed backgrounds
- `data/friends.json` — friends page extracted from `settings.json`
- `data/profile.json` — author profile (name, bio, avatar)
- `data/.schema-version` — tracks migration state
- `scripts/migrate-v1-to-v2.sh` — automated v1→v2 data migration
- PM2 process name: `chronicle-host` (v2 entry: `packages/host/index.js`)

### Changed
- **Breaking**: `server/` → `packages/host/` (Express backend)
- **Breaking**: `server/data/` → `data/` (repo root, symlinked from `packages/host/data`)
- **Breaking**: `data/background/` → `data/branding/` (URL paths updated in settings.json)
- **Breaking**: `collection.json` → `collections.json` (direct array, no wrapper object)
- **Breaking**: Post rendering is frontend-only — `*-compiled.html` and `*-toc.json` removed
- **Breaking**: `friendsCards` + `friendsGlobalStyle` extracted from `settings.json` → `friends.json`
- `chronicle-deploy.sh`: PM2 registration updated to `chronicle-host`, branding symlinks
- `install.sh`: updated to v2 monorepo paths
- CMS settings panels are now schema-driven (JSON Schema + `x-*` extensions)

### Removed
- Legacy `server/index.js` entry point
- Legacy `*-compiled.html` and `*-toc.json` files in post directories
- Legacy `toc` field in `posts/index.json`

## [1.3.0] - 2026-03-29

### Added
- [Mobile] TOC button & modal
- [Mobile] Button active effects
- [Mobile] Navbar back button & title in post
- [Dev] Shell script `./clone_server.sh` for cloning `server` dir from server host
- [Dev] Shell script `./delete_all_passkeys.sh` for clearing all passkeys in dev env
- Hash navigation in post (O-3-2)

### Changed
- Padding of content area

### Fixed
- [Desktop] Floating TOC lines not aligned
- [Desktop] Inline TOC no border
- [Mobile] Nav modal no close button
- [Mobile] Nav modal not on top

### Deprecated
- 

### Removed
- 

### Security


## [1.2.0] - 2026-02-18

### Added
- Initial public release.

---

<!--
Guidelines:
- Add new changes under `Unreleased` as you work.
- When releasing, move `Unreleased` entries into a new section
	`## [X.Y.Z] - YYYY-MM-DD` and update the version.
- Group entries by Added/Changed/Fixed/etc. Keep items concise and user-focused.
-->


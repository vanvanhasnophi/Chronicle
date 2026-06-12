# Changelog

All notable changes to this project will be documented in this file.
This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and uses [Semantic Versioning](https://semver.org/).

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


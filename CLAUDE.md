# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Chronicle is a **dual-mode (static/API) personal blog system** composed of five packages:

```
packages/template-astro/   — Astro SSG blog frontend (renders posts, SEO, RSS)
packages/manager/          — Vue 3 SPA CMS (editor, file manager, site settings)
packages/host/             — Express API server (CRUD, auth, file serving)
packages/gen/              — Content generation engine (Astro builds, site→data convert)
packages/shared/           — TypeScript types, CSS, utilities (zero deps)
data/                      — Shared data: posts/, settings.json, collections.json, friends.json, profile.json, branding/, upload/
site/                      — Lite user content (optional; convert to data/ before build)
```

Components communicate over HTTP:
- **Manager → Host**: `fetchWithAuth('/api/admin/...')` — auto-attaches `x-chronicle-auth`, auto-unwraps `{ code, data, message }` envelope
- **Template → Host**: fetches from `API_BASE_URL` at SSG time; in lite mode reads data files directly via `localDataSource.ts`
- **Host → Gen**: CLI `chronicle-gen build` triggered by Admin API

## Commands

```bash
# Development
bash start.sh --dev           # Start all 3 services (host :3000, manager :5173, template :4321)
bash stop.sh                  # Kill all dev services

# Build
npm run build:full            # VPS deployment: host + manager + template + install scripts
npm run build:self-hosted     # Static hosting + local CMS
npm run build:static          # GitHub Pages: template static output only
npm run build:lite            # Lite variant: site/ → data/ → build (--site flag)

# Type checking
npm run release:check         # vue-tsc on manager
npm run typecheck             # tsc on shared + gen

# Gen CLI (packages/gen)
npx chronicle-gen build -d data -c packages/template-astro -t dist          # CMS build
npx chronicle-gen build --site -c packages/template-astro -t dist           # Lite build (site/ → data/ first)
npx chronicle-gen convert -s ./site -d ./data                               # Just convert, no build

# Node
/usr/local/bin/node            # v24 (required). /usr/bin/node is v12 — will fail.
```

## Data Format

Filesystem-based, zero database:

```
data/
├── posts/
│   ├── index.json                     # PostMeta[] — all posts metadata
│   └── <uuid>/                        # One directory per post
│       └── <uuid>-content.md          # Markdown body + YAML frontmatter
├── settings.json                      # Site configuration (JSON)
├── collections.json                   # Collection tree for organizing posts (JSON array)
├── friends.json                       # Friends page cards + global style
├── profile.json                       # Author profile (name, bio, avatar)
├── security.json                      # Password hash + passkey credentials
├── branding/                          # Brand assets (avatars, favicons, compressed backgrounds)
├── background/                        # @deprecated — legacy symlink target, use branding/
└── upload/                            # Uploaded media files
```

- **No more `*-compiled.html` or `*-toc.json`** — markdown rendering is purely a frontend concern (template-astro at build time, manager in CMS preview)
- **Compiled HTML sent to server is informational only** — not consumed by published pages
- `collection.json` replaced by single-file `collections.json` (JSON array, order = display order)

## API Response Format

All APIs return: `{ code: number, data: T, message: string }`

`fetchWithAuth` in the manager auto-unwraps this envelope — calling `await res.json()` returns `data` directly, not the wrapper. Error responses (code ≥ 400) throw. Non-envelope responses pass through unchanged.

## Markdown Rendering (Two Pipelines)

Both manager and template-astro use **markdown-it** as the single parser, with identical configuration and post-processing (`chronicleMarkdown.ts` / `markdownPreview.ts` — keep in sync).

### Pipeline B (active): Static HTML rendering
```
protectMath() → markdown-it.render() → restoreMath() → postProcessHtml()
```
- Used by both template-astro SSG and manager CMS preview
- Custom inline rules: file-card interception (`audio:`, `video:`, `document:`, `text:`, `link:`, `mailto:`), `=WxH` image sizing
- `postProcessHtml`: code blocks → CodeChunk HTML, images → image wrapper (title attr → caption)
- CMS preview uses `CodeChunk.vue` Vue components (reused from Pipeline A for mermaid/editing features)

### Pipeline A (disabled, code preserved): Interactive ContentBlock parsing
```
markdown-it.parse() → ContentBlock[] → convertToHtml()
```
Located in `packages/manager/src/utils/markdownParser.ts` + `MdParser.vue`. Kept for future rich-text editing.

### Shared CSS
`packages/shared/src/styles/chronicle-markdown.css` — imported by both template-astro and manager. All markdown-rendered content is wrapped in `.chronicle-markdown` class. CSS class names must not change (backward compatibility).

## Editor (BlogEditor)

- **Editor**: CodeMirror 6 (`CmEditor.vue`) — markdown syntax highlighting via Lezer-based `HighlightStyle`, independent theme (dark/light toggle in toolbar, persisted to localStorage), built-in search/history
- **Preview**: `MarkdownItPreview.vue` — ContentBlock-based incremental rendering, cursor-position tracking, active-block highlighting, debounced updates
- **Toolbar row 3**: view mode buttons, dark/light theme toggle, language select — control global `data-backend-theme` and i18n locale, persisted to localStorage

## Image Rendering

- `![alt](url "caption")` → caption from `title` attr (not alt), rendered in `.md-image-caption`
- `![alt](url "caption" =800x600)` → custom inline rule parses `=WxH`, applied as inline style on `.md-image-wrapper`
- Broken images: `onerror` sets `data-error="1"` on wrapper → CSS shows "Image not found"
- Loading state: `::before`/`::after` pseudo-elements show "Loading..." until img (z:1) covers them
- Loaded: `onload` adds `.loaded` class → CSS blur→clear focus-in transition

## File Card Detection

Inline rule intercepts `[text](url)` at parse time. Triggers on:
- **File extension**: `.pdf`, `.mp3`, `.mp4`, `.zip`, etc.
- **Type prefix**: `audio:`, `video:`, `document:`, `text:`, `link:`, `mailto:`, `file:`
- `data-name` = link text (markdown `[text]`), falls back to URL filename
- `data-url` = actual URL (for `mailto:`, keeps `mailto:` scheme)

## Lite Mode (`site/` directory)

```
site/
├── settings.yml              # Hand-written (YAML, converted to data/settings.json)
├── posts/
│   ├── hello-world/
│   │   ├── index.md           # Post content (frontmatter + body)
│   │   ├── photo.jpg          # Media attachments (copied to uuid dir)
│   │   └── diagram.png
│   └── about/index.md
├── collections.yml            # Optional
└── branding/                  # Source images → compressed to data/branding/ (also accepts legacy background/)
```

`npx chronicle-gen build --site` runs convert (site/→data/) then build. `localDataSource.ts` in template-astro reads from `data/` — zero changes needed. Lite mode does NOT require CMS or running backend.

## Settings Schema System

CMS settings panels are **schema-driven**. Each package owns its own configuration schema — add a new setting by editing the schema file in that package, not Vue components. The CMS discovers schemas by scanning `packages/*/schemas/` at build time.

```
packages/template-astro/schemas/     ← Template settings (theme, homepage, features, collections, friends, profile)
packages/manager/schemas/            ← CMS system settings (backend appearance, build & deploy)
packages/host/schemas/               ← Server settings (security, auth)
```

Each schema is **valid JSON Schema (draft-2020-12)** extended with `x-*` properties for UI rendering:
- `x-widget` — form control type (`input`, `toggle`, `select`, `color`, `image-picker`, `background-editor`, etc.)
- `x-tab` / `x-group` — which tab and fieldset this field belongs to
- `x-order` — display order within the group
- `x-visible-when` — conditional visibility rules
- `x-advanced` — hide behind "Advanced" toggle

**Navigation**: Schemas declare their position via `x-groups` (aggregated settings) or `x-nav` (standalone data files). The CMS reads all schemas at boot to build the settings navigation tree:

```
顶级导航：
├── Dashboard
├── Posts              ← content (standalone, most-used)
├── Files              ← content (standalone, cross-cutting)
├── Template ▼          ← group: template
│   ├── Homepage
│   ├── Appearance
│   ├── Features
│   ├── Collections
│   ├── Friends
│   └── About
└── System ▼           ← group: system
    ├── Appearance
    ├── Build & Deploy
    └── Security
```

Full spec: [docs/tech/schema-spec.md](docs/tech/schema-spec.md).

## Auth Lifecycle

Chronicle uses a **phase-based auth model** with zero external dependencies:

- **Setup phase** (`/api/admin/setup`): First boot — creates password + 10 one-time recovery codes. Setup token protection prevents remote hijacking of uninitialized instances.
- **Normal phase** (`/api/admin/auth/login`): Password or Passkey login.
- **Recovery phase** (`/api/admin/recover`): recovery codes → reset password. No email/SMTP needed.
- **CLI bypass**: `npx chronicle setup|reset-password|show-token` — always available when the user has SSH/filesystem access. This is the ultimate fallback across all deployment modes.

Relevant files:
- `packages/host/src/services/authService.js` — phase detection, token/code generation & verification
- `packages/host/src/routes/admin/auth-lifecycle.js` — setup/recover endpoints
- `packages/host/schemas/security.schema.json` — schema for `data/security.json`

## Key Design Rules

1. **Dual-mode must not invade business logic.** `getApiUrl()` in `site.ts` is the single abstraction point.
2. **Content format = Markdown + YAML frontmatter.** Directory structure mirrors mainstream SSGs.
3. **Manager is the single CMS codebase.** Distribution variants differ in assembly, not code.
4. **CMS preview matches published pages.** Same markdown-it pipeline, same CSS, same HTML output.
5. **Nothing in `data/` requires a database.** Everything is filesystem-based, git-trackable.
6. **Settings forms are schema-driven.** Add a config field by editing a JSON Schema file; the CMS renders it automatically. No new Vue components needed for standard widgets.

## Deployment Scripts

| Script | Purpose |
|--------|---------|
| `install.sh` | Full VPS bootstrap (Node, Nginx, clone, build, start) |
| `chronicle-deploy.sh` | Update existing VPS install (git pull, rebuild, PM2 restart) |
| `start.sh` / `stop.sh` | Dev mode: start/stop all 3 services |
| `scripts/migrate-v1-to-v2.sh` | v1→v2 data migration (tar.gz → data/ + transformation) |
| `scripts/migrate-posts-plaintext.js` | AES-256-CBC encrypted posts → plaintext (idempotent) |

## PM2 (Production)

v2 uses PM2 to manage the host process:

```bash
pm2 start packages/host/index.js --name chronicle-host
pm2 save
pm2 logs chronicle-host
```

The old v1 process name `chronicle-server` (pointing to `server/index.js`) should be deleted after migration.

## v1 → v2 Data Migration

See `scripts/migrate-v1-to-v2.sh` for automated migration. Key changes from v1:

- `server/data/` → `data/` (repo root, symlinked from `packages/host/data`)
- `*-compiled.html` + `*-toc.json` removed from post dirs (rendering is frontend-only)
- `toc` field stripped from `posts/index.json` entries
- `collection.json` → `collections.json` (unwrapped from `{collections:[]}` object)
- `friendsCards` + `friendsGlobalStyle` extracted from `settings.json` → `friends.json`
- `data/background/` → `data/branding/` (URL paths updated in settings.json)

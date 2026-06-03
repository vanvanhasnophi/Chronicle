# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Chronicle is a **dual-mode (static/API) personal blog system** composed of three independent components:

```
packages/template-astro/   — Astro SSG blog frontend (renders posts, SEO, RSS)
packages/manager/          — Vue 3 SPA CMS (editor, file manager, site settings)
packages/host/             — Express API server (CRUD, auth, file serving)
packages/gen/              — Content generation engine (Astro builds, image processing)
packages/shared/           — TypeScript types, constants, utilities (zero deps)
data/                      — Shared data: posts/, upload/, settings.json, collection.json
```

The components communicate exclusively over HTTP:
- **Manager → Host**: `fetchWithAuth('/api/admin/...')` — `x-chronicle-auth` header
- **Template → Host**: `getApiUrl('/api/posts')` — SSG fetches from `API_BASE_URL` at build time, client fetches `/api/...` at runtime
- **Host → Gen**: CLI invocation (`chronicle-gen build`) triggered by Admin API

## Commands

```bash
# Development
bash start.sh --dev           # Start all 3 services (host :3000, manager :5173, template :4321)
bash stop.sh                  # Kill all dev services

# Build (5 variants)
npm run build:full            # VPS deployment: host + manager + template + install scripts
npm run build:self-hosted     # Static hosting + local CMS: manager + template + Nginx config
npm run build:static          # GitHub Pages: template static output only
npm run build:manager         # Standalone CMS client
npm run build:lite            # Bare template, fork-and-deploy (currently needs API_BASE_URL)

# Type checking
npm run release:check         # vue-tsc on manager
npm run typecheck             # tsc on shared + gen
```

## Environment Variables

| Variable | Used by | Purpose |
|----------|---------|---------|
| `API_BASE_URL` | template-astro (build time) | SSG fetches posts/settings from this origin. Default `http://127.0.0.1:3000` |
| `VITE_API_BASE_URL` | manager (runtime) | Overrides `/api/` fetch target. Set to `https://vps.example.com` for remote CMS |
| `MEDIA_DOMAIN` | template, host | CDN/media base URL for upload/ and background/ paths |
| `VITE_CDN_BASE_URL` | manager | CDN base for media in the CMS |

## Dual-Mode Switching

Template data fetching goes through `packages/template-astro/src/core/site.ts`:

```ts
export function getApiUrl(endpoint: string, isSSR: boolean): string {
  return isSSR ? `${API_BASE_URL}${endpoint}` : endpoint
}
```

- **API mode** (build time / full / self-hosted): `isSSR=true` → fetches from `API_BASE_URL`
- **Static mode** (client-side / lite): `isSSR=false` → uses relative `/api/...` (same-origin or proxy)

The manager intercepts `window.fetch` in `packages/manager/src/main.ts`: when `VITE_API_BASE_URL` is set, all `/api/*` requests are prepended with the base URL. Otherwise, requests go through Vite's dev proxy to `localhost:3000`.

## Data Format

All content is filesystem-based (zero database):

```
data/
├── posts/
│   ├── index.json                    # PostMeta[] — all posts metadata
│   └── <uuid>/                       # One directory per post
│       ├── <uuid>-content.md         # Markdown body + YAML frontmatter
│       ├── <uuid>-compiled.html      # Pre-compiled HTML (build artifact)
│       └── <uuid>-toc.json           # Table of contents (build artifact)
├── settings.json                     # ChronicleSettings (all site config)
├── collection.json                   # Collection tree for organizing posts
├── security.json                     # Password hash + passkey credentials
├── upload/                           # Uploaded media files
└── background/                       # Processed background images
```

## API Response Format

All APIs must return: `{ code: number, data: T, message: string }`

Type definitions live in `packages/shared/src/types/api.ts` (`ApiResponse<T>`) and `packages/shared/src/types/post.ts` (`PostMeta`, `Post`, etc.).

## Key Design Rules

1. **Dual-mode must not invade business logic.** Switching between API/static is controlled by environment variables. The data-fetching layer uses `getApiUrl()` as the single abstraction point.
2. **Content format = Markdown + YAML frontmatter.** Directory structure mirrors mainstream SSGs (Hugo/Hexo/Astro Content Collections) for migration compatibility.
3. **Variant differences are assembly-time only.** `scripts/build.sh` conditionally composes release packages from the same source. No variant-specific code branches exist in business logic.
4. **Manager is the single CMS codebase.** All 5 distribution variants use `packages/manager/` — the difference is deployment mode (Cloud, Local·API upload, Local·static upload) and optional plugin components.

## Distribution Variants

| Variant | CMS | Server | Deploy to | build.sh target |
|---------|-----|--------|-----------|-----------------|
| full | Cloud (bundled on VPS) | ✅ host on VPS | VPS | `full` |
| self-hosted | Local·API upload | ✅ host on VPS | VPS | `self-hosted` |
| static | Local·static upload | ❌ | GitHub Pages | `static` |
| lite | ❌ none | ❌ | Any static host | `lite` |
| manager | Standalone client | ❌ | — | `manager` |

See `docs/versions.md` for the complete specification.

## Current State

- **Phase 1 (monorepo restructure):** Complete. `server/` → `packages/host/`, `packages/admin/` → `packages/manager/`, `packages/shared/` and `packages/gen/` created.
- **host/index.js** is still a ~4000-line monolithic Express server (CommonJS). The directory split enables future modularization but the code itself hasn't been decomposed yet.
- **gen** is a skeleton package. Build worker and image processing logic still live in `packages/host/`.
- **No tests exist yet.** Vitest configuration is deferred to Phase 2.
- **lite is blocked:** template-astro currently only fetches from API at SSG time. `DATA_SOURCE=local` (Astro Content Collections) mode is not yet implemented.
- **Node version:** The project requires Node ≥18. The WSL environment has `/usr/local/bin/node` (v24) which must be used. `/usr/bin/node` (v12) will fail on optional chaining syntax.

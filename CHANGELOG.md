# Changelog

All notable changes to this project will be documented in this file.
This project adheres to [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and uses [Semantic Versioning](https://semver.org/).

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

## [1.3.0 Unreleased] - 2026-03-29

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


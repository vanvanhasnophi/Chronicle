/**
 * Chronicle Template — Local Data Source
 *
 * Reads content directly from the filesystem at build time.
 * Enables the `lite` variant: build without a running backend.
 *
 * Usage:
 *   DATA_SOURCE=local npm run build
 *
 * The Chronicle data directory is resolved as:
 *   1. CHRONICLE_DATA_DIR env var (absolute path)
 *   2. ../data relative to template-astro/ (monorepo layout)
 *   3. ./data relative to CWD (standalone lite checkout)
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Path Resolution ─────────────────────────────────────

function resolveDataDir(): string {
    if (process.env.CHRONICLE_DATA_DIR) {
        return path.resolve(process.env.CHRONICLE_DATA_DIR);
    }
    // Monorepo: CWD is packages/template-astro/ during build
    const repoRoot = path.resolve(process.cwd(), '..', '..');
    const monorepoData = path.join(repoRoot, 'data');
    if (fs.existsSync(monorepoData)) return monorepoData;
    // Standalone lite checkout: CWD/data/
    const cwd = path.resolve(process.cwd(), 'data');
    if (fs.existsSync(cwd)) return cwd;
    // Direct env or fallback
    return path.resolve(process.cwd(), '..', '..', 'data');
}

const DATA_DIR = resolveDataDir();
const POSTS_DIR = path.join(DATA_DIR, 'posts');
const INDEX_FILE = path.join(POSTS_DIR, 'index.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const COLLECTION_FILE = path.join(DATA_DIR, 'collection.json');

// ── Types ────────────────────────────────────────────────

export interface PostMeta {
    id: string;
    title: string;
    date: string;
    updatedAt?: string;
    filename: string;
    summary: string;
    tags: string[];
    status: string;
    font?: string;
    collection?: string;
    collectionPath?: string;
    author?: string;
    aiGenerated?: boolean;
    dir: string;
    toc: { id: string; text: string; level: number }[];
    hasHtml?: boolean;
}

export interface LocalPost extends PostMeta {
    content: string;
    compiledHtml: string;
}

export interface LocalSettings {
    frontendTheme?: string;
    frontendAccent?: string;
    frontendBackground?: unknown;
    frontendBackgroundMeta?: string;
    frontendFont?: string;
    frontendLocale?: string;
    featureFlags?: Record<string, boolean>;
    friendsCards?: unknown;
    friendsGlobalStyle?: unknown;
    homepageMode?: string;
    frontendBackgroundCompression?: number;
    gaMeasurementId?: string;
}

// ── Post Access ──────────────────────────────────────────

/** Load all post metadata from index.json */
export function getAllPosts(): PostMeta[] {
    if (!fs.existsSync(INDEX_FILE)) {
        console.warn('[localDataSource] No index.json found at', INDEX_FILE);
        return [];
    }
    const raw = fs.readFileSync(INDEX_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
}

/** Get published posts only */
export function getPublishedPosts(): PostMeta[] {
    return getAllPosts().filter(
        p => p.status === 'published' || p.status === 'modifying' || !p.status
    );
}

/** Get a single post with content */
export function getPostById(id: string): LocalPost | null {
    const posts = getAllPosts();
    const meta = posts.find(p => p.id === id);
    if (!meta) return null;

    const dir = path.join(POSTS_DIR, meta.dir || id);
    const contentPath = path.join(dir, `${id}-content.md`);
    const htmlPath = path.join(dir, `${id}-compiled.html`);

    let content = '';
    let compiledHtml = '';

    if (fs.existsSync(contentPath)) {
        try {
            content = fs.readFileSync(contentPath, 'utf-8');
            // Strip YAML frontmatter if present
            if (content.startsWith('---')) {
                const end = content.indexOf('---', 3);
                if (end !== -1) content = content.slice(end + 3).trim();
            }
        } catch (e) {
            console.warn('[localDataSource] Failed to read content for', id);
        }
    }

    if (fs.existsSync(htmlPath)) {
        try {
            compiledHtml = fs.readFileSync(htmlPath, 'utf-8');
        } catch (e) { /* ignore */ }
    }

    return { ...meta, content, compiledHtml };
}

/** Search posts by keyword */
export function searchPosts(keyword: string, tags?: string[]): PostMeta[] {
    let posts = getPublishedPosts();
    const kw = keyword.trim().toLowerCase();

    if (kw) {
        posts = posts.filter(p => {
            if ((p.title || '').toLowerCase().includes(kw)) return true;
            if ((p.summary || '').toLowerCase().includes(kw)) return true;
            if ((p.tags || []).some(t => String(t).toLowerCase().includes(kw))) return true;
            return false;
        });
    }

    if (tags && tags.length > 0) {
        posts = posts.filter(p =>
            tags.every(t => (p.tags || []).map(x => String(x).trim()).includes(t))
        );
    }

    posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return posts;
}

// ── Settings ─────────────────────────────────────────────

/** Get public-safe settings */
export function getPublicSettings(): LocalSettings {
    if (!fs.existsSync(SETTINGS_FILE)) {
        console.warn('[localDataSource] No settings.json found at', SETTINGS_FILE);
        return {};
    }
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    return {
        frontendTheme: raw.frontendTheme,
        frontendAccent: raw.frontendAccent,
        frontendBackground: raw.frontendBackground,
        frontendBackgroundMeta: raw.frontendBackgroundMeta,
        frontendFont: raw.frontendFont,
        frontendLocale: raw.frontendLocale,
        featureFlags: raw.featureFlags,
        friendsCards: raw.friendsCards,
        friendsGlobalStyle: raw.friendsGlobalStyle,
        homepageMode: raw.homepageMode,
        frontendBackgroundCompression: raw.frontendBackgroundCompression,
        gaMeasurementId: raw.gaMeasurementId,
    };
}

// ── Collections ──────────────────────────────────────────

/** Get collections data */
export function getCollections(): Record<string, unknown> {
    if (!fs.existsSync(COLLECTION_FILE)) return { collections: [] };
    return JSON.parse(fs.readFileSync(COLLECTION_FILE, 'utf-8') || '{}');
}

// ── Debug ────────────────────────────────────────────────

console.log('[localDataSource] DATA_DIR:', DATA_DIR);
console.log('[localDataSource] Posts:', getAllPosts().length, '| Published:', getPublishedPosts().length);

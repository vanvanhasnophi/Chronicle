/**
 * Chronicle Host — Configuration
 *
 * Central constants, paths, and defaults for the Host server.
 * Extracted from the original monolithic index.js.
 */

const path = require('path');

// ── Base Paths ──────────────────────────────────────────
const BASE_DIR = __dirname + '/..'; // up from src/ to packages/host/
const DATA_DIR = path.join(BASE_DIR, 'data');
const LOG_DIR = path.join(BASE_DIR, 'log');
const UPLOAD_DIR = path.join(DATA_DIR, 'upload');
const BRANDING_DIR = path.join(DATA_DIR, 'branding');
const MANAGER_BACKGROUND_DIR = path.join(DATA_DIR, 'manager-background');
const POSTS_DIR = path.join(DATA_DIR, 'posts');
const PUBLIC_DIR = path.join(BASE_DIR, 'public');

// ── Data Files ──────────────────────────────────────────
const SECURITY_FILE = path.join(DATA_DIR, 'security.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const COLLECTION_FILE = path.join(DATA_DIR, 'collection.json');
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');
const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');
const INDEX_FILE = path.join(POSTS_DIR, 'index.json');
const ACCESS_LOG = path.join(LOG_DIR, 'access.log');

// ── Defaults ────────────────────────────────────────────
const PORT = 3000;
const DEFAULT_MANAGER_DOMAIN = 'blogmanager.eightyfor.top';
const DEFAULT_BUILD_SETTINGS = {
    frontendUrl: 'blog.eightyfor.top',
    frontendCodeDir: '/opt/Chronicle/packages/template-astro',
    frontendBuildTargetDir: '/var/www/blog.eightyfor.top'
};
const VALID_BUILD_GRANULARITIES = new Set(['full', 'posts', 'index']);

// ── File Categories ─────────────────────────────────────
const CATEGORIES = ['pic', 'sound', 'txt', 'video', 'doc', 'other'];

// ── Traffic ─────────────────────────────────────────────
const TRAFFIC_LOG_FILE = ACCESS_LOG;
const TRAFFIC_RANGE_ALIASES = {
    '1': '1d',
    '7': '7d',
    '12': '12h',
    '30': '30d',
    '90': '30d',
    all: '30d',
};
const VALID_TRAFFIC_RANGES = new Set(['30min', '12h', '1d', '7d', '30d']);

module.exports = {
    BASE_DIR, DATA_DIR, LOG_DIR, UPLOAD_DIR, BRANDING_DIR, MANAGER_BACKGROUND_DIR,
    POSTS_DIR, PUBLIC_DIR,
    SECURITY_FILE, SETTINGS_FILE, FRIENDS_FILE, PROFILE_FILE, COLLECTION_FILE, INDEX_FILE, ACCESS_LOG,
    PORT, DEFAULT_MANAGER_DOMAIN, DEFAULT_BUILD_SETTINGS,
    VALID_BUILD_GRANULARITIES,
    CATEGORIES,
    TRAFFIC_LOG_FILE, TRAFFIC_RANGE_ALIASES, VALID_TRAFFIC_RANGES
};

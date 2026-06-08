/**
 * Chronicle Host — Data Migration Service
 *
 * Runs on startup. Detects old-format data files and migrates them
 * to the current schema version. All migrations are idempotent.
 *
 * Records the applied schema version in data/.schema-version so each
 * migration only runs once per version bump.
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR, SETTINGS_FILE, SECURITY_FILE } = require('../config');
const { sha512, generateSetupToken } = require('./authService');

const VERSION_FILE = path.join(DATA_DIR, '.schema-version');

function readVersionFile() {
  try { return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf-8')); } catch { return {}; }
}

function writeVersionFile(versions) {
  fs.writeFileSync(VERSION_FILE, JSON.stringify(versions, null, 2), 'utf-8');
}

// ═══════════════════════════════════════════════════════════
//  Settings Migration
// ═══════════════════════════════════════════════════════════

/**
 * Migrate data/settings.json to match current template + system schemas.
 *
 * v0 → v1 changes:
 *   - "language" renamed to "frontendLocale" (fields are already mapped
 *     by convert.mjs for site→data, but old data/ might still have it)
 *   - "featureFlags" was a string, now an object
 *   - New backend fields get defaults
 */
function migrateSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return;

  const versions = readVersionFile();
  if (versions.settings === '1.0.0') return; // already current

  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  let changed = false;

  // v0 → v1
  if (!versions.settings) {
    // "language" → "frontendLocale"
    if (settings.language && !settings.frontendLocale) {
      settings.frontendLocale = settings.language;
      delete settings.language;
      changed = true;
    }

    // "featureFlags" was sometimes stored as empty string instead of object
    if (typeof settings.featureFlags === 'string') {
      settings.featureFlags = {
        searchSuggestions: false,
        relatedPosts: false,
        collectionPage: true,
        aboutPage: true,
        friendsPage: true,
        traffic: true,
      };
      changed = true;
    }

    // Backfill backend appearance defaults (not present in old settings)
    if (!settings.backendTheme) { settings.backendTheme = 'dark'; changed = true; }
    if (!settings.backendFont) { settings.backendFont = 'sans'; changed = true; }
    if (!settings.backendLocale) { settings.backendLocale = 'en'; changed = true; }

    versions.settings = '1.0.0';
  }

  if (changed) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    console.log('[migration] settings.json → v1.0.0');
  }

  writeVersionFile(versions);
}

// ═══════════════════════════════════════════════════════════
//  Security Migration
// ═══════════════════════════════════════════════════════════

/**
 * Migrate data/security.json to match current security schema.
 *
 * v0 → v1 changes:
 *   - Add hashVersion: 0 for existing passwords (created with legacy
 *     hardcoded salt). Will be silently upgraded to v1 on next login.
 *   - Add hashSalt for new/upgraded installations.
 *   - Add setupComplete: true if passwordHash exists.
 *   - Add empty recoveryCodes array.
 */
function migrateSecurity() {
  if (!fs.existsSync(SECURITY_FILE)) return;

  const versions = readVersionFile();
  if (versions.security === '1.0.0') return;

  const security = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
  let changed = false;

  if (!versions.security) {
    // Existing password created with old hardcoded salt → mark as v0
    if (security.passwordHash && security.hashVersion === undefined) {
      security.hashVersion = 0;
      changed = true;
    }

    // Legacy salt: old passwords were created with this hardcoded value.
    // It stays until the user resets their password, at which point a
    // random per-installation salt replaces it (handled by authService).
    if (!security.hashSalt) {
      security.hashSalt = 'chronicle-salt';
      changed = true;
    }

    if (security.passwordHash && security.setupComplete === undefined) {
      security.setupComplete = true;
      changed = true;
    }

    if (!security.recoveryCodes) {
      security.recoveryCodes = [];
      changed = true;
    }

    versions.security = '1.0.0';
  }

  if (changed) {
    fs.writeFileSync(SECURITY_FILE, JSON.stringify(security, null, 2), 'utf-8');
    console.log('[migration] security.json → v1.0.0');
  }

  writeVersionFile(versions);
}

// ═══════════════════════════════════════════════════════════
//  Run All Migrations
// ═══════════════════════════════════════════════════════════

function runMigrations() {
  try {
    migrateSettings();
    migrateSecurity();
  } catch (e) {
    console.error('[migration] Failed:', e.message);
  }
}

module.exports = { runMigrations, migrateSettings, migrateSecurity };

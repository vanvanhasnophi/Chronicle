/**
 * Chronicle Host — Collection Service (Single-File JSON)
 *
 * Stores all collections in a single `data/collections.json` file.
 * The JSON array order is the canonical display order.
 * No slug management, no YAML parsing, no index file.
 */

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config');

const COLLECTIONS_FILE = path.join(DATA_DIR, 'collections.json');

// ── Public API ──────────────────────────────────────────────────

function readAllCollections() {
  try {
    if (!fs.existsSync(COLLECTIONS_FILE)) return { collections: [] };
    const raw = fs.readFileSync(COLLECTIONS_FILE, 'utf-8');
    const parsed = JSON.parse(raw || '[]');
    return { collections: Array.isArray(parsed) ? parsed : (parsed.collections || []) };
  } catch (e) {
    console.error('[collectionService] Failed to read collections:', e.message);
    return { collections: [] };
  }
}

function writeAllCollections(data) {
  const collections = Array.isArray(data.collections) ? data.collections : [];
  fs.writeFileSync(COLLECTIONS_FILE, JSON.stringify(collections, null, 2), 'utf-8');
}

function readCollection(slug) {
  const all = readAllCollections();
  return all.collections.find(c => c.slug === slug || c.name === slug) || null;
}

function deleteCollection(slug) {
  const all = readAllCollections();
  all.collections = all.collections.filter(c => c.slug !== slug && c.name !== slug);
  writeAllCollections(all);
}

function updateOrder(order) {
  if (!Array.isArray(order)) return;
  const all = readAllCollections();
  const bySlug = new Map();
  const byName = new Map();
  for (const c of all.collections) {
    if (c.slug) bySlug.set(c.slug, c);
    if (c.name) byName.set(c.name, c);
  }
  const sorted = [];
  for (const key of order) {
    if (!key) continue;
    const c = bySlug.get(key) || byName.get(key);
    if (c) { sorted.push(c); bySlug.delete(c.slug || ''); byName.delete(c.name || ''); }
  }
  // Append any not in the order
  for (const c of all.collections) {
    if (!sorted.includes(c)) sorted.push(c);
  }
  writeAllCollections({ collections: sorted });
  return readAllCollections();
}

/** Check if legacy collection.json (old format) or collection YAML files still exist. */
function hasLegacyCollectionFile() {
  const { COLLECTION_FILE } = require('../config');
  return fs.existsSync(COLLECTION_FILE);
}

module.exports = {
  readAllCollections,
  readCollection,
  writeAllCollections,
  deleteCollection,
  updateOrder,
  hasLegacyCollectionFile,
};

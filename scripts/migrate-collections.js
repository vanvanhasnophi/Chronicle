#!/usr/bin/env node
/**
 * Chronicle — Collection Migration Script
 *
 * Splits data/collection.json into individual data/collections/<slug>.yml files.
 * One collection per file, no cross-references.
 *
 * Usage:
 *   node scripts/migrate-collections.js          dry run (show what would change)
 *   node scripts/migrate-collections.js --apply  execute migration
 *
 * Idempotent — safe to run multiple times.
 */

const fs = require('fs');
const path = require('path');

// ── Path resolution ────────────────────────────────────────────

function resolveDataDir() {
  if (process.env.CHRONICLE_DATA_DIR) return path.resolve(process.env.CHRONICLE_DATA_DIR);
  const repoRoot = path.resolve(__dirname, '..');
  return path.join(repoRoot, 'data');
}

const DATA_DIR = resolveDataDir();
const LEGACY_FILE = path.join(DATA_DIR, 'collection.json');
const TARGET_DIR = path.join(DATA_DIR, 'collections');

// ── Helpers ─────────────────────────────────────────────────────

function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'untitled';
}

function escapeYamlValue(val) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  const str = String(val);
  if (/[:"{}[\],&*#?|\-<>=!%@`']/.test(str) || str.includes('\n') || str === '') {
    return JSON.stringify(str);
  }
  return str;
}

function yamlIndent(level) { return '  '.repeat(level); }

function nodeToYaml(node, level) {
  const indent = yamlIndent(level);
  const lines = [];
  if (node.type === 'post') {
    lines.push(`${indent}- type: post`);
    lines.push(`${indent}  id: ${escapeYamlValue(node.id)}`);
  } else if (node.type === 'group') {
    lines.push(`${indent}- type: group`);
    if (node.title) lines.push(`${indent}  title: ${escapeYamlValue(node.title)}`);
    lines.push(`${indent}  children:`);
    for (const child of (node.children || [])) {
      lines.push(...nodeToYaml(child, level + 1));
    }
    if (!node.children || node.children.length === 0) {
      lines.push(`${indent}  children: []`);
    }
  }
  return lines;
}

function collectionToYaml(col) {
  const slug = col.slug || slugify(col.name);
  const lines = [];
  lines.push(`# ${col.name || slug}`);
  lines.push(`slug: ${escapeYamlValue(slug)}`);
  lines.push(`name: ${escapeYamlValue(col.name || '')}`);
  if (col.description) lines.push(`description: ${escapeYamlValue(col.description)}`);
  if (col.cover) lines.push(`cover: ${escapeYamlValue(col.cover)}`);
  lines.push('children:');
  for (const node of (col.nodes || [])) {
    lines.push(...nodeToYaml(node, 0));
  }
  return lines.join('\n') + '\n';
}

// ── Main ────────────────────────────────────────────────────────

const apply = process.argv.includes('--apply');

function main() {
  console.log(apply ? '[MIGRATE] Running migration (--apply)' : '[MIGRATE] Dry run (use --apply to execute)');
  console.log(`  Legacy: ${LEGACY_FILE}`);
  console.log(`  Target: ${TARGET_DIR}/\n`);

  if (!fs.existsSync(LEGACY_FILE)) {
    console.log('  ✅ No legacy collection.json found — nothing to migrate.');
    return;
  }

  // Check if migration already done
  if (fs.existsSync(TARGET_DIR) && fs.readdirSync(TARGET_DIR).filter(f => f.endsWith('.yml')).length > 0) {
    console.log('  ✅ Multi-file collections already exist. Skipping migration.');
    console.log('  (Delete data/collections/*.yml to re-migrate from collection.json)');
    return;
  }

  let legacy;
  try {
    legacy = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf-8'));
  } catch (e) {
    console.error('  ❌ Failed to parse collection.json:', e.message);
    process.exit(1);
  }

  const collections = legacy.collections || [];
  console.log(`  Found ${collections.length} collection(s).\n`);

  if (collections.length === 0) {
    console.log('  No collections to migrate.');
    return;
  }

  for (const col of collections) {
    const slug = col.slug || slugify(col.name);
    const yaml = collectionToYaml(Object.assign({}, col, { slug }));
    const filePath = path.join(TARGET_DIR, `${slug}.yml`);

    console.log(`  ${col.name || slug} → ${slug}.yml`);
    console.log(`    nodes: ${(col.nodes || []).length} top-level entries`);

    if (apply) {
      if (!fs.existsSync(TARGET_DIR)) fs.mkdirSync(TARGET_DIR, { recursive: true });
      fs.writeFileSync(filePath, yaml, 'utf-8');
    }
  }

  if (apply) {
    // Rename legacy file to .bak
    const bakPath = LEGACY_FILE.replace(/\.json$/, '.json.bak');
    fs.renameSync(LEGACY_FILE, bakPath);
    console.log(`\n  ✅ Migration complete. ${collections.length} files created.`);
    console.log(`  📦 Legacy file backed up to: ${bakPath}`);
  } else {
    console.log(`\n  🔍 Dry run complete. Run with --apply to execute.`);
  }
}

main();

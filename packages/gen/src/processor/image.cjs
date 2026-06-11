/**
 * Chronicle Gen — Image Processor
 *
 * Sharp-based image processing pipeline. Extracted from server/index.js
 * background compression logic. Handles:
 * - Background image compression (WebP conversion, resizing)
 * - Compression factor computation based on blur settings
 *
 * CommonJS module for consumption by the host Express server.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Helper Functions ──────────────────────────────────────

function parseBackgroundLikeValue(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    return { url: raw };
  }
}

function normalizeBackgroundCompressionValue(meta) {
  if (!meta || typeof meta !== 'object') return 1;
  const explicitCandidates = [meta.compressionFactor, meta.compression, meta.bgCompression, meta.scale];
  for (const candidate of explicitCandidates) {
    const num = Number(candidate);
    if (Number.isFinite(num) && num > 0) {
      return Math.min(30, num);
    }
  }
  return 1;
}

function normalizeBackgroundImagePath(rawValue) {
  const raw = parseBackgroundLikeValue(rawValue);
  const candidates = [];

  if (typeof rawValue === 'string') {
    candidates.push(rawValue);
  }

  if (raw && typeof raw === 'object') {
    candidates.push(raw.sourcePath, raw.originalPath, raw.path, raw.url, raw.sourceUrl, raw.generatedPath);
  }

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value) continue;

    try {
      const pathname = /^https?:\/\//i.test(value) ? (new URL(value)).pathname : value;
      const normalized = pathname
        .replace(/^\/+/, '')
        .replace(/^server\/data\/upload\//, '')
        .replace(/^server\/data\/background\//, '')
        .replace(/^server\/data\/branding\//, '')
        .replace(/^server\/data\/manager-background\//, '')
        .trim();
      if (!normalized || normalized.startsWith('..')) continue;
      return normalized;
    } catch (e) {
      const normalized = value
        .replace(/^\/+/, '')
        .replace(/^server\/data\/upload\//, '')
        .replace(/^server\/data\/background\//, '')
        .replace(/^server\/data\/branding\//, '')
        .replace(/^server\/data\/manager-background\//, '')
        .trim();
      if (!normalized || normalized.startsWith('..')) continue;
      return normalized;
    }
  }

  return '';
}

async function readBackgroundSourceHeight(rawValue, uploadDir) {
  const relPath = normalizeBackgroundImagePath(rawValue);
  if (!relPath) return null;

  const absPath = path.resolve(uploadDir, relPath);
  if (!absPath.startsWith(uploadDir) || !fs.existsSync(absPath)) return null;

  try {
    const sharp = require('sharp');
    const metadata = await sharp(absPath).metadata();
    const height = Number(metadata && metadata.height);
    return Number.isFinite(height) && height > 0 ? height : null;
  } catch (e) {
    return null;
  }
}

function sanitizeBackgroundStem(value) {
  const base = String(value || '').trim().replace(/\.[^.]+$/, '');
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'background';
}

function getBackgroundOutputRel(scope, rawValue) {
  const sourcePath = normalizeBackgroundImagePath(rawValue);
  const sourceStem = sanitizeBackgroundStem(sourcePath.split('/').pop() || 'background');
  const scopePrefix = scope === 'frontend' ? 'chr_f_bg' : 'chr_b_bg';
  const hash = crypto.createHash('sha1').update(`${scope}:${sourcePath}`).digest('hex').slice(0, 10);
  return `${scopePrefix}-${sourceStem}-${hash}.webp`;
}

function clearBackgroundOutputs(scope, brandingDir) {
  const scopePrefix = scope === 'frontend' ? 'chr_f_bg-' : 'chr_b_bg-';
  if (!fs.existsSync(brandingDir)) return;

  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath);
        try {
          const remaining = fs.readdirSync(absPath);
          if (!remaining.length) fs.rmdirSync(absPath);
        } catch (e) {}
        continue;
      }

      if (!entry.isFile()) continue;
      if (!entry.name.startsWith(scopePrefix) || !entry.name.endsWith('.webp')) continue;
      try {
        fs.unlinkSync(absPath);
      } catch (e) {}
    }
  };

  walk(brandingDir);
}

function resolveBackgroundUrlByRel(relPath, mediaDomain) {
  const normalized = String(relPath || '').replace(/^\/+/, '').trim();
  if (!normalized) return '';
  const origin = mediaDomain ? mediaDomain.replace(/\/$/, '') : '';
  const fileName = normalized.split('/').pop() || '';
  // chr_b_bg-* → manager-background (CMS backend), chr_f_bg-* → branding (frontend)
  if (/^chr_b_bg-/i.test(fileName) || normalized.startsWith('manager-background/')) {
    return origin ? `${origin}/server/data/manager-background/${normalized}` : `/server/data/manager-background/${normalized}`;
  }
  const base = normalized.startsWith('branding/') || normalized.startsWith('background/') || /^chr_f_bg-/i.test(fileName)
    ? '/server/data/branding/'
    : '/server/data/upload/';
  return origin ? `${origin}${base}${normalized}` : `${base}${normalized}`;
}

async function computeBackgroundCompression(meta, rawBackgroundValue, uploadDir) {
  if (!meta || typeof meta !== 'object') return 1;

  const explicit = normalizeBackgroundCompressionValue(meta);
  if (explicit > 1) return explicit;

  const blurCandidates = [
    meta.blur,
    meta.blurLight,
    meta.blurDark,
    meta.lightBlur,
    meta.darkBlur,
    meta.overlayLightBlur,
    meta.overlayDarkBlur,
  ]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!blurCandidates.length) return 1;

  const sourceHeight = Number(meta.originalHeight || meta.height || await readBackgroundSourceHeight(rawBackgroundValue, uploadDir));
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) return 1;

  const factor = (sourceHeight / 1000) * 0.6 * Math.min(...blurCandidates);
  if (!Number.isFinite(factor) || factor <= 1) return 1;
  return Math.min(30, factor);
}

// ── Main Compression Function ─────────────────────────────

/**
 * Compress a background image.
 *
 * @param {Object} options
 * @param {string} options.scope - 'frontend' or 'backend'
 * @param {Object|null} options.meta - Background meta object
 * @param {Object|string|null} options.background - Background image reference
 * @param {string} options.uploadDir - Absolute path to upload directory
 * @param {string} options.brandingDir - Absolute path to branding output directory
 * @param {string} options.mediaDomain - Optional MEDIA_DOMAIN env value
 * @returns {Promise<Object>} Result object with { success, skipped?, scope, compression, meta, background, message? }
 */
async function compressBackground(options) {
  const {
    scope,
    meta: rawMeta,
    background: rawBackground,
    uploadDir,
    brandingDir,
    mediaDomain,
  } = options;

  if (!rawMeta || typeof rawMeta !== 'object') {
    return {
      success: true,
      skipped: true,
      message: 'Missing meta',
      meta: null,
      background: rawBackground || null,
    };
  }

  const compression = await computeBackgroundCompression(rawMeta, rawBackground, uploadDir);
  const sourcePath = normalizeBackgroundImagePath(rawBackground);
  if (!sourcePath) {
    return {
      success: true,
      skipped: true,
      message: 'Missing background source',
      meta: rawMeta,
      background: rawBackground || null,
    };
  }

  const sharp = require('sharp');
  const absSourcePath = path.resolve(uploadDir, sourcePath);
  if (!absSourcePath.startsWith(uploadDir) || !fs.existsSync(absSourcePath)) {
    return {
      success: true,
      skipped: true,
      message: 'Background source not found',
      meta: rawMeta,
      background: rawBackground || null,
    };
  }

  const relPath = getBackgroundOutputRel(scope, sourcePath);
  const absTargetPath = path.resolve(brandingDir, relPath);
  if (!absTargetPath.startsWith(brandingDir)) {
    throw new Error('Invalid background target path');
  }

  clearBackgroundOutputs(scope, brandingDir);
  fs.mkdirSync(path.dirname(absTargetPath), { recursive: true, mode: 0o775 });

  const sourceMeta = await sharp(absSourcePath).metadata();
  const sourceWidth = Number(sourceMeta.width || 0);
  const sourceHeight = Number(sourceMeta.height || 0);
  const quality = Math.max(35, Math.min(92, Math.round(92 - (compression - 1) * 5)));
  const resizeWidth = sourceWidth > 0 ? Math.max(128, Math.round(sourceWidth / Math.max(1, compression))) : undefined;

  let transformer = sharp(absSourcePath, { failOnError: false }).webp({ quality, effort: 4 });
  if (resizeWidth && resizeWidth > 0 && sourceWidth > resizeWidth) {
    transformer = transformer.resize({ width: resizeWidth, withoutEnlargement: true });
  }

  await transformer.toFile(absTargetPath);

  const nextMeta = {
    ...rawMeta,
    compressionFactor: compression,
    compression,
    bgCompression: compression,
  };

  const generatedPath = relPath;
  const generatedName = path.basename(relPath);
  const generatedUrl = resolveBackgroundUrlByRel(relPath, mediaDomain);

  return {
    success: true,
    scope,
    compression,
    meta: nextMeta,
    background: {
      url: generatedUrl,
      path: generatedPath,
      sourcePath,
      sourceName: path.basename(sourcePath),
      generatedPath,
      generatedName,
    },
  };
}

// ── Exports ───────────────────────────────────────────────

module.exports = {
  // Main
  compressBackground,

  // Helpers (exported for testing and reuse)
  parseBackgroundLikeValue,
  normalizeBackgroundCompressionValue,
  normalizeBackgroundImagePath,
  readBackgroundSourceHeight,
  sanitizeBackgroundStem,
  getBackgroundOutputRel,
  clearBackgroundOutputs,
  resolveBackgroundUrlByRel,
  computeBackgroundCompression,
};

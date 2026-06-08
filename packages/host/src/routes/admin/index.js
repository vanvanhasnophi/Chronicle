/**
 * Chronicle Host — Admin Routes
 *
 * Write routes and sensitive read routes extracted from the monolithic index.js.
 * All routes in this router require admin authentication (token or passkey),
 * except for auth endpoints that validate their own credentials.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execSync, spawn } = require('child_process');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const rateLimit = require('express-rate-limit');

const config = require('../../config');
const { requireAdminToken, hashPassword, encrypt, decrypt } = require('../../middleware/auth');
const { success, fail } = require('../../services/response');
const postService = require('../../services/postService');
const collectionService = require('../../services/collectionService');
const authLifecycle = require('./auth-lifecycle');

// ── Destructure config ───────────────────────────────────
const {
  BASE_DIR, DATA_DIR, UPLOAD_DIR, BRANDING_DIR, MANAGER_BACKGROUND_DIR, POSTS_DIR,
  SECURITY_FILE, SETTINGS_FILE, COLLECTION_FILE, PROFILE_FILE, INDEX_FILE,
  DEFAULT_BUILD_SETTINGS, DEFAULT_MANAGER_DOMAIN,
  VALID_BUILD_GRANULARITIES, CATEGORIES,
} = config;

// ── Admin State (extracted from index.js) ─────────────────
const isDev = process.argv.includes('--dev');

let RP_ID = 'localhost';
let ORIGIN = 'http://localhost:5173';

if (!isDev) {
  RP_ID = process.env.FRONTEND_DOMAIN || process.env.RP_ID || 'blog.eightyfor.top';
  ORIGIN = process.env.ORIGIN || (RP_ID === 'localhost' ? 'http://localhost:3000' : `https://${RP_ID}`);
}

const MEDIA_DOMAIN = (process.env.MEDIA_DOMAIN && process.env.MEDIA_DOMAIN.replace(/\/$/, '')) || (isDev ? 'http://localhost:3000' : 'https://file.eightyfor.top');

const passkeyChallenges = new Map();
const verificationCodes = new Map();

// ── Rate Limiter for Auth Endpoints ──────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, data: null, message: 'Too many attempts, try again later' },
});

// ── Gen CLI path (local monorepo, not published to npm) ──────
const GEN_CLI = path.resolve(__dirname, '..', '..', '..', '..', 'gen', 'bin', 'cli.mjs');

// ── CDN Helpers (fire-and-forget via gen CLI) ────────────────
// These spawn gen as a child process so CDN operations
// never block the request. Failures are logged but never surface
// to the client — CDN cache is best-effort.

function spawnCdnPurge(urls = []) {
  const valid = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (valid.length === 0 || process.env.CDN_ENABLED !== 'true') return;
  const child = spawn('node', [GEN_CLI, 'cdn', 'purge', ...valid], {
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
}

function spawnCdnWarm(urls = []) {
  const valid = Array.isArray(urls) ? urls.filter(Boolean) : [];
  if (valid.length === 0) return;
  const child = spawn('node', [GEN_CLI, 'cdn', 'warm', ...valid], {
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
}

// ── Admin Auth Middleware ────────────────────────────────
// Skip auth for endpoints that validate their own credentials.
router.use((req, res, next) => {
  if (req.path.startsWith('/auth/login') ||
      req.path.startsWith('/auth/change') ||
      req.path.startsWith('/auth/code') ||
      req.path.startsWith('/auth/passkey/register') ||
      req.path.startsWith('/auth/passkey/login') ||
      req.path === '/status' ||
      req.path.startsWith('/setup') ||
      req.path.startsWith('/recover')) {
    return next();
  }
  if (!requireAdminToken(req, res)) return;
  next();
});

// ── Auth Lifecycle Routes (public — no auth required) ────
// /status, /setup, /recover/verify, /recover/reset
router.use(authLifecycle);

// ═══════════════════════════════════════════════════════════
//  HELPER FUNCTIONS (extracted from index.js)
// ═══════════════════════════════════════════════════════════


function getBuildSettings() {
  let saved = {};
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) || {};
    } catch (e) {
      saved = {};
    }
  }

  const frontendUrl = String(saved.frontendUrl || DEFAULT_BUILD_SETTINGS.frontendUrl || '').trim();
  const frontendCodeDir = String(saved.frontendCodeDir || DEFAULT_BUILD_SETTINGS.frontendCodeDir || '').trim();
  const frontendBuildTargetDir = String(saved.frontendBuildTargetDir || DEFAULT_BUILD_SETTINGS.frontendBuildTargetDir || '').trim() || `/var/www/${frontendUrl || DEFAULT_BUILD_SETTINGS.frontendUrl}`;

  return {
    ...DEFAULT_BUILD_SETTINGS,
    ...saved,
    frontendUrl,
    frontendCodeDir,
    frontendBuildTargetDir,
  };
}

// ── Build Helpers ────────────────────────────────────────

function normalizeBuildGranularity(value) {
  if (typeof value !== 'string') return 'full';
  const normalized = value.trim().toLowerCase();
  return VALID_BUILD_GRANULARITIES.has(normalized) ? normalized : 'full';
}

let activeAstroBuild = null;

function getActiveAstroBuild() {
  return activeAstroBuild;
}

function beginAstroBuild(context) {
  if (activeAstroBuild) {
    const startedAt = activeAstroBuild.startedAt ? new Date(activeAstroBuild.startedAt).toISOString() : '';
    const message = startedAt
      ? `Build already in progress（buildId=${activeAstroBuild.buildId}, startedAt=${startedAt}）`
      : `Build already in progress（buildId=${activeAstroBuild.buildId}）`;
    const error = new Error(message);
    error.code = 'ASTRO_BUILD_BUSY';
    throw error;
  }

  activeAstroBuild = {
    buildId: Date.now(),
    startedAt: Date.now(),
    ...context,
  };

  return activeAstroBuild;
}

function endAstroBuild(buildId) {
  if (!activeAstroBuild) return;
  if (buildId && activeAstroBuild.buildId !== buildId) return;
  activeAstroBuild = null;
}

function getBuildStatusMessage(status) {
  const messages = {
    pending: 'Build is starting...',
    success: 'Build completed successfully',
    failed: 'Build failed',
    timeout: 'Build timeout after 2min, gen continues in background'
  };
  return messages[status] || 'Unknown build status';
}

/**
 * Spawn gen as a child process to execute the actual Astro build.
 * host is the coordinator — it checks concurrency, spawns gen, and reports status.
 * gen is the executor — it syncs settings, runs astro build, and copies output.
 */
function spawnGenBuild(settings, options = {}) {
  return new Promise((resolve, reject) => {
    const buildId = Date.now();
    const granularity = normalizeBuildGranularity(options.granularity);
    const codeDir = path.resolve(settings.frontendCodeDir || DEFAULT_BUILD_SETTINGS.frontendCodeDir);
    const targetDir = path.resolve(settings.frontendBuildTargetDir || `/var/www/${settings.frontendUrl || DEFAULT_BUILD_SETTINGS.frontendUrl}`);
    const dataDir = fs.realpathSync(DATA_DIR); // resolve symlink → canonical path (/opt/Chronicle/data)
    const repoRoot = path.resolve(__dirname, '..', '..', '..');

    const args = [
      GEN_CLI, 'build',
      '--dataDir', dataDir,
      '--codeDir', codeDir,
      '--targetDir', targetDir,
      '--granularity', granularity,
    ];

    console.log(`[Build ${buildId}] Spawning: node ${args.join(' ')}`);

    const child = spawn('node', args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    let settled = false;
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      handler(value);
    };

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      endAstroBuild(buildId);
      if (code === 0) {
        console.log(`[Build ${buildId}] Completed (exit 0)`);
        resolve({ buildId, status: 'success', result: { codeDir, targetDir, granularity }, error: null, message: getBuildStatusMessage('success') });
      } else {
        const errMsg = stderr.trim() || stdout.slice(-500) || `exit code ${code}`;
        console.error(`[Build ${buildId}] Failed:`, errMsg);
        const failure = new Error(errMsg);
        failure.status = 'failed';
        failure.buildId = buildId;
        failure.buildError = errMsg;
        reject(failure);
      }
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      endAstroBuild(buildId);
      console.error(`[Build ${buildId}] Spawn error:`, err.message);
      reject(err);
    });

    // 2min timeout: respond to CMS, gen keeps running independently
    setTimeout(() => {
      if (settled) return;
      settled = true;
      child.unref();
      console.log(`[Build ${buildId}] Timeout after 2min — gen continues in background`);
      resolve({ buildId, status: 'timeout', result: null, error: null, message: getBuildStatusMessage('timeout') });
    }, 120000);
  });
}

// ── Background / Compression Helpers ──────────────────────

const {
  compressBackground,
  parseBackgroundLikeValue,
  computeBackgroundCompression,
} = require('../../../../gen/src/processor/image.cjs');

// ── Storage Helpers ───────────────────────────────────────

function safeDirectorySize(dirPath) {
  try {
    if (!dirPath || !fs.existsSync(dirPath)) return 0;
    const stat = fs.lstatSync(dirPath);
    if (!stat.isDirectory()) return stat.size || 0;

    let total = 0;
    const walk = (target) => {
      let entries = [];
      try {
        entries = fs.readdirSync(target, { withFileTypes: true });
      } catch (e) {
        return;
      }

      for (const entry of entries) {
        const abs = path.join(target, entry.name);
        let st;
        try {
          st = fs.lstatSync(abs);
        } catch (e) {
          continue;
        }

        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) {
          walk(abs);
        } else {
          total += Number(st.size) || 0;
        }
      }
    };

    walk(dirPath);
    return total;
  } catch (e) {
    return 0;
  }
}

function getDiskStatsByPath(targetPath) {
  try {
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(targetPath);
      const bsize = Number(stats.bsize) || 0;
      const blocks = Number(stats.blocks) || 0;
      const bavail = Number(stats.bavail) || 0;
      const bfree = Number(stats.bfree) || 0;
      const totalBytes = bsize * blocks;
      const availableBytes = bsize * bavail;
      const usedBytes = bsize * Math.max(0, blocks - bfree);
      if (totalBytes > 0) {
        return { totalBytes, availableBytes, usedBytes };
      }
    }
  } catch (e) {
    // Fall through to df parsing.
  }

  try {
    const escaped = String(targetPath || '').replace(/"/g, '\\"');
    const output = execSync(`df -kP "${escaped}"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const lines = output.trim().split(/\r?\n/);
    if (lines.length < 2) {
      return { totalBytes: 0, availableBytes: 0, usedBytes: 0 };
    }
    const parts = lines[1].trim().split(/\s+/);
    const totalKb = Number(parts[1]) || 0;
    const usedKb = Number(parts[2]) || 0;
    const availableKb = Number(parts[3]) || 0;
    return {
      totalBytes: totalKb * 1024,
      usedBytes: usedKb * 1024,
      availableBytes: availableKb * 1024,
    };
  } catch (e) {
    return { totalBytes: 0, availableBytes: 0, usedBytes: 0 };
  }
}

function resolveManagerDomain(settings) {
  const candidates = [
    settings && settings.managerDomain,
    settings && settings.managerUrl,
    settings && settings.backendUrl,
    settings && settings.backendDomain,
    settings && settings.backendHost,
  ];
  for (const raw of candidates) {
    const value = String(raw || '').trim();
    if (!value) continue;
    try {
      const host = /^https?:\/\//i.test(value) ? new URL(value).host : value;
      if (host) return host;
    } catch (e) {
      if (value) return value;
    }
  }
  return DEFAULT_MANAGER_DOMAIN;
}

function resolveApiSourcePath(baseDir) {
  // v2 monorepo: baseDir = packages/host, packages/ = ../ , repo root = ../../
  const packagesDir = path.resolve(baseDir, '..');
  const repoRoot = path.resolve(baseDir, '..', '..');
  const repoName = path.basename(repoRoot).toLowerCase();

  const looksLikeChronicleRepo = repoName === 'chronicle' || (
    fs.existsSync(path.join(repoRoot, 'package.json')) &&
    fs.existsSync(path.join(repoRoot, 'packages', 'host')) &&
    fs.existsSync(path.join(repoRoot, 'packages', 'manager'))
  );

  // apiPath = <repo_root>/packages (source code root for all packages)
  return looksLikeChronicleRepo ? path.join(repoRoot, 'packages') : packagesDir;
}

// ── Post Service Wrappers ─────────────────────────────────

function sortTags(tags) { return postService.sortTags(tags); }

function parseFrontMatter(content) { return postService.parseFrontMatter(content); }
function stringifyFrontMatter(attributes, body) { return postService.stringifyFrontMatter(attributes, body); }
function getPostDir(post) { return postService.getPostDir(post); }
function isValidId(id) { return postService.isValidId(id); }
function readPostContentFromDisk(post) { return postService.readPostContentFromDisk(post); }
function writePostContentToDisk(post, content, options) { return postService.writePostContentToDisk(post, content, options); }
function normalizePostTitle(title) { return postService.normalizePostTitle(title); }
function normalizePostForResponse(post) { return postService.normalizePostForResponse(post); }
function refreshPostMetadataFromDisk(post) { return postService.refreshPostMetadataFromDisk(post); }
function writeIndexFile(posts) { return postService.writeIndexFile(posts); }
function republishPostArtifacts(post) { return postService.republishPostArtifacts(post); }
function injectIdsIntoHtml(html) { return postService.injectIdsIntoHtml(html); }
function buildTocFromHtml(html) { return postService.buildTocFromHtml(html); }
function generateToc(opts) { return postService.generateToc(opts); }
function sanitizeHtml(html) { return postService.sanitizeHtml(html); }
function parseStandardFilename(filename) { return postService.parseStandardFilename(filename); }
function getDeviceTypeFromUA(ua) {
  if (!ua) return 'Unknown';
  ua = ua.toLowerCase();
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('cros')) return 'ChromeOS';
  return 'Other';
}

function ensureDevSymlink() {
  try {
    const frontendPublic = path.resolve(__dirname, '..', '..', '..', '..', 'manager', 'public');
    if (fs.existsSync(frontendPublic)) {
      const targetParent = path.join(frontendPublic, 'server', 'data');
      const targetLink = path.join(targetParent, 'upload');
      const brandingLink = path.join(targetParent, 'branding');

      if (!fs.existsSync(targetParent)) {
        fs.mkdirSync(targetParent, { recursive: true });
      }

      if (!fs.existsSync(targetLink)) {
        if (fs.existsSync(UPLOAD_DIR)) {
          try { fs.unlinkSync(targetLink); } catch (e) {}
          fs.symlinkSync(UPLOAD_DIR, targetLink, 'dir');
          console.log('[Dev] Created static asset symlink:', targetLink);
        }
      }

      if (!fs.existsSync(brandingLink)) {
        if (fs.existsSync(BRANDING_DIR)) {
          try { fs.unlinkSync(brandingLink); } catch (e) {}
          fs.symlinkSync(BRANDING_DIR, brandingLink, 'dir');
          console.log('[Dev] Created branding asset symlink:', brandingLink);
        }
      }
    }
  } catch (e) {
    // Silent fail
  }
}

// ═══════════════════════════════════════════════════════════
//  AUTH ROUTES (no admin token required at middleware)
// ═══════════════════════════════════════════════════════════

// ── Code Verification ─────────────────────────────────────

router.use('/auth/code/generate', authLimiter);
router.get('/auth/code/generate', (req, res) => {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  verificationCodes.set('admin', {
    code,
    expires: Date.now() + 5 * 60 * 1000
  });
  console.log('Generated code:', code);
  res.json({ code, expiresIn: 300 });
});

router.use('/auth/code/verify', authLimiter);
router.post('/auth/code/verify', (req, res) => {
  const { code } = req.body;
  const stored = verificationCodes.get('admin');

  if (!stored) return res.status(400).json({ success: false, message: 'No code active' });
  if (Date.now() > stored.expires) {
    verificationCodes.delete('admin');
    return res.status(400).json({ success: false, message: 'Code expired' });
  }

  if (stored.code === code) {
    verificationCodes.delete('admin');
    res.json({ success: true, token: 'session-valid' });
  } else {
    res.status(400).json({ success: false, message: 'Invalid code' });
  }
});

// ── Passkey Registration ──────────────────────────────────

router.post('/auth/passkey/register/options', async (req, res) => {
  const user = 'admin';
  const reqOrigin = req.get('origin') || ORIGIN;
  let reqRPID = RP_ID;
  try { if (reqOrigin) reqRPID = new URL(reqOrigin).hostname; } catch (e) {}

  const options = await generateRegistrationOptions({
    rpName: 'Chronicle Blog',
    rpID: reqRPID,
    userID: new Uint8Array(Buffer.from(user)),
    userName: user,
    timeout: 60000,
  });
  passkeyChallenges.set(user, options.challenge);
  res.json(options);
});

router.post('/auth/passkey/register/verify', async (req, res) => {
  try {
    const { response } = req.body;
    const user = 'admin';
    const expectedChallenge = passkeyChallenges.get(user);

    if (!expectedChallenge) return res.status(400).json({ error: 'No challenge' });

    const reqOrigin = req.get('origin') || ORIGIN;
    let reqRPID = RP_ID;
    try { if (reqOrigin) reqRPID = new URL(reqOrigin).hostname; } catch (e) {}

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: reqOrigin,
      expectedRPID: reqRPID,
    });

    if (verification.verified && verification.registrationInfo) {
      passkeyChallenges.delete(user);

      if (!fs.existsSync(SECURITY_FILE)) {
        const defaultHash = hashPassword('admin');
        fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: defaultHash, devices: [] }));
      }

      const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
      if (!saved.devices) saved.devices = [];

      const { credential } = verification.registrationInfo;
      const deviceName = os.hostname();
      const ua = req.headers['user-agent'] || '';
      const deviceType = getDeviceTypeFromUA(ua);
      const dateStr = new Date().toLocaleDateString();

      let finalName = req.query.name || `${deviceName} (${deviceType}, ${dateStr})`;

      saved.devices.push({
        credentialID: credential.id,
        credentialPublicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: response.response.transports,
        name: finalName,
        createdAt: new Date().toISOString()
      });

      fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
      res.json({ verified: true });
    } else {
      res.status(400).json({ verified: false });
    }
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

// ── Passkey Login ─────────────────────────────────────────

router.post('/auth/passkey/login/options', async (req, res) => {
  const user = 'admin';
  const reqOrigin = req.get('origin') || ORIGIN;
  let reqRPID = RP_ID;
  try { if (reqOrigin) reqRPID = new URL(reqOrigin).hostname; } catch (e) {}

  const options = await generateAuthenticationOptions({
    rpID: reqRPID,
    userVerification: 'preferred',
  });
  passkeyChallenges.set(user, options.challenge);
  res.json(options);
});

router.post('/auth/passkey/login/verify', async (req, res) => {
  try {
    const { response } = req.body;
    const user = 'admin';
    const expectedChallenge = passkeyChallenges.get(user);

    if (!fs.existsSync(SECURITY_FILE)) return res.status(400).send('No devices registered');
    const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
    const devices = saved.devices || [];

    const device = devices.find(d => d.credentialID === response.id);
    if (!device) return res.status(400).send('Device not found');

    const reqOrigin = req.get('origin') || ORIGIN;
    let reqRPID = RP_ID;
    try { if (reqOrigin) reqRPID = new URL(reqOrigin).hostname; } catch (e) {}

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: expectedChallenge || '',
      expectedOrigin: reqOrigin,
      expectedRPID: reqRPID,
      credential: {
        id: device.credentialID,
        publicKey: new Uint8Array(Buffer.from(device.credentialPublicKey, 'base64url')),
        counter: device.counter,
        transports: device.transports,
      },
    });

    if (verification.verified) {
      passkeyChallenges.delete(user);
      device.counter = verification.authenticationInfo.newCounter;
      fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
      res.json({ verified: true, token: 'session-valid' });
    } else {
      res.status(400).json({ verified: false });
    }
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: e.message });
  }
});

// ── Password Login / Change ───────────────────────────────

router.use('/auth/login', authLimiter);
router.post('/auth/login', (req, res) => {
  try {
    const { password } = req.body;

    if (!fs.existsSync(SECURITY_FILE)) {
      const defaultHash = hashPassword('admin');
      fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: defaultHash }));
    }

    const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
    const attemptHash = hashPassword(password);

    if (saved.passwordHash === attemptHash) {
      if (saved.devices && saved.devices.length > 0) {
        res.json({ success: true, requirePasskey: true });
      } else {
        res.json({ success: true, token: 'session-valid' });
      }
    } else {
      res.status(401).json({ success: false, message: 'Invalid password' });
    }
  } catch (e) {
    res.status(500).send('Error');
  }
});

router.use('/auth/change', authLimiter);
router.post('/auth/change', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const { oldPassword, newPassword, token } = req.body;

    if (!fs.existsSync(SECURITY_FILE)) {
      const newHash = hashPassword(newPassword);
      fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: newHash }));
      return res.json({ success: true });
    }

    const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
    const oldHash = hashPassword(oldPassword);

    if (saved.passwordHash === oldHash) {
      if (saved.devices && saved.devices.length > 0) {
        if (token !== 'session-valid') {
          return res.json({ success: false, requirePasskey: true });
        }
      }

      const newHash = hashPassword(newPassword);
      saved.passwordHash = newHash;
      fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, message: 'Old password incorrect' });
    }
  } catch (e) {
    res.status(500).send('Error');
  }
});

// ═══════════════════════════════════════════════════════════
//  PASSKEY MANAGEMENT ROUTES (admin token required)
// ═══════════════════════════════════════════════════════════

router.get('/auth/passkeys', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    if (!fs.existsSync(SECURITY_FILE)) return res.json([]);
    const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
    const devices = (saved.devices || []).map(d => ({
      id: d.credentialID,
      name: d.name || 'Unnamed Passkey',
      createdAt: d.createdAt || '',
      transports: d.transports
    }));
    res.json(devices);
  } catch (e) {
    res.status(500).json([]);
  }
});

router.delete('/auth/passkeys/:id', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const { id } = req.params;
    if (!fs.existsSync(SECURITY_FILE)) return res.status(404).send('No file');

    const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
    if (!saved.devices) return res.status(404).send('Not found');

    const initialLen = saved.devices.length;
    saved.devices = saved.devices.filter(d => d.credentialID !== id);

    if (saved.devices.length === initialLen) {
      return res.status(404).send('Not found');
    }

    fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).send('Error');
  }
});

router.patch('/auth/passkeys/:id', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!fs.existsSync(SECURITY_FILE)) return res.status(404).send('No file');

    const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
    const device = (saved.devices || []).find(d => d.credentialID === id);

    if (!device) return res.status(404).send('Not found');

    device.name = name || device.name;
    fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
    res.json({ success: true });
  } catch (e) {
    res.status(500).send('Error');
  }
});

// ═══════════════════════════════════════════════════════════
//  FILES API (admin token required)
// ═══════════════════════════════════════════════════════════

router.get('/files', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const queryPath = req.query.path || '';
    const queryCategories = req.query.categories ? String(req.query.categories).split(',').filter(Boolean) : [];
    const sortBy = req.query.sort || 'created';

    if (queryPath === 'all') {
      let allFiles = [];
      const categoriesToScan = queryCategories.length > 0 ? queryCategories : CATEGORIES;

      categoriesToScan.forEach(cat => {
        const catDir = path.join(UPLOAD_DIR, cat);
        if (fs.existsSync(catDir)) {
          try {
            const files = fs.readdirSync(catDir, { withFileTypes: true })
              .filter(d => !d.isDirectory())
              .map(dirent => {
                const relPath = `${cat}/${dirent.name}`;
                const fullUrl = `${MEDIA_DOMAIN}/server/data/upload/${relPath}`;
                const thumbUrl = ['pic'].includes(cat)
                  ? `${MEDIA_DOMAIN}/server/data/upload/.thumbs/${relPath}`
                  : undefined;

                const parsed = parseStandardFilename(dirent.name);

                return {
                  name: dirent.name,
                  type: 'file',
                  category: cat,
                  path: relPath,
                  url: fullUrl,
                  thumb: thumbUrl,
                  displayname: parsed ? parsed.displayname : null,
                  created: parsed ? parsed.timestamp : null
                };
              });
            allFiles = allFiles.concat(files);
          } catch (e) {
            console.error(`[Files API] Error reading category ${cat}:`, e);
          }
        }
      });

      if (sortBy === 'created') {
        allFiles.sort((a, b) => {
          const timeA = a.created || 0;
          const timeB = b.created || 0;
          return timeB - timeA;
        });
      } else if (sortBy === 'name') {
        allFiles.sort((a, b) => {
          const nameA = a.displayname || a.name;
          const nameB = b.displayname || b.name;
          return nameA.localeCompare(nameB);
        });
      }

      return res.json(allFiles);
    }

    const targetDir = path.resolve(UPLOAD_DIR, queryPath.replace(/^\/+/, ''));
    if (!targetDir.startsWith(UPLOAD_DIR)) {
      return res.status(403).send('Forbidden');
    }
    if (!fs.existsSync(targetDir)) {
      return res.json([]);
    }

    const items = fs.readdirSync(targetDir, { withFileTypes: true }).map(dirent => {
      const rel = path.relative(UPLOAD_DIR, path.join(targetDir, dirent.name)).replace(/\\/g, '/');
      const isDir = dirent.isDirectory();
      const fullUrl = `${MEDIA_DOMAIN}/server/data/upload/${rel}`;

      let thumbUrl;
      if (!isDir) {
        const ext = path.extname(dirent.name).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff'].includes(ext)) {
          thumbUrl = `${MEDIA_DOMAIN}/server/data/upload/.thumbs/${rel}`;
        }
      }

      const parsed = parseStandardFilename(dirent.name);

      return {
        name: dirent.name,
        type: isDir ? 'directory' : 'file',
        path: rel,
        url: fullUrl,
        thumb: thumbUrl,
        displayname: parsed ? parsed.displayname : null,
        created: parsed ? parsed.timestamp : null
      };
    });

    if (sortBy === 'created') {
      items.sort((a, b) => {
        const timeA = a.created || 0;
        const timeB = b.created || 0;
        return timeB - timeA;
      });
    } else if (sortBy === 'name') {
      items.sort((a, b) => {
        const nameA = a.displayname || a.name;
        const nameB = b.displayname || b.name;
        return nameA.localeCompare(nameB);
      });
    }

    res.json(items);
  } catch (e) {
    console.error('[Files API] Error:', e);
    res.status(500).send('Error listing files');
  }
});

router.post('/folder', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const { folderPath } = req.body;
    if (!folderPath) throw new Error('Missing folderPath');

    const targetPath = path.resolve(UPLOAD_DIR, folderPath.replace(/^\/+/, ''));
    if (!targetPath.startsWith(UPLOAD_DIR)) return res.status(403).send('Forbidden');

    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).send('Error');
  }
});

router.delete('/files', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  const queryPath = req.query.path || '';
  const targetPath = path.resolve(UPLOAD_DIR, queryPath.replace(/^\/+/, ''));
  if (!targetPath.startsWith(UPLOAD_DIR)) return res.status(403).send('Forbidden');

  try {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }

    try {
      const rel = path.relative(UPLOAD_DIR, targetPath).replace(/\\/g, '/');
      const thumbTarget = path.join(UPLOAD_DIR, '.thumbs', rel);
      if (thumbTarget.startsWith(UPLOAD_DIR) && fs.existsSync(thumbTarget)) {
        fs.rmSync(thumbTarget, { recursive: true, force: true });
      }

      // Purge CDN cache for deleted file (best-effort, fire-and-forget)
      const originUrl = `${MEDIA_DOMAIN.replace(/\/$/, '')}/server/data/upload/${rel.replace(/^\/+/, '')}`;
      const thumbUrl = `${MEDIA_DOMAIN.replace(/\/$/, '')}/server/data/upload/.thumbs/${rel.replace(/^\/+/, '')}`;
      spawnCdnPurge([originUrl, thumbUrl]);

    } catch (e) {
      console.error('[Delete] Failed to remove thumbs for', targetPath, e);
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).send('Error');
  }
});

router.post('/upload', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  ensureDevSymlink();

  const filename = req.headers['x-filename'];
  let category = req.headers['x-category'] || '';

  if (!filename) return res.status(400).send('Missing filename');

  const decodedName = decodeURIComponent(filename);
  const ext = path.extname(decodedName).toLowerCase();

  if (!category || !CATEGORIES.includes(category)) {
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff'].includes(ext)) category = 'pic';
    else if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext)) category = 'sound';
    else if (['.mp4', '.webm', '.avi', '.mov', '.mkv', '.wmv'].includes(ext)) category = 'video';
    else if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.rtf'].includes(ext)) category = 'doc';
    else if (['.txt', '.md', '.js', '.ts', '.html', '.css', '.json', '.py', '.java', '.c', '.cpp', '.h', '.vue', '.xml', '.yaml', '.yml', '.ini', '.conf', '.sh', '.bat', '.log', '.csv', '.rs', '.go', '.php', '.rb', '.pl', '.swift', '.kt', '.sql', '.r', '.m', '.make', '.dockerfile'].includes(ext)) category = 'txt';
    else category = 'other';
  }

  const categoryDir = path.join(UPLOAD_DIR, category);
  if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });

  const cleanName = decodedName.replace(/[^a-zA-Z0-9.\-_]/g, '');
  const randomName = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${cleanName}`;
  const filePath = path.join(categoryDir, randomName);

  const writeStream = fs.createWriteStream(filePath);
  req.pipe(writeStream);

  writeStream.on('finish', async () => {
    const webPath = `/server/data/upload/${category}/${randomName}`;
    const fullUrl = `${MEDIA_DOMAIN}${webPath}`;

    let thumbUrl = '';

    try {
      let sharpLib = null;
      try { sharpLib = require('sharp'); } catch (e) { /* sharp not installed */ }

      if (sharpLib && ['pic'].includes(category)) {
        const thumbRel = `/${category}/${randomName}`;
        const thumbBase = path.join(UPLOAD_DIR, '.thumbs');
        const thumbPath = path.join(thumbBase, thumbRel);
        const thumbDir = path.dirname(thumbPath);

        if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

        try {
          await sharpLib(filePath)
            .resize({ width: 200, height: 200, fit: 'inside', withoutEnlargement: true })
            .toFile(thumbPath);
          thumbUrl = `${MEDIA_DOMAIN}/server/data/upload/.thumbs${thumbRel}`;
        } catch (err) {
          console.error('[Upload] Thumb generation failed:', err.message);
        }
      }

      // Pre-warm CDN cache (best-effort, fire-and-forget)
      const warmUrls = [fullUrl];
      if (thumbUrl) warmUrls.push(thumbUrl);
      spawnCdnWarm(warmUrls);

    } catch (e) {
      console.error('[Upload] Post-process error', e);
    }

    res.json({ url: fullUrl, path: webPath, category, thumb: thumbUrl });
  });
  writeStream.on('error', (err) => {
    console.error(err);
    res.status(500).send('Upload failed');
  });
});

// ═══════════════════════════════════════════════════════════
//  SETTINGS API (admin token required)
// ═══════════════════════════════════════════════════════════

router.get('/settings', (req, res) => {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return success(res, {});
    }
    const saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    success(res, saved);
  } catch (e) {
    console.error('[Settings] GET error', e);
    fail(res, 'Failed to read settings');
  }
});

router.post('/settings', async (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const body = req.body || {};
    let saved = {};
    if (fs.existsSync(SETTINGS_FILE)) {
      try { saved = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) } catch (e) { saved = {} }
    }

    saved = Object.assign({}, saved, body);

    // Migrate friends out of settings into friends.json
    if (saved.friendsCards || saved.friendsGlobalStyle) {
      writeFriends({
        cards: saved.friendsCards || [],
        globalStyle: saved.friendsGlobalStyle || null,
      });
      delete saved.friendsCards;
      delete saved.friendsGlobalStyle;
    }

    const frontendBackgroundMeta = parseBackgroundLikeValue(saved.frontendBackgroundMeta);
    const backendBackgroundMeta = parseBackgroundLikeValue(saved.backendBackgroundMeta);

    if (saved.frontendBackground && typeof saved.frontendBackground === 'object') {
      if (!saved.frontendBackground.path && saved.frontendBackground.url) {
        saved.frontendBackground.path = saved.frontendBackground.url.replace(/^\/+/, '').replace(/^server\/data\/(background|branding|manager-background|upload)\//, '');
      }
      if (!saved.frontendBackground.generatedPath && saved.frontendBackground.path) {
        saved.frontendBackground.generatedPath = saved.frontendBackground.path;
      }
      if (!saved.frontendBackground.generatedName && saved.frontendBackground.generatedPath) {
        saved.frontendBackground.generatedName = saved.frontendBackground.generatedPath.split('/').pop() || '';
      }
    }

    if (saved.backendBackground && typeof saved.backendBackground === 'object') {
      if (!saved.backendBackground.path && saved.backendBackground.url) {
        saved.backendBackground.path = saved.backendBackground.url.replace(/^\/+/, '').replace(/^server\/data\/(background|branding|manager-background|upload)\//, '');
      }
      if (!saved.backendBackground.generatedPath && saved.backendBackground.path) {
        saved.backendBackground.generatedPath = saved.backendBackground.path;
      }
      if (!saved.backendBackground.generatedName && saved.backendBackground.generatedPath) {
        saved.backendBackground.generatedName = saved.backendBackground.generatedPath.split('/').pop() || '';
      }
    }

    if (frontendBackgroundMeta && typeof frontendBackgroundMeta === 'object') {
      const compression = await computeBackgroundCompression(frontendBackgroundMeta, saved.frontendBackground, UPLOAD_DIR);
      frontendBackgroundMeta.compressionFactor = compression;
      frontendBackgroundMeta.compression = compression;
      frontendBackgroundMeta.bgCompression = compression;
      saved.frontendBackgroundCompression = compression;
      saved.frontendBackgroundMeta = JSON.stringify(frontendBackgroundMeta);
    }

    if (backendBackgroundMeta && typeof backendBackgroundMeta === 'object') {
      const compression = await computeBackgroundCompression(backendBackgroundMeta, saved.backendBackground, UPLOAD_DIR);
      backendBackgroundMeta.compressionFactor = compression;
      backendBackgroundMeta.compression = compression;
      backendBackgroundMeta.bgCompression = compression;
      saved.backendBackgroundCompression = compression;
      saved.backendBackgroundMeta = JSON.stringify(backendBackgroundMeta);
    }

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(saved, null, 2));
    res.json(saved);
  } catch (e) {
    console.error('[Settings] POST error', e);
    res.status(500).send('Error');
  }
});

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
//  COLLECTIONS API (admin token required)
// ═══════════════════════════════════════════════════════════

router.get('/collections', (req, res) => {
  try {
    const data = collectionService.readAllCollections();
    // Fallback: if multi-file dir is empty but legacy collection.json exists, read it
    if (data.collections.length === 0 && collectionService.hasLegacyCollectionFile()) {
      const legacy = JSON.parse(fs.readFileSync(COLLECTION_FILE, 'utf-8') || '{}') || {};
      return success(res, legacy);
    }
    success(res, data);
  } catch (e) {
    console.error('[Collections] GET error', e);
    fail(res, 'Failed to read collections');
  }
});

router.put('/collections/order', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const body = req.body || {};
    const result = collectionService.updateOrder(body.order || []);
    success(res, result);
  } catch (e) {
    console.error('[Collections] PUT order error', e);
    fail(res, 'Failed to update collection order');
  }
});

router.post('/collections', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const body = req.body || {};
    const collections = Array.isArray(body.collections) ? body.collections : [];
    const oldData = collectionService.readAllCollections();
    const oldCollections = oldData.collections || [];

    // Save to single-file JSON
    collectionService.writeAllCollections({ collections });

    // Update post index with collection assignments (diff old → new)
    try {
      const buildMap = (cols) => {
        const map = Object.create(null);
        if (!Array.isArray(cols)) return map;
        const walk = (nodes, prefix, name) => {
          if (!Array.isArray(nodes)) return;
          nodes.forEach((n, i) => {
            if (!n) return;
            if (n.type === 'post' && n.id) map[n.id] = { collectionName: name || '', nodePath: `${prefix}/${i}` };
            else if (n.type === 'group') walk(n.children || [], `${prefix}/${i}`, name);
          });
        };
        cols.forEach((c, ci) => c && walk(c.nodes || [], `r/${ci}`, c.name || ''));
        return map;
      };

      const oldMap = buildMap(oldCollections);
      const newMap = buildMap(collections);

      let posts = [];
      try { posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]'); } catch (_) { posts = []; }
      const byId = Object.create(null);
      posts.forEach(p => { if (p?.id) byId[p.id] = p; });

      let modified = false;
      for (const id of Object.keys(oldMap)) {
        if (!newMap[id] && byId[id]) { delete byId[id].collection; delete byId[id].collectionPath; modified = true; }
      }
      for (const id of Object.keys(newMap)) {
        const m = newMap[id];
        if (byId[id] && (byId[id].collection !== m.collectionName || byId[id].collectionPath !== m.nodePath)) {
          byId[id].collection = m.collectionName; byId[id].collectionPath = m.nodePath; modified = true;
        }
      }
      if (modified) writeIndexFile(Object.values(byId));
    } catch (err) { console.error('[Collections] Failed to update post index', err); }

    success(res, { collections });
  } catch (e) {
    console.error('[Collections] POST error', e);
    fail(res, 'Failed to save collections');
  }
});

// ═══════════════════════════════════════════════════════════
//  SYSTEM ROUTES (admin token required)
// ═══════════════════════════════════════════════════════════

router.get('/system/storage', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const settings = getBuildSettings();
    const contentPagePath = path.resolve(settings.frontendBuildTargetDir || `/var/www/${settings.frontendUrl || DEFAULT_BUILD_SETTINGS.frontendUrl}`);
    const managerDomain = resolveManagerDomain(settings);
    const managerPagePath = path.resolve(`/var/www/${managerDomain}`);
    const apiSourcePath = resolveApiSourcePath(BASE_DIR);

    const frontendBytes = safeDirectorySize(contentPagePath);
    const backendBytes = safeDirectorySize(managerPagePath);
    const apiSourceBytes = safeDirectorySize(apiSourcePath);
    const uploadBytes = safeDirectorySize(UPLOAD_DIR);
    const apiBytes = Math.max(0, apiSourceBytes - uploadBytes);

    const disk = getDiskStatsByPath(BASE_DIR);
    const serverTotalBytes = Number(disk.totalBytes) || 0;
    const serverAvailableBytes = Number(disk.availableBytes) || 0;
    const serverUsedBytes = Number(disk.usedBytes) || Math.max(0, serverTotalBytes - serverAvailableBytes);
    const knownUsedBytes = frontendBytes + backendBytes + apiBytes + uploadBytes;
    const otherBytes = Math.max(0, serverUsedBytes - knownUsedBytes);

    const segments = [
      { key: 'frontend', label: 'Content Page', bytes: frontendBytes },
      { key: 'backend', label: 'Manager Page', bytes: backendBytes },
      { key: 'api', label: 'API', bytes: apiBytes },
      { key: 'upload', label: 'Upload', bytes: uploadBytes },
      { key: 'other', label: 'Other Used', bytes: otherBytes },
      { key: 'available', label: 'Available', bytes: serverAvailableBytes },
    ].map((item) => ({
      ...item,
      ratio: serverTotalBytes > 0 ? item.bytes / serverTotalBytes : 0,
    }));

    res.json({
      generatedAt: new Date().toISOString(),
      paths: {
        frontendPath: contentPagePath,
        backendPath: managerPagePath,
        apiPath: apiSourcePath,
        uploadPath: fs.realpathSync(UPLOAD_DIR),
      },
      usage: {
        frontendBytes,
        backendBytes,
        apiBytes,
        otherBytes,
        uploadBytes,
      },
      server: {
        totalBytes: serverTotalBytes,
        availableBytes: serverAvailableBytes,
        usedBytes: serverUsedBytes,
      },
      segments,
    });
  } catch (e) {
    console.error('[Storage] GET error', e);
    res.status(500).json({
      generatedAt: new Date().toISOString(),
      paths: {},
      usage: { frontendBytes: 0, backendBytes: 0, apiBytes: 0, otherBytes: 0, uploadBytes: 0 },
      server: { totalBytes: 0, availableBytes: 0, usedBytes: 0 },
      segments: [],
    });
  }
});

// ── Build Routes ──────────────────────────────────────────

router.post('/build/astro', async (req, res) => {
  try {
    if (!requireAdminToken(req, res)) return;

    const activeBuild = getActiveAstroBuild();
    if (activeBuild) {
      const startedAt = activeBuild.startedAt ? new Date(activeBuild.startedAt).toISOString() : '';
      return res.status(409).json({
        success: false,
        message: startedAt
          ? `Build already in progress（buildId=${activeBuild.buildId}, startedAt=${startedAt}）`
          : `Build already in progress（buildId=${activeBuild.buildId}）`,
      });
    }

    console.log('[Build] Starting Astro build with 2min timeout...');

    const settings = getBuildSettings();
    const buildResult = await spawnGenBuild(settings, {
      granularity: req.body && req.body.granularity,
    });

    const responseBody = {
      success: buildResult.status === 'success',
      message: buildResult.message,
      buildId: buildResult.buildId,
      status: buildResult.status,
      error: buildResult.error
    };

    const httpStatus = buildResult.status === 'success'
      ? 200
      : buildResult.status === 'timeout'
        ? 202
        : 500;

    return res.status(httpStatus).json(responseBody);

  } catch (e) {
    console.error('[Build] Astro build initialization failed', e);
    const message = e && e.message ? e.message : 'Build initialization failed';
    const status = e && e.status === 'timeout' ? 202 : 500;
    return res.status(status).json({
      success: false,
      message,
      error: message,
      status: e && e.status ? e.status : 'failed',
      buildId: e && e.buildId ? e.buildId : undefined,
    });
  }
});

router.post('/posts/republish-all', async (req, res) => {
  try {
    if (!requireAdminToken(req, res)) return;

    const activeBuild = getActiveAstroBuild();
    if (activeBuild) {
      const startedAt = activeBuild.startedAt ? new Date(activeBuild.startedAt).toISOString() : '';
      return res.status(409).json({
        success: false,
        message: startedAt
          ? `Build already in progress（buildId=${activeBuild.buildId}, startedAt=${startedAt}）`
          : `Build already in progress（buildId=${activeBuild.buildId}）`,
      });
    }

    let posts = [];
    try {
      posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]');
    } catch (e) {
      posts = [];
    }

    const publishedPosts = posts.filter((post) => post && post.status === 'published');
    const successList = [];
    const failureList = [];
    const skippedList = [];

    for (const post of publishedPosts) {
      try {
        const result = republishPostArtifacts(post);
        if (result.republished) {
          successList.push({ id: post.id, title: post.title });
        } else {
          skippedList.push({ id: post.id, title: post.title, reason: 'missing-content' });
        }
      } catch (error) {
        console.error('[Republish] Failed to republish post', post && post.id, error);
        failureList.push({ id: post.id, title: post.title, reason: 'failed' });
      }
    }

    let buildResult = null;
    const settings = getBuildSettings();
    if (settings && settings.autoBuildOnPublish && publishedPosts.length > 0) {
      console.log('[Republish] Auto-build enabled, triggering one full build after batch republish');
      buildResult = await spawnGenBuild(settings, { granularity: 'full' });
    }

    return res.json({
      success: true,
      totalPublished: publishedPosts.length,
      successCount: successList.length,
      failureCount: failureList.length,
      skippedCount: skippedList.length,
      successList,
      failureList,
      skippedList,
      republishedCount: successList.length,
      republishedPosts: successList,
      skippedPosts: skippedList,
      build: buildResult ? {
        status: buildResult.status,
        message: buildResult.message,
        buildId: buildResult.buildId,
        error: buildResult.error || null,
      } : null,
    });
  } catch (e) {
    console.error('[Republish] Batch republish failed', e);
    return res.status(500).json({
      success: false,
      message: e && e.message ? e.message : 'Batch republish failed',
    });
  }
});

router.post('/clean/build-target', async (req, res) => {
  try {
    if (!requireAdminToken(req, res)) return;

    const { targetDir } = req.body;

    if (!targetDir) {
      return res.status(400).json({ success: false, message: 'Missing target directory' });
    }

    console.log('[Clean] Cleaning build target directory:', targetDir);

    const resolvedTargetDir = path.resolve(targetDir);
    if (!resolvedTargetDir.startsWith('/var/www/')) {
      return res.status(403).json({ success: false, message: 'Invalid target directory path' });
    }

    if (!fs.existsSync(resolvedTargetDir)) {
      return res.status(404).json({ success: false, message: 'Target directory does not exist' });
    }

    const files = fs.readdirSync(resolvedTargetDir);
    let cleanedCount = 0;

    for (const file of files) {
      const filePath = path.join(resolvedTargetDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filePath);
      }
      cleanedCount++;
    }

    console.log(`[Clean] Cleaned ${cleanedCount} items from ${resolvedTargetDir}`);

    res.json({
      success: true,
      message: `Cleaned ${cleanedCount} items from build target directory`,
      cleanedCount: cleanedCount
    });

  } catch (e) {
    console.error('[Clean] Clean operation failed', e);
    res.status(500).json({ success: false, message: e.message || 'Clean operation failed' });
  }
});

// ═══════════════════════════════════════════════════════════
//  BACKGROUND COMPRESSION (admin token required)
// ═══════════════════════════════════════════════════════════

router.post('/background/compress', async (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const body = req.body || {};
    const scope = body.scope === 'backend' ? 'backend' : 'frontend';

    // frontend → data/branding/, backend → data/manager-background/
    const targetDir = scope === 'backend' ? MANAGER_BACKGROUND_DIR : BRANDING_DIR;

    const result = await compressBackground({
      scope,
      meta: body.meta || body.backgroundMeta || (scope === 'backend' ? body.backendBackgroundMeta : body.frontendBackgroundMeta),
      background: body.background || body.backgroundPayload || (scope === 'backend' ? body.backendBackground : body.frontendBackground),
      uploadDir: UPLOAD_DIR,
      brandingDir: targetDir,
      mediaDomain: process.env.MEDIA_DOMAIN || '',
    });

    if (result.skipped) {
      return res.json({ success: true, skipped: true, message: result.message, meta: result.meta, background: result.background });
    }
    res.json(result);
  } catch (e) {
    console.error('[Background] Compression error', e);
    res.status(500).json({ success: false, message: e.message || 'Compression failed' });
  }
});

// ═══════════════════════════════════════════════════════════
//  POST MANAGEMENT ROUTES (admin token required)
// ═══════════════════════════════════════════════════════════

router.post('/restore', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  const { id } = req.query;
  if (!id) return res.status(400).send('Missing ID');
  try {
    const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
    const posts = JSON.parse(indexContent || '[]');
    const post = posts.find(p => p.id === id);

    if (post && post.status === 'modifying') {
      const dir = getPostDir(post);
      const draftPath = path.join(dir, `${id}-draft.md`);
      if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath);
      if (post.draftFilename) delete post.draftFilename;
      post.status = 'published';
      writeIndexFile(posts);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).send('Error');
  }
});

// ═══════════════════════════════════════════════════════════
//  POST API (admin token required)
// ═══════════════════════════════════════════════════════════

// ── GET /posts (CMS article list, includes drafts) ─────
router.get('/posts', (req, res) => {
  try {
    const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
    let posts = JSON.parse(indexContent || '[]');

    const includeDrafts = req.query.includeDrafts === 'true';
    if (!includeDrafts) {
      posts = posts.filter(p => p.status === 'published' || p.status === 'modifying' || !p.status);
    }

    const featuredOnly = req.query.featured === 'true';
    if (featuredOnly) {
      posts = posts.filter(p =>
        Array.isArray(p.tags) && p.tags.some(t => String(t) === 'featured' || String(t) === '精选')
      );
    }

    // Augment with hasHtml flag — post has content available for rendering
    posts = posts.map(p => {
      const refreshed = postService.refreshPostMetadataFromDisk(p);
      if (!refreshed.dir) refreshed.dir = refreshed.filename ? refreshed.filename.replace(/\.md$/, '') : refreshed.id;
      return { ...refreshed, hasHtml: true };
    });

    posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const page = Number.parseInt(req.query.page, 10);
    const perPage = Number.parseInt(req.query.perPage, 10);
    const hasPagination = Number.isFinite(page) && Number.isFinite(perPage) && perPage > 0;

    if (hasPagination) {
      const p = page > 0 ? page : 1;
      const total = posts.length;
      const totalPages = total > 0 ? Math.ceil(total / perPage) : 0;
      if (p > totalPages || total === 0) {
        return success(res, { posts: [], total, page: p, perPage, totalPages });
      }
      const start = (p - 1) * perPage;
      return success(res, {
        posts: posts.slice(start, start + perPage).map(p => postService.normalizePostForResponse(p)),
        total, page: p, perPage, totalPages
      });
    }

    success(res, posts.map(p => postService.normalizePostForResponse(p)));
  } catch (e) {
    fail(res, 'Failed to load posts');
  }
});

// ── GET /post (CMS read single article, supports mode=edit) ──
router.get('/post', (req, res) => {
  const { id, mode } = req.query;
  if (!id) return fail(res, 'Missing ID', 400);

  try {
    const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
    const posts = JSON.parse(indexContent || '[]');
    const post = postService.refreshPostMetadataFromDisk(posts.find(p => p.id === id));

    if (!post) return fail(res, 'Post not found', 404);

    const content = postService.readPostContentFromDisk(post);
    // hasHtml indicates the post has content available for rendering
    // (markdown rendering happens in template-astro or CMS editor, not in host)
    const hasHtml = !!(content && content.length > 0);

    // mode=edit: prefer draft content for editing
    if (mode === 'edit') {
      const dir = postService.getPostDir(post);
      const draftPath = path.join(dir, `${post.id}-draft.md`);
      if (fs.existsSync(draftPath)) {
        let raw = fs.readFileSync(draftPath, 'utf-8');
        try { raw = decrypt(raw); } catch (e) { /* not encrypted */ }
        const { body } = postService.parseFrontMatter(raw);
        return success(res, { ...postService.normalizePostForResponse(post), content: body, hasHtml, toc: [] });
      }
    }

    success(res, { ...postService.normalizePostForResponse(post), content, hasHtml, toc: [] });
  } catch (e) {
    fail(res, 'Failed to load post');
  }
});

router.post('/post', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const data = req.body;

    if (!data.id) {
      return res.status(400).json({ success: false, message: 'ID required' });
    }

    if (typeof data.id !== 'string' || !/^[a-zA-Z0-9\-]{6,}$/.test(data.id)) {
      return res.status(400).json({ success: false, message: 'Invalid id format' });
    }

    if (!data.title) {
      return res.status(400).json({ success: false, message: 'Missing title' });
    }

    const newPost = data.newPost === true;

    let posts = [];
    try { posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]'); } catch (e) {}

    let post;
    const now = new Date().toISOString();
    const content = data.content;
    const status = data.status;
    let wasPublished = false;

    const existingPost = posts.find(p => p.id === data.id);

    if (newPost) {
      if (existingPost) {
        return res.status(400).json({ success: false, message: 'ID already exists' });
      }
      const filename = `${data.id}.md`;
      post = {
        id: data.id,
        title: data.title,
        date: now,
        updatedAt: now,
        filename,
        dir: data.id,
        summary: (content || '').slice(0, 200).replace(/[#*`\[\]]/g, ''),
        tags: sortTags(data.tags || []),
        font: data.font || 'sans',
        author: String(data.author || '').trim(),
        aiGenerated: !!data.aiGenerated,
        status: status || 'draft'
      };
      posts.push(post);
    } else {
      if (existingPost) {
        post = existingPost;
        wasPublished = post.status === 'published';
        post.title = data.title || post.title;
        if (data.author !== undefined) post.author = String(data.author || '').trim();
        if (data.aiGenerated !== undefined) post.aiGenerated = !!data.aiGenerated;
        if (content !== undefined) {
          post.summary = content.slice(0, 200).replace(/[#*`\[\]]/g, '');
        }
        if (status === 'modifying') {
          post.status = 'modifying';
        } else if (status === 'published') {
          const dir = getPostDir(post);
          const draftPath = path.join(dir, `${post.id}-draft.md`);
          if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath);
          post.status = 'published';
        } else if (status) {
          post.status = status;
        }
        if (data.tags) post.tags = sortTags(data.tags || []);
        if (data.font) post.font = data.font;
        post.updatedAt = now;
        if (!post.dir) post.dir = post.id;
      } else {
        const filename = `${data.id}.md`;
        post = {
          id: data.id,
          title: data.title,
          date: now,
          updatedAt: now,
          filename,
          dir: data.id,
          summary: (content || '').slice(0, 200).replace(/[#*`\[\]]/g, ''),
          tags: sortTags(data.tags || []),
          font: data.font || 'sans',
          author: String(data.author || '').trim(),
          aiGenerated: !!data.aiGenerated,
          status: status || 'draft'
        };
        posts.push(post);
      }
    }

    if (content !== undefined) {
      try {
        if (post.status === 'modifying') {
          writePostContentToDisk(post, content || '', { draft: true });
        } else {
          writePostContentToDisk(post, content || '', { draft: false });
        }
      } catch (e) {
        console.error('[Post] Failed to write content to disk', e);
      }
    } else {
      const dir = getPostDir(post);
      const candidate1 = path.join(dir, `${post.id}-content.md`);
      const candidate2 = path.join(dir, `${post.id}-draft.md`);
      const existingPath = fs.existsSync(candidate1) ? candidate1 : (fs.existsSync(candidate2) ? candidate2 : (post.filename ? path.join(POSTS_DIR, post.filename) : null));
      if (existingPath && fs.existsSync(existingPath)) {
        try {
          const raw = fs.readFileSync(existingPath, 'utf-8');
          let currentContent = raw;
          try { currentContent = decrypt(raw); } catch (e) {}
          const { body } = parseFrontMatter(currentContent);
          const newContent = stringifyFrontMatter({
            title: post.title,
            date: post.date,
            updatedAt: post.updatedAt,
            tags: post.tags || [],
            font: post.font || 'sans',
            author: post.author || '',
            aiGenerated: !!post.aiGenerated,
          }, body);
          const shouldEncrypt = post.status === 'draft';
          fs.writeFileSync(existingPath, shouldEncrypt ? encrypt(newContent) : newContent);
        } catch (e) { console.error('Failed to update file metadata', e); }
      }
    }

    // Markdown rendering is done at build time (template-astro) or in CMS editor.
    // Host does not persist compiled HTML or TOC — it only stores *-content.md.

    writeIndexFile(posts);
    success(res, { id: post.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Error' });
  }
});

router.delete('/post', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  const { id } = req.query;
  if (!id) return fail(res, 'ID required', 400);

  try {
    let posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]');
    const post = posts.find(p => p.id === id);
    if (post) {
      const dir = getPostDir(post);
      if (fs.existsSync(dir)) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { console.error('[Delete] remove dir failed', e); }
      } else if (post.filename) {
        const mdPath = path.join(POSTS_DIR, post.filename);
        if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
      }
      posts = posts.filter(p => p.id !== id);
      writeIndexFile(posts);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).send('Error');
  }
});

router.post('/post/allocate-id', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    let posts = [];
    try { posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]'); } catch (e) {}
    const existingIds = new Set(posts.map(p => p.id));
    let id;
    let tryCount = 0;
    do {
      id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      tryCount++;
    } while (existingIds.has(id) && tryCount < 10);
    if (existingIds.has(id)) {
      return res.status(500).json({ success: false, message: 'Failed to allocate unique id' });
    }
    res.json({ success: true, id });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message || 'Failed to allocate id' });
  }
});

router.post('/post/validate-id', (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9\-]{6,}$/.test(id)) {
      return res.json({ success: false, valid: false, reason: 'invalid-format' });
    }
    let posts = [];
    try { posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]'); } catch (e) {}
    const exists = posts.some(p => p.id === id);
    if (exists) {
      return res.json({ success: true, valid: false, reason: 'conflict' });
    }
    return res.json({ success: true, valid: true });
  } catch (e) {
    res.status(500).json({ success: false, valid: false, reason: 'error', message: e.message || 'validate failed' });
  }
});

router.post('/scan', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    let posts = [];
    try { posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]'); } catch (e) {}
    const entries = fs.readdirSync(POSTS_DIR, { withFileTypes: true });
    const dirPosts = [];
    const legacyFiles = [];
    entries.forEach(e => {
      if (e.isDirectory()) {
        dirPosts.push(e.name);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        legacyFiles.push(e.name);
      }
    });

    const originalCount = posts.length;

    posts = posts.filter(p => {
      const dirName = p.dir || (p.filename ? p.filename.replace(/\.md$/, '') : p.id);
      return dirPosts.includes(dirName) || legacyFiles.includes(p.filename);
    });

    const indexedFiles = new Set(posts.map(p => p.filename).filter(Boolean));
    const orphans = legacyFiles.filter(f => !indexedFiles.has(f));

    let recoveredCount = 0;
    orphans.forEach(filename => {
      try {
        const raw = fs.readFileSync(path.join(POSTS_DIR, filename), 'utf-8');
        let content = raw;
        try { content = decrypt(raw); } catch (e) {}
        const stats = fs.statSync(path.join(POSTS_DIR, filename));
        const id = filename.replace('.md', '');

        posts.push({
          id,
          title: `Recovered: ${id}`,
          date: stats.birthtime || new Date(),
          filename,
          dir: id,
          summary: content.slice(0, 100).replace(/[#*`\[\]]/g, ''),
          tags: ['recovered'],
          status: 'draft'
        });
        recoveredCount++;
      } catch (e) {}
    });

    if (posts.length !== originalCount || recoveredCount > 0) {
      writeIndexFile(posts);
    }

    res.json({
      success: true,
      removed: originalCount - posts.length + recoveredCount,
      recovered: recoveredCount
    });
  } catch (e) {
    res.status(500).send('Scan failed');
  }
});

// ═══════════════════════════════════════════════════════════
//  FRIENDS API
// ═══════════════════════════════════════════════════════════

const FRIENDS_FILE = config.FRIENDS_FILE;

function readFriends() {
  if (fs.existsSync(FRIENDS_FILE)) {
    try { return JSON.parse(fs.readFileSync(FRIENDS_FILE, 'utf-8')); } catch (e) {}
  }
  // Backward compat: read from settings.json and migrate
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (settings.friendsCards || settings.friendsGlobalStyle) {
        const friends = {
          cards: settings.friendsCards || [],
          globalStyle: settings.friendsGlobalStyle || null,
        };
        // Migrate on read
        fs.writeFileSync(FRIENDS_FILE, JSON.stringify(friends, null, 2), 'utf-8');
        // Don't delete from settings (non-destructive)
        return friends;
      }
    } catch (e) {}
  }
  return { cards: [], globalStyle: null };
}

function writeFriends(friends) {
  fs.writeFileSync(FRIENDS_FILE, JSON.stringify(friends, null, 2), 'utf-8');
  // Also strip from settings.json for clean separation
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      if (settings.friendsCards || settings.friendsGlobalStyle) {
        delete settings.friendsCards;
        delete settings.friendsGlobalStyle;
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
      }
    } catch (e) {}
  }
}

router.get('/friends', (req, res) => {
  try { success(res, readFriends()); } catch (e) { fail(res, 'Failed to read friends'); }
});

router.post('/friends', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const body = req.body || {};
    writeFriends(body);
    success(res, readFriends());
  } catch (e) { fail(res, 'Failed to save friends'); }
});

// ═══════════════════════════════════════════════════════════
//  PROFILE API
// ═══════════════════════════════════════════════════════════

function readProfile() {
  if (fs.existsSync(PROFILE_FILE)) {
    try { return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8')); } catch {}
  }
  return { name: '', avatar: '', bio: '', location: '', links: [] };
}

router.get('/profile', (req, res) => {
  try { success(res, readProfile()); } catch (e) { fail(res, 'Failed to read profile'); }
});

router.post('/profile', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const body = req.body || {};
    // Merge with existing rather than overwrite
    const existing = readProfile();
    const merged = { ...existing, ...body };
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    success(res, merged);
  } catch (e) { fail(res, 'Failed to save profile'); }
});

// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// Schema endpoints
// ═══════════════════════════════════════════════════════════

// GET /api/admin/schemas — aggregate schemas from packages + template directory.
// Schemas carry inline locale objects (Payload-style); the frontend resolves
// them to the current user language via resolveLocale().
router.get('/schemas', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const schemas = {};

    // 1. Baseline: scan local packages/*/schemas/
    const packagesDir = path.resolve(BASE_DIR, '..');
    for (const pkg of fs.readdirSync(packagesDir)) {
      const schemaDir = path.join(packagesDir, pkg, 'schemas');
      if (!fs.existsSync(schemaDir)) continue;
      for (const file of fs.readdirSync(schemaDir)) {
        if (!file.endsWith('.schema.json')) continue;
        try {
          const raw = fs.readFileSync(path.join(schemaDir, file), 'utf-8');
          const schema = JSON.parse(raw);
          if (schema.$id) schemas[schema.$id] = schema;
        } catch (_) {}
      }
    }

    // 2. Override from template directory schemas/
    let settings = {};
    if (fs.existsSync(SETTINGS_FILE)) {
      try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch (_) {}
    }
    const codeDir = settings.frontendCodeDir || DEFAULT_BUILD_SETTINGS.frontendCodeDir;
    const templateSchemaDir = path.join(codeDir, 'schemas');
    if (fs.existsSync(templateSchemaDir)) {
      for (const file of fs.readdirSync(templateSchemaDir)) {
        if (!file.endsWith('.schema.json')) continue;
        try {
          const raw = fs.readFileSync(path.join(templateSchemaDir, file), 'utf-8');
          const schema = JSON.parse(raw);
          if (schema.$id) schemas[schema.$id] = schema;
        } catch (_) {}
      }
    }

    success(res, schemas);
  } catch (e) {
    fail(res, 'Failed to aggregate schemas');
  }
});

// GET /api/admin/template/info — read template package.json from configured frontendCodeDir
router.get('/template/info', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    let settings = {};
    if (fs.existsSync(SETTINGS_FILE)) {
      try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch (_) {}
    }
    const codeDir = settings.frontendCodeDir || DEFAULT_BUILD_SETTINGS.frontendCodeDir;
    const pkgPath = path.join(codeDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return success(res, { directory: codeDir, name: null, version: null, author: null, architecture: null });
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    // Detect architecture from key framework dependencies
    let architecture = null;
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps.astro) { architecture = `astro@${deps.astro.replace(/^[\^~]/, '')}`; }
    else if (deps.next) { architecture = `next@${deps.next.replace(/^[\^~]/, '')}`; }
    else if (deps.nuxt) { architecture = `nuxt@${deps.nuxt.replace(/^[\^~]/, '')}`; }
    success(res, {
      directory: codeDir,
      name: pkg.name || null,
      version: pkg.version || null,
      author: pkg.author || null,
      architecture,
    });
  } catch (e) {
    fail(res, 'Failed to read template info');
  }
});

// GET /api/admin/schema/locale?langs=en,zh-CN — merge locale packs from src, schemas, and template
router.get('/schema/locale', requireAdminToken, (req, res) => {
  try {
    const langs = (req.query.langs || 'en').split(',').map((s) => s.trim()).filter(Boolean);
    const merged = {};
    const packagesDir = path.resolve(BASE_DIR, '..');

    for (const lang of langs) {
      merged[lang] = {};
      for (const pkg of fs.readdirSync(packagesDir)) {
        // 1. App-level locales (manager UI strings, etc.)
        const srcFile = path.join(packagesDir, pkg, 'src', 'locales', `${lang}.json`);
        if (fs.existsSync(srcFile)) {
          try { Object.assign(merged[lang], JSON.parse(fs.readFileSync(srcFile, 'utf-8'))); } catch (_) {}
        }
        // 2. Package-level locales
        const topFile = path.join(packagesDir, pkg, 'locales', `${lang}.json`);
        if (fs.existsSync(topFile)) {
          try { Object.assign(merged[lang], JSON.parse(fs.readFileSync(topFile, 'utf-8'))); } catch (_) {}
        }
        // 3. Schema-bundled locales (schemas/locales/{lang}.json)
        const schemaLocaleFile = path.join(packagesDir, pkg, 'schemas', 'locales', `${lang}.json`);
        if (fs.existsSync(schemaLocaleFile)) {
          try { Object.assign(merged[lang], JSON.parse(fs.readFileSync(schemaLocaleFile, 'utf-8'))); } catch (_) {}
        }
      }

      // 4. Template directory schema locales ({frontendCodeDir}/schemas/locales/{lang}.json)
      let settings = {};
      if (fs.existsSync(SETTINGS_FILE)) {
        try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch (_) {}
      }
      const codeDir = settings.frontendCodeDir || DEFAULT_BUILD_SETTINGS.frontendCodeDir;
      const templateLocaleFile = path.join(codeDir, 'schemas', 'locales', `${lang}.json`);
      if (fs.existsSync(templateLocaleFile)) {
        try { Object.assign(merged[lang], JSON.parse(fs.readFileSync(templateLocaleFile, 'utf-8'))); } catch (_) {}
      }
    }
    success(res, merged);
  } catch (e) {
    fail(res, 'Failed to load locales');
  }
});

module.exports = router;

/**
 * Chronicle Host — Auth Middleware
 *
 * Token validation, passkey helpers, and admin auth middleware.
 */

const fs = require('fs');
const crypto = require('crypto');
const { SECURITY_FILE, SETTINGS_FILE } = require('../config');

// ── Crypto Constants ────────────────────────────────────
const ALGORITHM = 'aes-256-cbc';

// CHRONICLE_ENCRYPTION_KEY: set in production to rotate away from the
// default hardcoded key. Changing this key makes existing encrypted posts
// unreadable — only set it on first install or after re-encrypting all posts.
const SECRET_KEY = process.env.CHRONICLE_ENCRYPTION_KEY
  ? crypto.scryptSync(process.env.CHRONICLE_ENCRYPTION_KEY, 'chronicle-iv', 32)
  : crypto.scryptSync('chronicle-secret-key-123', 'salt', 32);

// ── PoW Challenge Store (in-memory, cleared on restart) ──
const POW_WINDOW = 10 * 60 * 1000; // 10 min reset window
const powChallenges = new Map();    // nonce → { difficulty, expiry }
const ipAttempts = new Map();       // IP → fail count

function getDifficulty(ip) {
  const n = ipAttempts.get(ip) || 0;
  if (n < 3) {
    // First 3 attempts: ~instant (8-12 bits, ~256-4096 hashes)
    return 8 + n * 2;
  }
  if (n < 10) {
    // Attempts 3-9: few ms (10 + n*1.5 bits)
    return 10 + n * 1.5;
  }
  // Attempt 10+: double each time
  return 25 * Math.pow(2, n - 10);
}

function createChallenge(ip) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const difficulty = getDifficulty(ip);
  powChallenges.set(nonce, { difficulty, ip, createdAt: Date.now() });
  return { nonce, difficulty };
}

function verifyPoW(nonce, solution) {
  const challenge = powChallenges.get(nonce);
  if (!challenge) return false;
  powChallenges.delete(nonce);
  if (Date.now() - challenge.createdAt > POW_WINDOW) return false;
  const hash = crypto.createHash('sha256')
    .update(nonce + ':' + solution)
    .digest('hex');
  const leadingZeros = hash.match(/^0*/)[0].length * 4;
  // Count leading zero bits (SHA-256 hex = 4 bits per char)
  let bits = 0;
  for (const ch of hash) {
    const n = parseInt(ch, 16);
    if (n === 0) { bits += 4; continue; }
    if (n < 2) { bits += 3; break; }
    if (n < 4) { bits += 2; break; }
    if (n < 8) { bits += 1; break; }
    break;
  }
  return bits >= challenge.difficulty;
}

function recordFailedAttempt(ip) {
  const n = (ipAttempts.get(ip) || 0) + 1;
  ipAttempts.set(ip, n);
  // Auto-cleanup: clear after window
  setTimeout(() => { if (ipAttempts.get(ip) === n) ipAttempts.delete(ip); }, POW_WINDOW);
}

function clearFailedAttempts(ip) {
  ipAttempts.delete(ip);
}

// Periodic cleanup of expired challenges
setInterval(() => {
  const now = Date.now();
  for (const [nonce, ch] of powChallenges) {
    if (now - ch.createdAt > POW_WINDOW) powChallenges.delete(nonce);
  }
}, 60000);

// ── Session Store (in-memory, cleared on restart) ────────
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_SESSIONS = 10;
const sessions = new Map();

function createSession() {
  if (sessions.size >= MAX_SESSIONS) {
    // Drop the oldest session
    const oldest = sessions.keys().next().value;
    sessions.delete(oldest);
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

function validateSession(token) {
  if (!token || typeof token !== 'string') return false;
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function destroySession(token) {
  return sessions.delete(token);
}

// ── Password Hashing ────────────────────────────────────

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const [ivHex, encryptedText] = text.split(':');
  if (!ivHex || !encryptedText) return '';
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function hashPassword(pwd) {
    let salt = 'chronicle-salt';
    try {
        if (fs.existsSync(SECURITY_FILE)) {
            const sec = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
            salt = sec.hashSalt || salt;
        }
    } catch {}
    return crypto.scryptSync(pwd, salt, 64).toString('hex');
}

/**
 * Constant-time password verification.  Replaces the old `===` comparison
 * which was vulnerable to timing attacks.
 */
function verifyPassword(plaintext, storedHash) {
    const attempt = hashPassword(plaintext);
    const a = Buffer.from(attempt, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

// ── Token Normalization ─────────────────────────────────

function normalizeAdminToken(input) {
    if (!input) return '';

    // New format: plain hex token string
    if (typeof input === 'string') {
        const raw = input.trim();
        if (!raw) return '';

        // Legacy JSON wrapper: {"token":"...","expiry":...}
        if (raw.startsWith('{') && raw.endsWith('}')) {
            try {
                const parsed = JSON.parse(raw);
                return typeof parsed.token === 'string' ? parsed.token.trim() : '';
            } catch (e) { /* fall through */ }
        }

        // Plain token (new format), or legacy literal ('session-valid', 'active')
        return raw;
    }

    // Object (already parsed by body parser or framework)
    if (typeof input === 'object' && input !== null && typeof input.token === 'string') {
        return input.token.trim();
    }

    return '';
}

// ── Auth Middleware ─────────────────────────────────────

function requireAdminToken(req, res) {
    const rawToken = normalizeAdminToken(
        req.headers['x-chronicle-auth'] || req.body?.token
    );

    if (!rawToken) {
        res.status(401).json({ code: 401, data: null, message: 'Unauthorized' });
        return false;
    }

    // Validate random session token (new) or legacy literal token (old)
    if (validateSession(rawToken)) return true;

    // Legacy fallback: accept 'session-valid' / 'active' for one release cycle
    if (rawToken === 'session-valid' || rawToken === 'active') return true;

    res.status(401).json({ code: 401, data: null, message: 'Unauthorized' });
    return false;
}

module.exports = {
    encrypt,
    decrypt,
    hashPassword,
    verifyPassword,
    normalizeAdminToken,
    requireAdminToken,
    createSession,
    destroySession,
    createChallenge,
    verifyPoW,
    recordFailedAttempt,
    clearFailedAttempts,
    getDifficulty,
};

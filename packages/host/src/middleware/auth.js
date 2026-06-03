/**
 * Chronicle Host — Auth Middleware
 *
 * Token validation, passkey helpers, and admin auth middleware.
 * Extracted from the original monolithic index.js — behavior preserved exactly.
 */

const fs = require('fs');
const crypto = require('crypto');
const { SECURITY_FILE, SETTINGS_FILE } = require('../config');

// ── Crypto Constants ────────────────────────────────────
const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = crypto.scryptSync('chronicle-secret-key-123', 'salt', 32);

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
    return crypto.scryptSync(pwd, 'chronicle-salt', 64).toString('hex');
}

// ── Token Normalization ─────────────────────────────────

function normalizeAdminToken(input) {
    if (!input) return { token: '' };

    if (typeof input === 'object') {
        return {
            token: typeof input.token === 'string' ? input.token : '',
            expiry: Number(input.expiry || 0) || 0,
        };
    }

    const raw = String(input).trim();
    if (!raw) return { token: '' };

    if (raw.startsWith('{') && raw.endsWith('}')) {
        try {
            const parsed = JSON.parse(raw);
            return normalizeAdminToken(parsed);
        } catch (e) {
            // fall through to legacy string token handling
        }
    }

    return { token: raw };
}

// ── Auth Middleware ─────────────────────────────────────

function requireAdminToken(req, res) {
    const headerToken = normalizeAdminToken(req.headers['x-chronicle-auth']);
    const bodyToken = normalizeAdminToken(req.body?.token);
    const tokenPayload = headerToken.token ? headerToken : bodyToken;
    const token = tokenPayload.token || '';
    const expiry = tokenPayload.expiry || 0;

    if (expiry && Number.isFinite(expiry) && Date.now() > expiry) {
        res.status(401).json({ code: 401, data: null, message: 'Unauthorized' });
        return false;
    }

    if (!token || (token !== 'session-valid' && token !== 'active')) {
        res.status(401).json({ code: 401, data: null, message: 'Unauthorized' });
        return false;
    }
    return true;
}

module.exports = {
    encrypt,
    decrypt,
    hashPassword,
    normalizeAdminToken,
    requireAdminToken
};

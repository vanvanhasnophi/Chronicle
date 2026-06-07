/**
 * Chronicle Host — Auth Lifecycle Service
 *
 * Handles the complete authentication lifecycle:
 *   - Phase detection (setup / login / recover)
 *   - Setup token generation & validation
 *   - Password creation with recovery codes
 *   - Recovery code verification & password reset
 *
 * Security:
 *   - Passwords: scrypt with per-installation random salt (hashVersion 1).
 *     Legacy passwords (hashVersion 0, hardcoded salt) are upgraded silently on
 *     successful login.
 *   - Recovery codes & setup tokens: SHA-512 (one-time use, short-lived).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SECURITY_FILE } = require('../config');

// ── Constants ──────────────────────────────────────────
const RECOVERY_CODE_COUNT = 10;
const SETUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RECOVERY_LOCK_MINUTES = 60;
const MAX_RECOVERY_ATTEMPTS = 10;
const LEGACY_SALT = 'chronicle-salt'; // Only used to verify/upgrade old hashes

// ── Helpers ────────────────────────────────────────────

function readSecurity() {
  if (!fs.existsSync(SECURITY_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8')); }
  catch { return {}; }
}

function writeSecurity(data) {
  const dir = path.dirname(SECURITY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SECURITY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

// ── Password Hashing ───────────────────────────────────

function hashPassword(password, salt) {
  // scrypt: N=16384, r=8, p=1, keylen=64
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function getOrCreateSalt(sec) {
  if (!sec.hashSalt) {
    sec.hashSalt = randomHex(32);
    sec.hashVersion = 1;
  }
  return sec.hashSalt;
}

/**
 * Verify password against stored hash.
 * Salt is always read from security.json hashSalt field.
 * For legacy (v0) installs hashSalt is 'chronicle-salt'.
 * On password reset, hashSalt is replaced with a random per-installation salt.
 */
function verifyPassword(rawPassword) {
  const sec = readSecurity();
  if (!sec.passwordHash) return false;

  const salt = sec.hashSalt || LEGACY_SALT;
  return hashPassword(rawPassword, salt) === sec.passwordHash;
}

// ── One-time tokens (SHA-512 — fine for short-lived single-use) ──

function sha512(input) {
  return crypto.createHash('sha512').update(input).digest('hex');
}

function generateRecoveryCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  const bytes = crypto.randomBytes(12);
  let code = '';
  for (let i = 0; i < 12; i++) code += chars[bytes[i] % chars.length];
  return code.slice(0, 4) + '-' + code.slice(4, 8) + '-' + code.slice(8, 12);
}

function generateRecoveryCodes(count) {
  return Array.from({ length: count }, generateRecoveryCode);
}

// ── Phase Detection ─────────────────────────────────────

function getAuthPhase() {
  const sec = readSecurity();
  if (sec.setupComplete && sec.passwordHash) return 'login';

  if (sec.setupToken && !sec.passwordHash) {
    if (sec.setupTokenExpiry && Date.now() > new Date(sec.setupTokenExpiry).getTime()) {
      return 'setup'; // expired
    }
    return 'token';
  }

  if (!sec.passwordHash) return 'setup';

  // Backward compat: has password but setupComplete not marked
  if (sec.passwordHash && !sec.setupComplete) {
    sec.setupComplete = true;
    writeSecurity(sec);
    return 'login';
  }

  return 'login';
}

// ── Setup Token ─────────────────────────────────────────

function generateSetupToken() {
  const sec = readSecurity();
  const rawToken = generateRecoveryCode() + '-' + generateRecoveryCode().slice(0, 4);
  sec.setupToken = sha512(rawToken);
  sec.setupTokenExpiry = new Date(Date.now() + SETUP_TOKEN_TTL_MS).toISOString();
  sec.setupComplete = false;
  writeSecurity(sec);
  return rawToken;
}

function verifySetupToken(rawToken) {
  const sec = readSecurity();
  if (!sec.setupToken || !sec.setupTokenExpiry) return false;
  if (Date.now() > new Date(sec.setupTokenExpiry).getTime()) {
    delete sec.setupToken;
    delete sec.setupTokenExpiry;
    writeSecurity(sec);
    return false;
  }
  return sha512(rawToken) === sec.setupToken;
}

// ── Password Setup ──────────────────────────────────────

function setupPassword(rawPassword, rawToken) {
  const sec = readSecurity();
  if (sec.setupToken) {
    if (!rawToken || !verifySetupToken(rawToken)) return { error: 'auth.setup.invalidToken' };
  }
  if (!rawPassword || rawPassword.length < 8) return { error: 'auth.setup.tooShort' };

  const salt = getOrCreateSalt(sec);
  const plainCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);

  sec.passwordHash = hashPassword(rawPassword, salt);
  sec.recoveryCodes = plainCodes.map(sha512);
  sec.setupComplete = true;
  delete sec.setupToken;
  delete sec.setupTokenExpiry;
  delete sec.recoveryLockUntil;
  writeSecurity(sec);

  return { success: true, recoveryCodes: plainCodes };
}

// ── Recovery ────────────────────────────────────────────

function checkRecoveryLock(sec) {
  if (sec.recoveryLockUntil) {
    const lockTime = new Date(sec.recoveryLockUntil).getTime();
    if (Date.now() < lockTime) {
      return { locked: true, remainingMinutes: Math.ceil((lockTime - Date.now()) / 60000) };
    }
    delete sec.recoveryLockUntil;
    writeSecurity(sec);
  }
  return { locked: false };
}

function verifyRecoveryCode(rawCode) {
  const sec = readSecurity();
  const lockCheck = checkRecoveryLock(sec);
  if (lockCheck.locked) return { error: 'auth.recover.locked', remainingMinutes: lockCheck.remainingMinutes };

  const hashedInput = sha512(rawCode);
  const idx = (sec.recoveryCodes || []).indexOf(hashedInput);
  if (idx === -1) return { error: 'auth.recover.invalid' };

  sec.recoveryCodes.splice(idx, 1);
  writeSecurity(sec);
  return { success: true, remaining: sec.recoveryCodes.length };
}

function resetPassword(rawPassword) {
  const sec = readSecurity();
  if (!rawPassword || rawPassword.length < 8) return { error: 'auth.setup.tooShort' };

  const salt = randomHex(32);
  sec.hashSalt = salt;
  sec.hashVersion = 1;
  sec.passwordHash = hashPassword(rawPassword, salt);
  delete sec.recoveryLockUntil;
  writeSecurity(sec);

  return { success: true };
}

// ── CLI Bypass ──────────────────────────────────────────

function cliSetup(rawPassword) {
  const sec = readSecurity();
  const salt = randomHex(32);
  sec.hashSalt = salt;
  sec.hashVersion = 1;
  const plainCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);

  sec.passwordHash = hashPassword(rawPassword, salt);
  sec.recoveryCodes = plainCodes.map(sha512);
  sec.setupComplete = true;
  delete sec.setupToken;
  delete sec.setupTokenExpiry;
  delete sec.recoveryLockUntil;
  writeSecurity(sec);

  return { success: true, recoveryCodes: plainCodes };
}

function cliShowToken() { return generateSetupToken(); }

module.exports = {
  readSecurity, writeSecurity,
  hashPassword, verifyPassword,
  sha512,
  getAuthPhase,
  generateSetupToken, verifySetupToken,
  setupPassword,
  verifyRecoveryCode, resetPassword, checkRecoveryLock,
  cliSetup, cliShowToken,
  RECOVERY_CODE_COUNT, SETUP_TOKEN_TTL_MS
};

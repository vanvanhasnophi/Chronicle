/**
 * Chronicle Host — Auth Lifecycle Routes
 *
 * /api/admin/status   — returns current auth phase (public, no auth required)
 * /api/admin/setup    — create initial password (only during setup phase)
 * /api/admin/recover  — verify recovery code + reset password
 *
 * These endpoints handle the full auth lifecycle: setup → login → recovery.
 * All modes (self-hosted, full, managed) share the same logic.
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authService = require('../../services/authService');
const { success, fail } = require('../../services/response');
const { DEFAULT_MANAGER_DOMAIN } = require('../../config');

const isDev = process.argv.includes('--dev');
const WEBAUTHN_BASE_URL = isDev
  ? (process.env.VITE_DEV_URL || 'http://localhost:5173')
  : `https://${process.env.BACKEND_DOMAIN || DEFAULT_MANAGER_DOMAIN}`;
// MEDIA_DOMAIN is set by the deploy script (chronicle-deploy.sh / install.sh).
// When present it points to the CDN / file server domain; when absent the
// manager falls back to using the API server URL for media.
const MEDIA_BASE_URL = (process.env.MEDIA_DOMAIN && process.env.MEDIA_DOMAIN.replace(/\/$/, '')) || '';

// ── Rate Limiters ───────────────────────────────────────
const setupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, data: null, message: 'Too many setup attempts, try again later' },
});

const recoverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, data: null, message: 'Too many recovery attempts, try again later' },
});

// ── GET /api/admin/status ───────────────────────────────
// Manager calls this on boot to decide which page to show.

router.get('/status', (req, res) => {
  try {
    const phase = authService.getAuthPhase();
    return success(res, { phase, webauthnBaseUrl: WEBAUTHN_BASE_URL, mediaBaseUrl: MEDIA_BASE_URL });
  } catch (e) {
    return fail(res, 'Failed to determine auth status');
  }
});

// ── POST /api/admin/setup ───────────────────────────────
// Body: { setupToken?: string, password: string }

router.post('/setup', setupLimiter, (req, res) => {
  try {
    const phase = authService.getAuthPhase();
    if (phase !== 'setup' && phase !== 'token') {
      return fail(res, 'Setup is not available. Password already set.', 400);
    }

    const { setupToken, password } = req.body || {};
    const result = authService.setupPassword(password, setupToken);

    if (result.error) return fail(res, result.error, 400);

    return success(res, {
      message: 'Setup complete',
      recoveryCodes: result.recoveryCodes,
    });
  } catch (e) {
    return fail(res, 'Setup failed');
  }
});

// ── POST /api/admin/recover/reset ───────────────────────
// Body: { code: "XXXX-XXXX", password: string }

router.post('/recover/reset', recoverLimiter, (req, res) => {
  try {
    const phase = authService.getAuthPhase();
    if (phase === 'setup' || phase === 'token') {
      return fail(res, 'Recovery not available — password not yet set.', 400);
    }

    const { code, password } = req.body || {};
    if (!code) return fail(res, 'Recovery code required.', 400);
    if (!password || password.length < 8) return fail(res, 'Password must be at least 8 characters.', 400);

    // Verify and consume the recovery code
    const verifyResult = authService.verifyRecoveryCode(code);
    if (verifyResult.error) {
      if (verifyResult.remainingMinutes) {
        return fail(res, verifyResult.error, 429, { remainingMinutes: verifyResult.remainingMinutes });
      }
      return fail(res, verifyResult.error, 400);
    }

    // Reset password with new salt
    const result = authService.resetPassword(password);
    if (result.error) return fail(res, result.error, 400);

    return success(res, { message: 'Password reset complete' });
  } catch (e) {
    return fail(res, 'Password reset failed');
  }
});

// ── GET /api/admin/recover/status ───────────────────────

router.get('/recover/status', (req, res) => {
  try {
    const sec = authService.readSecurity();
    const locked = !!sec.recoveryLockUntil && Date.now() < new Date(sec.recoveryLockUntil).getTime();
    return success(res, { remaining: (sec.recoveryCodes || []).length, locked });
  } catch (e) {
    return fail(res, 'Failed to check recovery status');
  }
});

module.exports = router;

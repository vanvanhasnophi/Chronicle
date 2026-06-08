/**
 * Chronicle Host — Unified Response Helper
 *
 * All routes MUST use success() / fail() instead of raw res.json().
 * This ensures every response follows the { code, data, message } envelope
 * defined in @chronicle/shared/types/api.ts.
 *
 * Usage:
 *   const { success, fail } = require('../services/response');
 *   success(res, data);             // 200 with payload
 *   success(res, data, 'created');  // 200 with custom message
 *   fail(res, 'Bad request', 400);  // client error
 *   fail(res, 'Server error');      // 500 default
 */

function success(res, data = null, message = 'ok', code = 200) {
    return res.status(code).json({ code, data, message });
}

function fail(res, message, code = 500, data = null) {
    return res.status(code).json({ code, data, message });
}

module.exports = { success, fail };

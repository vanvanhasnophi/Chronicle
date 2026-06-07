/**
 * Chronicle Host — Logging Middleware
 *
 * Request/response logging with error persistence.
 * Only intercepts res.send — Express routes res.json through res.send internally,
 * so a single hook avoids double-logging.
 */

const fs = require('fs');
const path = require('path');
const { LOG_DIR, ACCESS_LOG } = require('../config');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Per-request outcome logger middleware.
 * Wraps res.send (the terminal method both res.json and res.send flow through).
 */
function requestLogger(req, res, next) {
    const start = Date.now();
    const _send = res.send.bind(res);
    let _logged = false;

    function logOutcome(statusCode, responseBody) {
        if (_logged) return;
        _logged = true;
        const duration = Date.now() - start;
        const brief = `${req.method} ${req.originalUrl} ${statusCode} ${duration}ms`;

        if (statusCode >= 400) {
            try {
                console.error('[API ERROR]', brief);
                console.error('  Query   :', JSON.stringify(req.query || {}));
                console.error('  Body    :', JSON.stringify(req.body || {}));
                console.error('  Response:', typeof responseBody === 'object'
                    ? JSON.stringify(responseBody) : String(responseBody));
                if (process.env.VERBOSE_ERRORS === '1') {
                    console.error('  Headers :', JSON.stringify(req.headers || {}));
                }
            } catch (e) {
                console.error('[API ERROR] failed to serialize debug info', e);
            }

            try {
                const out = [
                    `[${new Date().toISOString()}] ${brief}`,
                    `  Query: ${JSON.stringify(req.query || {})}`,
                    `  Body: ${JSON.stringify(req.body || {})}`,
                    `  Response: ${typeof responseBody === 'object'
                        ? JSON.stringify(responseBody) : String(responseBody)}`,
                    '\n'
                ].join('\n');
                fs.appendFile(path.join(LOG_DIR, 'error.log'), out, () => {});
            } catch (e) { /* ignore */ }
            return;
        }

        console.log('[API]', brief);
    }

    res.send = function (body) {
        try { logOutcome(res.statusCode || 200, body); } catch (e) { /* ignore */ }
        return _send(body);
    };

    next();
}

module.exports = { requestLogger };

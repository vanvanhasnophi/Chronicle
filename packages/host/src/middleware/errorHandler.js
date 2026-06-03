/**
 * Chronicle Host — Error Handler Middleware
 *
 * Catches unhandled errors and returns a unified JSON response.
 */

/**
 * Global error handler for Express.
 * Must be registered AFTER all routes.
 */
function errorHandler(err, req, res, _next) {
    console.error('[Unhandled API Error]', err && (err.stack || err.message || String(err)));
    try {
        console.error('  Request:', req.method, req.originalUrl);
        console.error('  Query  :', req.query);
        console.error('  Body   :', req.body);
    } catch (e) { /* ignore */ }

    if (!res.headersSent) {
        res.status(500).json({
            code: 500,
            data: null,
            message: err.message || 'Internal Server Error'
        });
    }
    // If headers already sent, Express will handle cleanup
}

module.exports = { errorHandler };

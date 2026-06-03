/**
 * Chronicle Host — Legacy Route Compatibility
 *
 * Logs deprecated /api/* paths and suggests new equivalents.
 * Old routes continue to work (handled inline in index.js).
 * New routes are available at /api/public/* and /api/admin/*.
 *
 * During transition:
 * - Old paths → continue to work, log a deprecation warning to console
 * - New paths → recommended for all new consumers
 *
 * When manager + template are updated to use new paths,
 * the old inline handlers in index.js can be removed.
 */

const { Router } = require('express');
const router = Router();

// Log deprecation warnings for old paths (log only, don't block)
router.use('/api/posts', (req, res, next) => {
    if (req.method === 'GET') {
        console.warn('[DEPRECATED] GET /api/posts → use GET /api/public/posts');
    }
    next();
});

router.use('/api/post', (req, res, next) => {
    const verb = req.method === 'POST' ? 'POST' : req.method;
    const target = req.method === 'GET' ? 'GET /api/public/post' : `${verb} /api/admin/posts`;
    console.warn(`[DEPRECATED] ${verb} /api/post → use ${target}`);
    next();
});

router.use('/api/search', (req, res, next) => {
    console.warn('[DEPRECATED] GET /api/search → use GET /api/public/search');
    next();
});

router.use('/api/settings', (req, res, next) => {
    const target = req.headers['x-chronicle-auth'] ? '/api/admin/settings' : '/api/public/settings';
    console.warn(`[DEPRECATED] ${req.method} /api/settings → use ${target}`);
    next();
});

// Generic deprecation logger for all other /api/* paths
router.use('/api', (req, res, next) => {
    if (req.path !== '/' && !req.path.startsWith('/public') && !req.path.startsWith('/admin')) {
        console.warn(`[DEPRECATED] ${req.method} /api${req.path} — migrate to /api/public or /api/admin prefix`);
    }
    next();
});

module.exports = router;

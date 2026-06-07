/**
 * Chronicle Host — Legacy Route Compatibility
 *
 * Rewrites old /api/* paths to the new canonical /api/admin/* and /api/public/* paths.
 *
 * Rewrite rules:
 * - /api/admin/* and /api/public/* → pass through (already using new paths)
 * - /api/* with x-chronicle-auth header → /api/admin/* (authenticated admin operations)
 * - /api/* without auth header → /api/public/* (public read-only operations)
 *
 * This ensures old API consumers continue to work while emitting deprecation warnings.
 * When the Manager and all consumers are updated to use /api/admin/*, this file can be removed.
 */

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function legacyCompat(req, res, next) {
  const url = req.url;

  // Already using new canonical paths — pass through
  if (url.startsWith('/api/admin/') || url.startsWith('/api/public/')) {
    return next();
  }

  // Old /api/* path — rewrite to new canonical path
  if (url.startsWith('/api/')) {
    const hasAuth = !!req.headers['x-chronicle-auth'];
    const newPrefix = hasAuth ? '/api/admin' : '/api/public';
    const rewritten = url.replace('/api', newPrefix);

    console.warn(`[DEPRECATED] ${req.method} ${url} → use ${rewritten}`);
    req.url = rewritten;
    return next();
  }

  // Not an API path — pass through
  next();
}

module.exports = legacyCompat;

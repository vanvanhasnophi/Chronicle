/**
 * Chronicle Host — Comment Admin Routes
 *
 * Mounted at /api/admin/comments. All endpoints require admin token.
 *
 * GET    /                     — list all pending comments (across all posts)
 * GET    /:postId              — get all comments for a post (approved + pending)
 * PATCH  /:postId/:commentId   — moderate: { action: "approve" | "reject" }
 * DELETE /:postId/:commentId   — delete a comment (from approved or pending)
 */

const { Router } = require('express');
const { success, fail } = require('../../services/response');
const { requireAdminToken } = require('../../middleware/auth');
const {
  getAllComments,
  listAllPending,
  approveComment,
  hideComment,
  unhideComment,
  deleteComment,
} = require('../../services/commentService');

const router = Router();

// ── GET / — list all pending comments across all posts ──────
router.get('/', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const results = listAllPending();
    return success(res, results);
  } catch (e) {
    return fail(res, 'Failed to list pending comments', 500);
  }
});

// ── GET /:postId — get all comments for a post ──────────────
router.get('/:postId', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const { postId } = req.params;
    const data = getAllComments(postId);
    return success(res, data);
  } catch (e) {
    return fail(res, 'Failed to read comments', 500);
  }
});

// ── PATCH /:postId/:commentId — moderate a comment ──────────
router.patch('/:postId/:commentId', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const { postId, commentId } = req.params;
    const { action } = req.body || {};

    if (!action || !['approve', 'hide', 'unhide'].includes(action)) {
      return fail(res, 'action must be "approve", "hide", or "unhide"', 400);
    }

    if (action === 'approve') {
      const comment = approveComment(postId, commentId);
      return success(res, comment, 'Comment approved');
    } else if (action === 'hide') {
      const comment = hideComment(postId, commentId);
      return success(res, comment, 'Comment hidden');
    } else {
      const comment = unhideComment(postId, commentId);
      return success(res, comment, 'Comment visible');
    }
  } catch (e) {
    return fail(res, e.message || 'Moderation failed', 400);
  }
});

// ── DELETE /:postId/:commentId — delete a comment ───────────
router.delete('/:postId/:commentId', (req, res) => {
  if (!requireAdminToken(req, res)) return;
  try {
    const { postId, commentId } = req.params;
    deleteComment(postId, commentId);
    return success(res, null, 'Comment deleted');
  } catch (e) {
    return fail(res, e.message || 'Delete failed', 400);
  }
});

module.exports = router;

/**
 * Chronicle Host — Public API Routes
 *
 * Read-only routes for the blog frontend. No authentication required.
 * Returns only published/modifying posts and public-safe settings.
 *
 * Mounted at /api/public
 */

const { Router } = require('express');
const fs = require('fs');
const { success, fail } = require('../../services/response');
const { INDEX_FILE, SETTINGS_FILE, COLLECTION_FILE, FRIENDS_FILE, PROFILE_FILE } = require('../../config');
const collectionService = require('../../services/collectionService');

const router = Router();

// ── WebAuthn page (Electron Passkey 2FA) ────────────────────
router.get('/auth/webauthn', (req, res) => {
    const callback = String(req.query.callback || '');
    if (!callback || !callback.startsWith('chronicle://')) {
        return res.status(400).send('Missing or invalid callback URL');
    }
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; style-src 'unsafe-inline'");
    res.type('html').send('<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>Chronicle Passkey</title>\n<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#111;color:#eee;flex-direction:column;gap:1rem}</style>\n</head><body>\n<div id="status">Starting WebAuthn…</div>\n<script>\nconst CB="' + callback + '";\nfunction buf2b64(buf){return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"")}\nfunction b64buf(s){const u=s.replace(/-/g,"+").replace(/_/g,"/");const r=atob(u);const b=new Uint8Array(r.length);for(let i=0;i<r.length;i++)b[i]=r.charCodeAt(i);return b.buffer}\n(async()=>{\nconst s=document.getElementById("status");\ntry{\ns.textContent="Requesting challenge…";\nconst o=await(await fetch("/api/admin/auth/passkey/login/options",{method:"POST"})).json();\nif(o.challenge)o.challenge=b64buf(o.challenge);\nif(o.allowCredentials)o.allowCredentials=o.allowCredentials.map(c=>({...c,id:b64buf(c.id)}));\ns.textContent="Waiting for Passkey…";\nconst cred=await navigator.credentials.get({publicKey:o});\nconst r={id:cred.id,rawId:buf2b64(cred.rawId),type:cred.type,\nresponse:{clientDataJSON:buf2b64(cred.response.clientDataJSON),\nauthenticatorData:buf2b64(cred.response.authenticatorData),\nsignature:buf2b64(cred.response.signature),\nuserHandle:cred.response.userHandle?buf2b64(cred.response.userHandle):null}};\ns.textContent="Verifying…";\nconst d=await(await fetch("/api/admin/auth/passkey/login/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({response:r})})).json();\nif(d.verified){s.textContent="✓ Signed in! You will be redirected to Chronicle app…";location.href=CB+(CB.includes("?")?"&":"?")+"token="+encodeURIComponent(d.token)}\nelse s.textContent="✗ Verification failed"}\ncatch(e){s.textContent="Error: "+(e.message||"WebAuthn failed")}})()\n</script></body></html>');
});

// ── Helpers ─────────────────────────────────────────────

function decodeHtmlEntities(text) {
    return String(text || '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function normalizePostTitle(title) {
    return decodeHtmlEntities(String(title || ''));
}

function normalizePostForResponse(post) {
    if (!post) return post;
    const title = normalizePostTitle(post.title);
    if (title === post.title) return post;
    return { ...post, title };
}

// ── GET /api/public/posts ───────────────────────────────

router.get('/posts', (req, res) => {
    try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        let posts = JSON.parse(indexContent || '[]');

        // Only published/modifying
        posts = posts.filter(p => p.status === 'published' || p.status === 'modifying' || !p.status);

        const featuredOnly = req.query.featured === 'true';
        if (featuredOnly) {
            posts = posts.filter(p =>
                Array.isArray(p.tags) && p.tags.some(t => String(t) === 'featured' || String(t) === '精选')
            );
        }

        posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const page = Number.parseInt(req.query.page, 10);
        const perPage = Number.parseInt(req.query.perPage, 10);
        const hasPagination = Number.isFinite(page) && Number.isFinite(perPage) && perPage > 0;

        if (hasPagination) {
            const p = page > 0 ? page : 1;
            const pp = perPage;
            const total = posts.length;
            const totalPages = total > 0 ? Math.ceil(total / pp) : 0;

            if (p > totalPages || total === 0) {
                return success(res, { posts: [], total, page: p, perPage: pp, totalPages });
            }

            const start = (p - 1) * pp;
            const pagedPosts = posts.slice(start, start + pp);
            return success(res, {
                posts: pagedPosts.map(normalizePostForResponse),
                total, page: p, perPage: pp, totalPages
            });
        }

        success(res, posts.map(normalizePostForResponse));
    } catch (e) {
        fail(res, 'Failed to load posts');
    }
});

// ── GET /api/public/post ────────────────────────────────

router.get('/post', (req, res) => {
    const { id } = req.query;
    if (!id) return fail(res, 'Missing ID', 400);

    try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        const posts = JSON.parse(indexContent || '[]');
        const post = posts.find(p => p.id === id);
        if (!post) return fail(res, 'Post not found', 404);
        if (post.status && post.status !== 'published' && post.status !== 'modifying') {
            return fail(res, 'Post not found', 404);
        }
        success(res, normalizePostForResponse(post));
    } catch (e) {
        fail(res, 'Failed to load post');
    }
});

// ── GET /api/public/search ──────────────────────────────

function searchPostsFromIndex(posts, keyword) {
    const kw = String(keyword || '').trim().toLowerCase();
    if (!kw) return posts;
    return posts.filter(post => {
        const title = normalizePostTitle(post.title).toLowerCase();
        if (title.includes(kw)) return true;
        if (String(post.summary || '').toLowerCase().includes(kw)) return true;
        if (Array.isArray(post.tags) && post.tags.some(t => String(t || '').toLowerCase().includes(kw))) return true;
        return false;
    });
}

router.get('/search', (req, res) => {
    try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        let posts = JSON.parse(indexContent || '[]');
        posts = posts.filter(p => p.status === 'published' || p.status === 'modifying' || !p.status);

        const keyword = req.query.keyword || req.query.q || '';
        const tags = (() => {
            const raw = req.query.tags || req.query.tag;
            if (Array.isArray(raw)) return raw.map(t => String(t || '').trim()).filter(Boolean);
            return String(raw || '').split(',').map(t => t.trim()).filter(Boolean);
        })();

        if (tags.length > 0) {
            posts = posts.filter(p => {
                const pt = Array.isArray(p.tags) ? p.tags.map(t => String(t || '').trim()) : [];
                return tags.every(t => pt.includes(t));
            });
        }

        posts = searchPostsFromIndex(posts, keyword);
        posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        success(res, posts.map(normalizePostForResponse));
    } catch (e) {
        fail(res, 'Search failed');
    }
});

// ── GET /api/public/settings ────────────────────────────

router.get('/settings', (req, res) => {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) {
            return success(res, {});
        }
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        // Strip sensitive fields
        const {
            frontendTheme, frontendAccent, frontendBackground, frontendBackgroundMeta,
            frontendFont, featureFlags,
            homepageMode, frontendLocale, frontendBackgroundCompression,
            gaMeasurementId
        } = settings;
        // Read friends from dedicated file
        let friends = { cards: [], globalStyle: null };
        if (fs.existsSync(FRIENDS_FILE)) {
            try { friends = JSON.parse(fs.readFileSync(FRIENDS_FILE, 'utf-8')); } catch (e) { }
        } else if (settings.friendsCards || settings.friendsGlobalStyle) {
            // Backward compat
            friends = {
                cards: settings.friendsCards || [],
                globalStyle: settings.friendsGlobalStyle || null,
            };
        }
        success(res, {
            frontendTheme, frontendAccent, frontendBackground, frontendBackgroundMeta,
            frontendFont, featureFlags,
            homepageMode, frontendLocale, frontendBackgroundCompression,
            gaMeasurementId,
            friendsCards: friends.cards,
            friendsGlobalStyle: friends.globalStyle,
        });
    } catch (e) {
        fail(res, 'Failed to load settings');
    }
});

// ── GET /api/public/profile ─────────────────────────

router.get('/profile', (req, res) => {
    try {
        if (!fs.existsSync(PROFILE_FILE)) {
            return success(res, { name: '', avatar: '', bio: '', location: '', links: [] });
        }
        const profile = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8'));
        success(res, profile);
    } catch (e) {
        fail(res, 'Failed to load profile');
    }
});

// ── GET /api/public/collections ─────────────────────────

router.get('/collections', (req, res) => {
    try {
        const data = collectionService.readAllCollections();
        if (data.collections.length === 0 && collectionService.hasLegacyCollectionFile()) {
            const legacy = JSON.parse(fs.readFileSync(COLLECTION_FILE, 'utf-8'));
            return success(res, legacy);
        }
        success(res, data);
    } catch (e) {
        fail(res, 'Failed to load collections');
    }
});

module.exports = router;

const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const os = require('os');

const app = express();
const PORT = 3000;

console.log("Backend Version: 2026-02-11-FIX-RPID (blog.eightyfor.top)");

// Enable CORS
app.use(cors());

// Logger
const LOG_DIR = path.join(__dirname, 'log');
const ACCESS_LOG = path.join(LOG_DIR, 'access.log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const accessLogStream = fs.createWriteStream(ACCESS_LOG, { flags: 'a' });
app.use(morgan('combined', { stream: accessLogStream }));

// Data Directories
const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'upload');
const POSTS_DIR = path.join(DATA_DIR, 'posts');
const SECURITY_FILE = path.join(DATA_DIR, 'security.json');
const INDEX_FILE = path.join(POSTS_DIR, 'index.json');

const CATEGORIES = ['pic', 'sound', 'txt', 'video', 'doc', 'other'];

function sortTags(tags) {
    if (!tags || !Array.isArray(tags)) return [];
    return tags.sort((a, b) => {
        if (a === 'featured') return -1;
        if (b === 'featured') return 1;
        return a.localeCompare(b);
    });
}

// Dev Static Link Helper
// Ensures that even if started without start.sh, or if links are missing,
// we try to bind the upload folder to the frontend public folder.
function ensureDevSymlink() {
    try {
        // Detect if we are in the monorepo structure
        // ../chronicle-frontend/public
        const frontendPublic = path.resolve(__dirname, '../chronicle-frontend/public');
        if (fs.existsSync(frontendPublic)) {
            const targetParent = path.join(frontendPublic, 'server/data');
            const targetLink = path.join(targetParent, 'upload');
            
            if (!fs.existsSync(targetParent)) {
                fs.mkdirSync(targetParent, { recursive: true });
            }

            if (!fs.existsSync(targetLink)) {
                // Ensure source exists
                if (fs.existsSync(UPLOAD_DIR)) {
                     // Check if targetLink is a broken link
                     try { fs.unlinkSync(targetLink); } catch(e) {}
                     fs.symlinkSync(UPLOAD_DIR, targetLink, 'dir');
                     console.log('[Dev] Created static asset symlink:', targetLink);
                }
            }
        }
    } catch (e) {
        // Silent fail - permission or structure issues
    }
}
// Run once on startup
ensureDevSymlink();

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
CATEGORIES.forEach(cat => {
    const catDir = path.join(UPLOAD_DIR, cat);
    if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });
});
if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR, { recursive: true });
if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, '[]');

// Encryption Setup
const ALGORITHM = 'aes-256-cbc';
const SECRET_KEY = crypto.scryptSync('chronicle-secret-key-123', 'salt', 32);

// CDN purge config from env (for Alibaba Cloud)
const ALIYUN_ACCESS_KEY_ID = process.env.ALIYUN_ACCESS_KEY_ID || '';
const ALIYUN_ACCESS_KEY_SECRET = process.env.ALIYUN_ACCESS_KEY_SECRET || '';
const CDN_API_ENDPOINT = process.env.CDN_API_ENDPOINT || 'https://cdn.aliyuncs.com/';
// Optional switch to enable/disable CDN purge behaviour.
// Currently hard-coded OFF for safety. To enable later, set this to read from env as before.
const ENABLE_CDN_PURGE = false;

function percentEncode(str) {
    return encodeURIComponent(str)
        .replace(/\+/g, '%20')
        .replace(/\*/g, '%2A')
        .replace(/%7E/g, '~');
}

async function aliyunCdnRefresh(urls = []) {
    if (!ENABLE_CDN_PURGE) {
        console.log('[CDN] Purge disabled by ENABLE_CDN_PURGE env var');
        return;
    }
    if (!ALIYUN_ACCESS_KEY_ID || !ALIYUN_ACCESS_KEY_SECRET || !urls || urls.length === 0) {
        console.log('[CDN] Skipping CDN refresh - missing creds or urls');
        return;
    }

    try {
        const params = {
            Format: 'JSON',
            Version: '2018-05-10',
            AccessKeyId: ALIYUN_ACCESS_KEY_ID,
            SignatureMethod: 'HMAC-SHA1',
            Timestamp: new Date().toISOString(),
            SignatureVersion: '1.0',
            SignatureNonce: Math.random().toString(36).slice(2),
            Action: 'RefreshObjectCaches'
        };

        // ObjectPath.N entries
        urls.forEach((u, i) => { params[`ObjectPath.${i+1}`] = u; });
        params.ObjectType = 'File';

        // Canonicalize
        const keys = Object.keys(params).sort();
        const canonicalized = keys.map(k => `${percentEncode(k)}=${percentEncode(String(params[k]))}`).join('&');
        const stringToSign = `GET&%2F&${percentEncode(canonicalized)}`;

        const sign = crypto.createHmac('sha1', ALIYUN_ACCESS_KEY_SECRET + '&').update(stringToSign).digest('base64');
        const finalParams = { Signature: sign, ...params };

        const qs = Object.keys(finalParams).map(k => `${percentEncode(k)}=${percentEncode(String(finalParams[k]))}`).join('&');
        const url = `${CDN_API_ENDPOINT}?${qs}`;

        // Fire request (GET)
        console.log('[CDN] Purge request URL:', url.replace(/(AccessKeyId=)[^&]+/, '$1****'));
        const resp = await fetch(url, { method: 'GET', timeout: 10000 });
        const body = await resp.text();
        console.log('[CDN] Purge response:', resp.status, body);
    } catch (e) {
        console.error('[CDN] Purge error', e);
    }
}

// --- Front Matter Helpers ---
function parseFrontMatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { attributes: {}, body: content };
    
    const attributes = {};
    match[1].split('\n').forEach(line => {
        const parts = line.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join(':').trim();
            if (key === 'tags') {
                try { attributes[key] = JSON.parse(value); } catch(e) { attributes[key] = []; }
            } else {
                attributes[key] = value;
            }
        }
    });
    return { attributes, body: match[2] };
}

function stringifyFrontMatter(attributes, body) {
    let fm = '---\n';
    if (attributes.title) fm += `title: ${attributes.title}\n`;
    if (attributes.date) fm += `date: ${attributes.date}\n`;
    if (attributes.font) fm += `font: ${attributes.font}\n`;
    if (attributes.tags) fm += `tags: ${JSON.stringify(attributes.tags)}\n`;
    fm += '---\n';
    return fm + body;
}

// Ensure Index Consistency on Startup
function syncIndexWithFiles() {
    try {
        if (!fs.existsSync(INDEX_FILE)) return;
        let posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
        let modified = false;

        posts.forEach(post => {
            const mdPath = path.join(POSTS_DIR, post.filename);
            if (fs.existsSync(mdPath)) {
                let content = fs.readFileSync(mdPath, 'utf-8');
                try { content = decrypt(content); } catch(e) {}
                
                const { attributes } = parseFrontMatter(content);
                if (attributes.font && attributes.font !== post.font) {
                    post.font = attributes.font;
                    modified = true;
                    console.log(`[Sync] Updated font for ${post.id} from file metadata: ${post.font}`);
                }
                // We could sync other fields too, but font is the request focus
            }
        });

        if (modified) {
            fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
            console.log('[Sync] Index updated based on file metadata');
        }
    } catch (e) {
        console.error('[Sync] Failed to sync index:', e);
    }
}
syncIndexWithFiles();

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

// Passkey Globals
const isDev = process.argv.includes('--dev');
const RP_ID = isDev ? 'localhost' : 'blog.eightyfor.top'; 
const ORIGIN = isDev ? 'http://localhost:5173' : 'https://blog.eightyfor.top'; 
// MEDIA_DOMAIN controls the public base URL for uploaded media files.
// Set via environment variable in production: MEDIA_DOMAIN=https://file.eightyfor.top
const MEDIA_DOMAIN = (process.env.MEDIA_DOMAIN && process.env.MEDIA_DOMAIN.replace(/\/$/, '')) || (isDev ? 'http://localhost:3000' : 'https://file.eightyfor.top');
console.log('Passkey Config:', { RP_ID, ORIGIN });
const passkeyChallenges = new Map();
const verificationCodes = new Map();

// Middlewares
// Use JSON parser for everything EXCEPT upload endpoint which needs raw stream
// 增加 limit 解决大文件上传 413 问题
app.use((req, res, next) => {
    if (req.path === '/api/upload') {
        next();
    } else {
        express.json({ limit: '100mb' })(req, res, next);
    }
});

// --- ROUTES ---

// 1. Static File Serving (Mimic /server/data/upload/...)
// Frontend requests: /server/data/upload/pic/xxx.png
app.use('/server/data/upload', express.static(UPLOAD_DIR, {
    maxAge: '7d',
    immutable: true
}));

// Thumbnail endpoint: /thumb/<category>/<file>
// Tries to generate a cached thumbnail under UPLOAD_DIR/.thumbs
let sharpLib = null;
try {
    sharpLib = require('sharp');
} catch (e) {
    // sharp not installed - thumbnails will fallback to original image
    console.log('[Thumb] sharp not available, thumbnails will fallback to original images');
}

app.get('/thumb/*', async (req, res) => {
    try {
        const rel = req.path.replace(/^\/thumb\//, '').replace(/^\/+/, '');
        const target = path.resolve(UPLOAD_DIR, rel);
        if (!target.startsWith(UPLOAD_DIR) || !fs.existsSync(target)) {
            return res.status(404).send('Not found');
        }

        // cached thumbs dir
        const thumbBase = path.join(UPLOAD_DIR, '.thumbs');
        const thumbPath = path.join(thumbBase, rel);
        const thumbDir = path.dirname(thumbPath);

        // Ensure thumb dir exists
        if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });

        // If sharp available, create thumbnail if needed
        if (sharpLib) {
            let needCreate = true;
            try {
                if (fs.existsSync(thumbPath)) {
                    const tStat = fs.statSync(thumbPath);
                    const oStat = fs.statSync(target);
                    if (tStat.mtimeMs >= oStat.mtimeMs) needCreate = false;
                }
            } catch (e) { needCreate = true; }

            if (needCreate) {
                try {
                        await sharpLib(target)
                            .resize({ width: 200, height: 200, fit: 'inside', withoutEnlargement: true })
                        .toFile(thumbPath);
                } catch (e) {
                    console.error('[Thumb] failed to generate thumb for', target, e.message || e);
                    // fallback to original
                    return res.sendFile(target);
                }
            }

            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 days
            return res.sendFile(thumbPath);
        }

        // sharp not available -> just serve original image
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        return res.sendFile(target);
    } catch (e) {
        console.error('[Thumb] error', e);
        res.status(500).send('Error');
    }
});


// 2. Auth - Passkey
// Code Verification Routes
app.get('/api/auth/code/generate', (req, res) => {
    // Simple mock auth check - in prod check session
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set('admin', { 
        code, 
        expires: Date.now() + 5 * 60 * 1000 
    });
    console.log('Generated code:', code);
    res.json({ code, expiresIn: 300 });
});

app.post('/api/auth/code/verify', (req, res) => {
    const { code } = req.body;
    const stored = verificationCodes.get('admin');
    
    if (!stored) return res.status(400).json({ success: false, message: 'No code active' });
    if (Date.now() > stored.expires) {
        verificationCodes.delete('admin');
        return res.status(400).json({ success: false, message: 'Code expired' });
    }
    
    if (stored.code === code) {
        verificationCodes.delete('admin');
        res.json({ success: true, token: 'session-valid' });
    } else {
        res.status(400).json({ success: false, message: 'Invalid code' });
    }
});

app.post('/api/auth/passkey/register/options', async (req, res) => {
    const user = 'admin';
    const options = await generateRegistrationOptions({
        rpName: 'Chronicle Blog',
        rpID: RP_ID,
        userID: new Uint8Array(Buffer.from(user)),
        userName: user,
    });
    passkeyChallenges.set(user, options.challenge);
    res.json(options);
});

app.post('/api/auth/passkey/register/verify', async (req, res) => {
    try {
        const { response } = req.body;
        const user = 'admin';
        const expectedChallenge = passkeyChallenges.get(user);
        
        if (!expectedChallenge) return res.status(400).json({ error: 'No challenge' });

        const verification = await verifyRegistrationResponse({
            response,
            expectedChallenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
        });

        if (verification.verified && verification.registrationInfo) {
            passkeyChallenges.delete(user);
            
            if (!fs.existsSync(SECURITY_FILE)) {
                const defaultHash = hashPassword('admin');
                fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: defaultHash, devices: [] }));
            }
            
            const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
            if (!saved.devices) saved.devices = [];
            
            const { credential } = verification.registrationInfo;
            // 获取设备名和类型
            const deviceName = os.hostname();
            const ua = req.headers['user-agent'] || '';
            const deviceType = getDeviceTypeFromUA(ua);
            const dateStr = new Date().toLocaleDateString();
            
            // Format: "Device (Type, Date)" e.g. "MyMac (Mac, 2/12/2026)"
            let finalName = req.query.name || `${deviceName} (${deviceType}, ${dateStr})`;
            
            saved.devices.push({
                credentialID: credential.id,
                credentialPublicKey: Buffer.from(credential.publicKey).toString('base64url'),
                counter: credential.counter,
                transports: response.response.transports,
                name: finalName,
                createdAt: new Date().toISOString()
            });
            
            fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
            res.json({ verified: true });
        } else {
            res.status(400).json({ verified: false });
        }
    } catch (e) {
        console.error(e);
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/auth/passkey/login/options', async (req, res) => {
    const user = 'admin';
    const options = await generateAuthenticationOptions({
            rpID: RP_ID,
            userVerification: 'preferred',
    });
    passkeyChallenges.set(user, options.challenge);
    res.json(options);
});

app.post('/api/auth/passkey/login/verify', async (req, res) => {
    try {
        const { response } = req.body;
        const user = 'admin';
        const expectedChallenge = passkeyChallenges.get(user);

        if (!fs.existsSync(SECURITY_FILE)) return res.status(400).send('No devices registered');
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const devices = saved.devices || [];
        
        const device = devices.find(d => d.credentialID === response.id);
        if (!device) return res.status(400).send('Device not found');

        const verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: expectedChallenge || '',
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
            credential: {
                id: device.credentialID,
                publicKey: new Uint8Array(Buffer.from(device.credentialPublicKey, 'base64url')),
                counter: device.counter,
                transports: device.transports,
            },
        });

        if (verification.verified) {
            passkeyChallenges.delete(user);
            device.counter = verification.authenticationInfo.newCounter;
            fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
            res.json({ verified: true, token: 'session-valid' });
        } else {
            res.status(400).json({ verified: false });
        }
    } catch(e) {
        console.error(e);
        res.status(400).json({ error: e.message });
    }
});

app.get('/api/auth/passkeys', (req, res) => {
    try {
        if (!fs.existsSync(SECURITY_FILE)) return res.json([]);
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const devices = (saved.devices || []).map(d => ({
            id: d.credentialID,
            name: d.name || 'Unnamed Passkey',
            createdAt: d.createdAt || '',
            transports: d.transports
        }));
        res.json(devices);
    } catch(e) {
        res.status(500).json([]);
    }
});

app.delete('/api/auth/passkeys/:id', (req, res) => {
    try {
        const { id } = req.params;
        if (!fs.existsSync(SECURITY_FILE)) return res.status(404).send('No file');
        
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        if (!saved.devices) return res.status(404).send('Not found');
        
        const initialLen = saved.devices.length;
        saved.devices = saved.devices.filter(d => d.credentialID !== id);
        
        if (saved.devices.length === initialLen) {
            return res.status(404).send('Not found');
        }

        fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.patch('/api/auth/passkeys/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!fs.existsSync(SECURITY_FILE)) return res.status(404).send('No file');
        
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const device = (saved.devices || []).find(d => d.credentialID === id);
        
        if (!device) return res.status(404).send('Not found');
        
        device.name = name || device.name;
        fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});


// 3. Auth - Normal
app.post('/api/auth/login', (req, res) => {
    try {
        const { password } = req.body;
        
        if (!fs.existsSync(SECURITY_FILE)) {
            const defaultHash = hashPassword('admin');
            fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: defaultHash }));
        }
        
        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const attemptHash = hashPassword(password);
        
        if (saved.passwordHash === attemptHash) {
            if (saved.devices && saved.devices.length > 0) {
                res.json({ success: true, requirePasskey: true });
            } else {
                res.json({ success: true, token: 'session-valid' });
            }
        } else {
            res.status(401).json({ success: false, message: 'Invalid password' });
        }
    } catch (e) {
        res.status(500).send('Error');
    }
});

app.post('/api/auth/change', (req, res) => {
    try {
        const { oldPassword, newPassword, token } = req.body;
        
        if (!fs.existsSync(SECURITY_FILE)) {
            const newHash = hashPassword(newPassword);
            fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: newHash }));
            return res.json({ success: true });
        }

        const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
        const oldHash = hashPassword(oldPassword);

        if (saved.passwordHash === oldHash) {
            // Check 2FA if enabled
            if (saved.devices && saved.devices.length > 0) {
                if (token !== 'session-valid') {
                    return res.json({ success: false, requirePasskey: true });
                }
            }

            const newHash = hashPassword(newPassword);
            saved.passwordHash = newHash; // Keep devices
            fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2));
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: 'Old password incorrect' });
        }
    } catch(e) {
        res.status(500).send('Error');
    }
});


// 4. Files API
app.get('/api/files', (req, res) => {
    const queryPath = req.query.path || '';

    if (queryPath === 'all') {
            let allFiles = [];
            CATEGORIES.forEach(cat => {
                const catDir = path.join(UPLOAD_DIR, cat);
                if (fs.existsSync(catDir)) {
                    try {
                        const files = fs.readdirSync(catDir, { withFileTypes: true })
                        .filter(d => !d.isDirectory())
                        .map(dirent => {
                            const relPath = `${cat}/${dirent.name}`;
                            const fullUrl = `${MEDIA_DOMAIN}/server/data/upload/${relPath}`;
                            // Construct thumb URL if likely an image (simple check via cat or ext)
                            // We use /thumb/ route which handles existence check or fallback
                                const thumbUrl = ['pic'].includes(cat)
                                    ? `${MEDIA_DOMAIN}/server/data/upload/.thumbs/${relPath}`
                                : undefined;
                                
                            return {
                                name: dirent.name,
                                type: 'file',
                                category: cat,
                                path: relPath,
                                url: fullUrl,
                                thumb: thumbUrl
                            };
                        });
                        allFiles = allFiles.concat(files);
                    } catch(e) {}
                }
            });
            return res.json(allFiles);
    }

    const targetDir = path.resolve(UPLOAD_DIR, queryPath.replace(/^\/+/, ''));
    if (!targetDir.startsWith(UPLOAD_DIR)) {
        return res.status(403).send('Forbidden');
    }
    if (!fs.existsSync(targetDir)) {
        return res.json([]);
    }

    try {
        const items = fs.readdirSync(targetDir, { withFileTypes: true }).map(dirent => {
            const rel = path.relative(UPLOAD_DIR, path.join(targetDir, dirent.name)).replace(/\\/g, '/');
            const isDir = dirent.isDirectory();
            const fullUrl = `${MEDIA_DOMAIN}/server/data/upload/${rel}`;
            
            // Determine thumb
            // If we are listing a specific path (e.g. 'pic'), we can infer category logic
            // Or just check extension
            let thumbUrl;
            if (!isDir) {
                const ext = path.extname(dirent.name).toLowerCase();
                if (['.png','.jpg','.jpeg','.gif','.svg','.webp','.ico','.bmp','.tiff'].includes(ext)) {
                         thumbUrl = `${MEDIA_DOMAIN}/server/data/upload/.thumbs/${rel}`;
                }
            }

            return {
                name: dirent.name,
                type: isDir ? 'directory' : 'file',
                path: rel,
                url: fullUrl,
                thumb: thumbUrl
            };
        });
        res.json(items);
    } catch (e) {
        res.status(500).send('Error listing files');
    }
});

app.post('/api/folder', (req, res) => {
    try {
        const { folderPath } = req.body;
        if (!folderPath) throw new Error('Missing folderPath');
        
        const targetPath = path.resolve(UPLOAD_DIR, folderPath.replace(/^\/+/, ''));
        if (!targetPath.startsWith(UPLOAD_DIR)) return res.status(403).send('Forbidden');

        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
        }
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.delete('/api/files', (req, res) => {
    const queryPath = req.query.path || '';
    const targetPath = path.resolve(UPLOAD_DIR, queryPath.replace(/^\/+/, ''));
    if (!targetPath.startsWith(UPLOAD_DIR)) return res.status(403).send('Forbidden');
    
    try {
        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        }

        // Also remove cached thumbnails for this path under .thumbs
        try {
            const rel = path.relative(UPLOAD_DIR, targetPath).replace(/\\/g, '/');
            const thumbTarget = path.join(UPLOAD_DIR, '.thumbs', rel);
            // Ensure thumbTarget is inside upload dir for safety
            if (thumbTarget.startsWith(UPLOAD_DIR) && fs.existsSync(thumbTarget)) {
                fs.rmSync(thumbTarget, { recursive: true, force: true });
            }

            // Trigger CDN refresh for both origin path and thumbs path (fire-and-forget)
            (async () => {
                try {
                    const relSafe = rel.replace(/^\/+/, '');
                    if (!relSafe) return;
                    const urls = [];
                    const originUrl = `${MEDIA_DOMAIN.replace(/\/$/, '')}/server/data/upload/${relSafe}`;
                    const thumbUrl = `${MEDIA_DOMAIN.replace(/\/$/, '')}/server/data/upload/.thumbs/${relSafe}`;
                    urls.push(originUrl);
                    urls.push(thumbUrl);
                    // Also add wildcard variants to try to purge directories
                    urls.push(originUrl + '*');
                    urls.push(thumbUrl + '*');

                    console.log('[Delete] Triggering CDN purge for', urls);
                    await aliyunCdnRefresh(urls);
                } catch (e) {
                    console.error('[Delete] CDN purge failed', e);
                }
            })();
        } catch (e) {
            console.error('[Delete] Failed to remove thumbs for', targetPath, e);
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).send('Error');
    }
});

app.post('/api/upload', (req, res) => {
    // Ensure access capability
    ensureDevSymlink();

    const filename = req.headers['x-filename'];
    let category = req.headers['x-category'] || '';
    
    if (!filename) return res.status(400).send('Missing filename');
    
    const decodedName = decodeURIComponent(filename);
    const ext = path.extname(decodedName).toLowerCase();

    // Auto-classify
    if (!category || !CATEGORIES.includes(category)) {
        if (['.png','.jpg','.jpeg','.gif','.svg','.webp','.ico','.bmp','.tiff'].includes(ext)) category = 'pic';
        else if (['.mp3','.wav','.ogg','.m4a','.flac','.aac'].includes(ext)) category = 'sound';
        else if (['.mp4','.webm','.avi','.mov','.mkv','.wmv'].includes(ext)) category = 'video';
        else if (['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.odt','.ods','.odp','.rtf'].includes(ext)) category = 'doc';
        else if (['.txt','.md','.js','.ts','.html','.css','.json','.py','.java','.c','.cpp','.h','.vue','.xml','.yaml','.yml','.ini','.conf','.sh','.bat','.log','.csv','.rs','.go','.php','.rb','.pl','.swift','.kt','.sql','.r','.m','.make','.dockerfile'].includes(ext)) category = 'txt';
        else category = 'other';
    }

    const categoryDir = path.join(UPLOAD_DIR, category);
    if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });

    const cleanName = decodedName.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const randomName = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${cleanName}`;
    const filePath = path.join(categoryDir, randomName);
    
    const writeStream = fs.createWriteStream(filePath);
    req.pipe(writeStream);

    writeStream.on('finish', async () => {
        const webPath = `/server/data/upload/${category}/${randomName}`;
        const fullUrl = `${MEDIA_DOMAIN}${webPath}`;
        
        let thumbUrl = '';
        
        // Thumbnail generation & Pre-warm logic
            try {
                // 1. Generate thumbnail immediately if it's an image and sharp is available
                if (sharpLib && ['pic'].includes(category)) {
                     const thumbRel = `/${category}/${randomName}`;
                     const thumbBase = path.join(UPLOAD_DIR, '.thumbs');
                     const thumbPath = path.join(thumbBase, thumbRel);
                     const thumbDir = path.dirname(thumbPath);
                     
                     if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
                     
                     try {
                         await sharpLib(filePath)
                             .resize({ width: 200, height: 200, fit: 'inside', withoutEnlargement: true })
                             .toFile(thumbPath);
                         thumbUrl = `${MEDIA_DOMAIN}/server/data/upload/.thumbs${thumbRel}`;
                     } catch (err) {
                         console.error('[Upload] Thumb generation failed:', err.message);
                     }
                }

            // 2. Pre-warm CDN (Async)
            // Trigger GET requests to the CDN URLs so it pulls from origin immediately
            // We do not await this to avoid blocking the response significantly, 
            // but a small delay might be fine to ensure origin is ready.
            const warmUrls = [fullUrl];
            if (thumbUrl) warmUrls.push(thumbUrl);

            // Fire and forget pre-warm
            (async () => {
                try {
                    console.log('[Pre-warm] Triggering fetch for:', warmUrls);
                    const results = await Promise.allSettled(warmUrls.map(u => fetch(u, { method: 'HEAD', timeout: 5000 })));
                    results.forEach((r, i) => {
                         if (r.status === 'rejected') console.error(`[Pre-warm] Failed ${warmUrls[i]}:`, r.reason);
                         else console.log(`[Pre-warm] Success ${warmUrls[i]}`);
                    });
                } catch (e) { console.error('[Pre-warm] error', e); }
            })();

        } catch (e) {
            console.error('[Upload] Post-process error', e);
        }

        res.json({ url: fullUrl, path: webPath, category, thumb: thumbUrl });
    });
    writeStream.on('error', (err) => {
        console.error(err);
        res.status(500).send('Upload failed');
    });
});


// 5. Blog Posts API

app.get('/api/posts', (req, res) => {
    try {
        // Reload strictly to get fresh data
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        let posts = JSON.parse(indexContent || '[]');
        
        const includeDrafts = req.query.includeDrafts === 'true';
        if (!includeDrafts) {
            posts = posts.filter(p => p.status === 'published' || p.status === 'modifying' || !p.status);
        }

        posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        res.json(posts);
    } catch(e) {
        res.status(500).send('[]');
    }
});

app.get('/api/post', (req, res) => {
    const { id, mode } = req.query;
    if (!id) return res.status(400).send('Missing ID');

    try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        const posts = JSON.parse(indexContent || '[]');
        const post = posts.find(p => p.id === id);

        if (!post) return res.status(404).send('Post not found');

        let targetFilename = post.filename;
        if (mode === 'edit' && post.status === 'modifying' && post.draftFilename) {
            targetFilename = post.draftFilename;
        }

        const mdPath = path.join(POSTS_DIR, targetFilename);
        let content = '';
        if (fs.existsSync(mdPath)) {
            const raw = fs.readFileSync(mdPath, 'utf-8');
            try { content = decrypt(raw); } catch(err) { content = raw; }
            // Strip front matter for frontend consumption
            const { body } = parseFrontMatter(content);
            content = body;
        }
        res.json({ ...post, content });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.post('/api/restore', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('Missing ID');
    try {
        const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8');
        const posts = JSON.parse(indexContent || '[]');
        const post = posts.find(p => p.id === id);

        if (post && post.status === 'modifying' && post.draftFilename) {
            const draftPath = path.join(POSTS_DIR, post.draftFilename);
            if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath);
            post.status = 'published';
            delete post.draftFilename;
            fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
        }
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.post('/api/post', (req, res) => {
    try {
        const data = req.body;
        if (!data.title) return res.status(400).send('Missing title');

        let posts = [];
        try { posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]'); } catch(e){}

        let post;
        const now = new Date().toISOString();
        const content = data.content;
        const status = data.status;

        if (data.id) {
            post = posts.find(p => p.id === data.id);
            if (post) {
                post.title = data.title || post.title;
                if (content !== undefined) {
                    post.summary = content.slice(0, 200).replace(/[#*`\[\]]/g, '');
                }
                
                if (status === 'modifying') {
                    if (!post.draftFilename) post.draftFilename = `${post.id}_draft.md`;
                    post.status = 'modifying';
                } else if (status === 'published') {
                    if (post.draftFilename) {
                         const draftPath = path.join(POSTS_DIR, post.draftFilename);
                         if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath);
                         delete post.draftFilename;
                    }
                    post.status = 'published';
                } else if (status) {
                    post.status = status;
                }
                if (data.tags) post.tags = sortTags(data.tags || []);
                if (data.font) post.font = data.font;
                post.updatedAt = now;
            }
        }

        if (!post) {
            const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
            const filename = `${id}.md`;
            post = {
                id,
                title: data.title,
                date: now,
                updatedAt: now,
                filename,
                summary: (content || '').slice(0, 200).replace(/[#*`\[\]]/g, ''),
                tags: sortTags(data.tags || []),
                font: data.font || 'sans',
                status: status || 'draft'
            };
            posts.push(post);
            data.id = id;
        }

        if (content !== undefined || !data.id) {
            // Attach source data (Front Matter) to file
            const fullContent = stringifyFrontMatter({
                title: post.title,
                date: post.date,
                updatedAt: post.updatedAt,
                tags: post.tags || [],
                font: post.font || 'sans'
            }, content || '');

            const encryptedContent = encrypt(fullContent);
            const targetFilename = (post.status === 'modifying' && post.draftFilename) 
                ? post.draftFilename 
                : post.filename;
            fs.writeFileSync(path.join(POSTS_DIR, targetFilename), encryptedContent);
        } else {
             // If content wasn't sent but metadata was updated, we should update the file metadata too.
             // But reading, decrypting, updating FM, encrypting, saving is expensive.
             // Given BlogEditor always sends content, we might skip this edge case or handle it.
             // For robustness (user request: "ensure... linking"), allow metadata-only update to file:
             const targetFilename = (post.status === 'modifying' && post.draftFilename) 
                ? post.draftFilename 
                : post.filename;
             const mdPath = path.join(POSTS_DIR, targetFilename);
             if (fs.existsSync(mdPath)) {
                 try {
                     const raw = fs.readFileSync(mdPath, 'utf-8');
                     let currentContent = raw;
                     try { currentContent = decrypt(raw); } catch(e){}
                     const { body } = parseFrontMatter(currentContent);
                     
                     const newContent = stringifyFrontMatter({
                        title: post.title,
                        date: post.date,
                        updatedAt: post.updatedAt,
                        tags: post.tags || [],
                        font: post.font || 'sans'
                    }, body);
                    fs.writeFileSync(mdPath, encrypt(newContent));
                 } catch(e) { console.error('Failed to update file metadata', e); }
             }
        }

        fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
        res.json({ success: true, id: post.id });
    } catch(e) {
        console.error(e);
        res.status(500).send('Error');
    }
});

app.delete('/api/post', (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).send('ID required');

    try {
        let posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]');
        const post = posts.find(p => p.id === id);
        if (post) {
            const mdPath = path.join(POSTS_DIR, post.filename);
            if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
            posts = posts.filter(p => p.id !== id);
            fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
        }
        res.json({ success: true });
    } catch(e) {
        res.status(500).send('Error');
    }
});

app.post('/api/scan', (req, res) => {
    try {
        let posts = [];
        try { posts = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8') || '[]'); } catch(e){}
        
        const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
        const fileSet = new Set(files);
        
        const originalCount = posts.length;
        posts = posts.filter(p => fileSet.has(p.filename));
        
        const indexedFiles = new Set(posts.map(p => p.filename));
        const orphans = files.filter(f => !indexedFiles.has(f));
        
        let recoveredCount = 0;
        orphans.forEach(filename => {
            try {
                const raw = fs.readFileSync(path.join(POSTS_DIR, filename), 'utf-8');
                let content = raw;
                try { content = decrypt(raw); } catch(e) {}
                const stats = fs.statSync(path.join(POSTS_DIR, filename));
                const id = filename.replace('.md', '');
                
                posts.push({
                    id,
                    title: `Recovered: ${id}`,
                    date: stats.birthtime || new Date(),
                    filename,
                    summary: content.slice(0, 100).replace(/[#*`\[\]]/g, ''),
                    tags: ['recovered'],
                    status: 'draft'
                });
                recoveredCount++;
            } catch(e){}
        });

        if (posts.length !== originalCount || recoveredCount > 0) {
            fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2));
        }

        res.json({ 
            success: true, 
            removed: originalCount - posts.length + recoveredCount, 
            recovered: recoveredCount 
        });
    } catch(e) {
        res.status(500).send('Scan failed');
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

function getDeviceTypeFromUA(ua) {
    if (!ua) return 'Unknown';
    ua = ua.toLowerCase();
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac';
    if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('cros')) return 'ChromeOS';
    return 'Other';
}

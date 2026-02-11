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
const RP_ID = 'blog.eightyfor.top'; 
const ORIGIN = 'https://blog.eightyfor.top'; 
console.log('Passkey Config:', { RP_ID, ORIGIN });
const passkeyChallenges = new Map();

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
app.use('/server/data/upload', express.static(UPLOAD_DIR));


// 2. Auth - Passkey
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
            
            // Allow bootstrap if missing
            if (!fs.existsSync(SECURITY_FILE)) {
                const defaultHash = hashPassword('admin');
                fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: defaultHash, devices: [] }));
            }
            
            const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'));
            if (!saved.devices) saved.devices = [];
            
            const { credential } = verification.registrationInfo;
            
            saved.devices.push({
                credentialID: credential.id,
                credentialPublicKey: Buffer.from(credential.publicKey).toString('base64url'),
                counter: credential.counter,
                transports: response.response.transports,
                name: req.query.name || `Passkey (${new Date().toLocaleDateString()})`,
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
                        .map(dirent => ({
                            name: dirent.name,
                            type: 'file',
                            category: cat,
                            path: `${cat}/${dirent.name}`
                        }));
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
            return {
                name: dirent.name,
                type: dirent.isDirectory() ? 'directory' : 'file',
                path: path.relative(UPLOAD_DIR, path.join(targetDir, dirent.name)).replace(/\\/g, '/')
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
        res.json({ success: true });
    } catch (e) {
        res.status(500).send('Error');
    }
});

app.post('/api/upload', (req, res) => {
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

    writeStream.on('finish', () => {
        const webPath = `/server/data/upload/${category}/${randomName}`;
        res.json({ url: webPath, path: webPath, category });
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
                if (data.tags) post.tags = data.tags;
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
                tags: data.tags || [],
                status: status || 'draft'
            };
            posts.push(post);
            data.id = id;
        }

        if (content !== undefined || !data.id) {
            const encryptedContent = encrypt(content || '');
            const targetFilename = (post.status === 'modifying' && post.draftFilename) 
                ? post.draftFilename 
                : post.filename;
            fs.writeFileSync(path.join(POSTS_DIR, targetFilename), encryptedContent);
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

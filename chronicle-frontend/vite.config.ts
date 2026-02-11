import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Connect } from 'vite'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'

// Simple Encryption
const ALGORITHM = 'aes-256-cbc'
// In prod, manage keys securely. Here we derive from a fixed string.
const SECRET_KEY = crypto.scryptSync('chronicle-secret-key-123', 'salt', 32)

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decrypt(text: string): string {
  const [ivHex, encryptedText] = text.split(':')
  if (!ivHex || !encryptedText) return ''
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// Custom plugin for handling uploads and serving files
const backendPlugin = () => ({
  name: 'backend-middleware',
  configureServer(server: any) {
    server.middlewares.use(async (req: Connect.IncomingMessage, res: any, next: Connect.NextFunction) => {
      const BASE_UPLOAD_DIR = path.resolve(process.cwd(), '../server/data/upload')
      const CATEGORIES = ['pic', 'sound', 'txt', 'video', 'doc', 'other'] as const
      
      // Ensure base and category dirs exist
      if (!fs.existsSync(BASE_UPLOAD_DIR)) {
        fs.mkdirSync(BASE_UPLOAD_DIR, { recursive: true })
      }
      CATEGORIES.forEach(cat => {
        const catDir = path.join(BASE_UPLOAD_DIR, cat)
        if (!fs.existsSync(catDir)) fs.mkdirSync(catDir)
      })

      // Helper to parse query parameters
      const urlObj = new URL(req.url || '', 'http://localhost')
      const queryPath = urlObj.searchParams.get('path') || ''

      const SECURITY_FILE = path.resolve(process.cwd(), '../server/data/security.json')
      
      // Passkey Globals
      const RP_ID = 'localhost'
      const ORIGIN = 'http://localhost:5173'
      // Use global to persist across HMR
      if (!(global as any).passkeyChallenges) {
        (global as any).passkeyChallenges = new Map<string, string>()
      }
      const challenges = (global as any).passkeyChallenges as Map<string, string>

      // PASSKEY - Register Options
      if (urlObj.pathname === '/api/auth/passkey/register/options' && req.method === 'POST') {
          // In this simple app, we only have one user: 'admin'.
          // Real app would get user from session/request.
          // We allow registration if authenticated OR if no security file exists (bootstrap).
          
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', async () => {
             const user = 'admin'
             
             // Check if we can register (Authenticated or Setup mode)
             // Simple check: for now we assume client side checks auth, 
             // but effectively anyone with access to this endpoint when logged in can register.
             // (Improvement: check cookie/token here)

             const options = await generateRegistrationOptions({
               rpName: 'Chronicle Blog',
               rpID: RP_ID,
               userID: new Uint8Array(Buffer.from(user)),
               userName: user,
               // valid devices to exclude...
             })
             
             challenges.set(user, options.challenge)
             
             res.setHeader('Content-Type', 'application/json')
             res.end(JSON.stringify(options))
          })
          return
      }

      // PASSKEY - Register Verify
      if (urlObj.pathname === '/api/auth/passkey/register/verify' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', async () => {
              try {
                  const { response } = JSON.parse(body)
                  const user = 'admin'
                  const expectedChallenge = challenges.get(user)
                  
                  if (!expectedChallenge) {
                      res.statusCode = 400; res.end(JSON.stringify({ error: 'No challenge' })); return
                  }

                  const verification = await verifyRegistrationResponse({
                      response,
                      expectedChallenge,
                      expectedOrigin: ORIGIN,
                      expectedRPID: RP_ID,
                  })

                  if (verification.verified && verification.registrationInfo) {
                      challenges.delete(user)
                      
                      // Save to security.json
                      if (!fs.existsSync(SECURITY_FILE)) {
                          // Allow bootstrap
                          const defaultHash = hashPassword('admin')
                          fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: defaultHash, devices: [] }))
                      }
                      
                      const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'))
                      if (!saved.devices) saved.devices = []
                      
                      const { credential } = verification.registrationInfo
                      const { id: credentialID, publicKey: credentialPublicKey, counter } = credential

                      // Check for duplicates? SimpleWebAuthn handles this via options in future, but for now simple push
                      saved.devices.push({
                          credentialID: credentialID,
                          credentialPublicKey: Buffer.from(credentialPublicKey).toString('base64url'),
                          counter,
                          transports: response.response.transports
                      })
                      
                      fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2))
                      
                      res.setHeader('Content-Type', 'application/json')
                      res.end(JSON.stringify({ verified: true }))
                  } else {
                      res.statusCode = 400
                      res.end(JSON.stringify({ verified: false }))
                  }
              } catch (e: any) {
                  console.error(e)
                  res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
              }
          })
          return
      }

      // PASSKEY - Login Options
      if (urlObj.pathname === '/api/auth/passkey/login/options' && req.method === 'POST') {
          const user = 'admin'
          const options = await generateAuthenticationOptions({
               rpID: RP_ID,
               userVerification: 'preferred', // 'preferred' allows devices that support UV but falls back
          })
          challenges.set(user, options.challenge)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(options))
          return
      }

      // PASSKEY - Login Verify
      if (urlObj.pathname === '/api/auth/passkey/login/verify' && req.method === 'POST') {
         let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', async () => {
              try {
                  const { response } = JSON.parse(body)
                  const user = 'admin'
                  const expectedChallenge = challenges.get(user)

                  if (!fs.existsSync(SECURITY_FILE)) {
                      res.statusCode = 400; res.end('No devices registered'); return
                  }
                  const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'))
                  const devices = saved.devices || []
                  
                  // Find the device
                  const device = devices.find((d: any) => d.credentialID === response.id)
                  
                  if (!device) {
                      res.statusCode = 400; res.end('Device not found'); return
                  }

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
                  })

                  if (verification.verified) {
                      challenges.delete(user)
                      // Update counter
                      device.counter = verification.authenticationInfo.newCounter
                      fs.writeFileSync(SECURITY_FILE, JSON.stringify(saved, null, 2))
                      
                      res.setHeader('Content-Type', 'application/json')
                      res.end(JSON.stringify({ verified: true, token: 'session-valid' }))
                  } else {
                       res.statusCode = 400; res.end(JSON.stringify({ verified: false }))
                  }
              } catch(e: any) {
                  console.error(e)
                  res.statusCode = 400; res.end(JSON.stringify({ error: e.message }))
              }
          })
          return
      }

      // Helper to hash password
      const hashPassword = (pwd: string) => {
          return crypto.scryptSync(pwd, 'chronicle-salt', 64).toString('hex')
      }

      // AUTH - Login
      if (urlObj.pathname === '/api/auth/login' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
              try {
                  const { password } = JSON.parse(body)
                  
                  if (!fs.existsSync(SECURITY_FILE)) {
                      // Default to 'admin' if file missing
                      const defaultHash = hashPassword('admin')
                      fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: defaultHash }))
                  }
                  
                  const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'))
                  const attemptHash = hashPassword(password)
                  
                  if (saved.passwordHash === attemptHash) {
                      // Check for 2FA (if devices exist)
                      if (saved.devices && saved.devices.length > 0) {
                          res.setHeader('Content-Type', 'application/json')
                          res.end(JSON.stringify({ success: true, requirePasskey: true }))
                      } else {
                          res.setHeader('Content-Type', 'application/json')
                          res.end(JSON.stringify({ success: true, token: 'session-valid' }))
                      }
                  } else {
                      res.statusCode = 401
                      res.setHeader('Content-Type', 'application/json')
                      res.end(JSON.stringify({ success: false, message: 'Invalid password' }))
                  }
              } catch (e) {
                  console.error(e)
                  res.statusCode = 500
                  res.end('Error')
              }
          })
          return
      }

      // AUTH - Change Password
      if (urlObj.pathname === '/api/auth/change' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
              try {
                  const { oldPassword, newPassword } = JSON.parse(body)
                  
                  if (!fs.existsSync(SECURITY_FILE)) {
                      // First setup
                      const newHash = hashPassword(newPassword)
                      fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: newHash }))
                      res.setHeader('Content-Type', 'application/json')
                      res.end(JSON.stringify({ success: true }))
                      return
                  }

                  const saved = JSON.parse(fs.readFileSync(SECURITY_FILE, 'utf-8'))
                  const oldHash = hashPassword(oldPassword)

                  if (saved.passwordHash === oldHash) {
                      const newHash = hashPassword(newPassword)
                      fs.writeFileSync(SECURITY_FILE, JSON.stringify({ passwordHash: newHash }))
                      res.setHeader('Content-Type', 'application/json')
                      res.end(JSON.stringify({ success: true }))
                  } else {
                      res.statusCode = 401
                      res.setHeader('Content-Type', 'application/json')
                      res.end(JSON.stringify({ success: false, message: 'Old password incorrect' }))
                  }
              } catch(e) {
                   res.statusCode = 500
                   res.end('Error')
              }
          })
          return
      }

      // 1. List Files API (GET /api/files)
      if (urlObj.pathname === '/api/files' && req.method === 'GET') {
        if (queryPath === 'all') {
             let allFiles: any[] = []
             CATEGORIES.forEach(cat => {
                 const catDir = path.join(BASE_UPLOAD_DIR, cat)
                 if (fs.existsSync(catDir)) {
                     try {
                         const files = fs.readdirSync(catDir, { withFileTypes: true })
                            .filter(d => !d.isDirectory())
                            .map(dirent => ({
                                name: dirent.name,
                                type: 'file',
                                category: cat,
                                path: `${cat}/${dirent.name}` // web path relative to upload root
                            }))
                         allFiles = allFiles.concat(files)
                     } catch(e) {}
                 }
             })
             res.setHeader('Content-Type', 'application/json')
             res.end(JSON.stringify(allFiles))
             return
        }

        const targetDir = path.resolve(BASE_UPLOAD_DIR, queryPath.replace(/^\/+/, ''))
        
        // Security check
        if (!targetDir.startsWith(BASE_UPLOAD_DIR)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        if (!fs.existsSync(targetDir)) {
           res.end(JSON.stringify([]))
           return
        }

        try {
          const items = fs.readdirSync(targetDir, { withFileTypes: true }).map(dirent => {
             return {
               name: dirent.name,
               type: dirent.isDirectory() ? 'directory' : 'file',
               path: path.relative(BASE_UPLOAD_DIR, path.join(targetDir, dirent.name)).replace(/\\/g, '/')
             }
          })
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(items))
        } catch (e) {
          res.statusCode = 500
          res.end('Error listing files')
        }
        return
      }

      // 2. Create Directory API (POST /api/folder)
      if (urlObj.pathname === '/api/folder' && req.method === 'POST') {
        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', () => {
          try {
            const { folderPath } = JSON.parse(body || '{}')
            if (!folderPath) throw new Error('Missing folderPath')
            
            const targetPath = path.resolve(BASE_UPLOAD_DIR, folderPath.replace(/^\/+/, ''))
            if (!targetPath.startsWith(BASE_UPLOAD_DIR)) {
               res.statusCode = 403; res.end('Forbidden'); return
            }

            if (!fs.existsSync(targetPath)) {
              fs.mkdirSync(targetPath, { recursive: true })
            }
            res.end(JSON.stringify({ success: true }))
          } catch(e) {
             res.statusCode = 500; res.end('Error creating folder')
          }
        })
        return
      }

      // 3. Delete API (DELETE /api/files)
      if (urlObj.pathname === '/api/files' && req.method === 'DELETE') {
          const targetPath = path.resolve(BASE_UPLOAD_DIR, queryPath.replace(/^\/+/, ''))
          if (!targetPath.startsWith(BASE_UPLOAD_DIR)) {
               res.statusCode = 403; res.end('Forbidden'); return
          }
          try {
            if (fs.existsSync(targetPath)) {
              fs.rmSync(targetPath, { recursive: true, force: true })
            }
            res.end(JSON.stringify({ success: true }))
          } catch (e) {
            res.statusCode = 500; res.end('Error deleting')
          }
          return
      }

      // 4. Upload API (POST /api/upload)
      if (urlObj.pathname === '/api/upload' && req.method === 'POST') {
        const filename = req.headers['x-filename'] as string
        // If x-category is provided, try to use it, otherwise auto-detect
        let category = (req.headers['x-category'] as string) || ''
        
        if (!filename) {
          res.statusCode = 400; res.end('Missing filename'); return
        }
        
        const decodedName = decodeURIComponent(filename)
        const ext = path.extname(decodedName).toLowerCase()

        // Auto-classify if no category provided or invalid
        if (!category || !CATEGORIES.includes(category as any)) {
            if (['.png','.jpg','.jpeg','.gif','.svg','.webp','.ico','.bmp','.tiff'].includes(ext)) category = 'pic'
            else if (['.mp3','.wav','.ogg','.m4a','.flac','.aac'].includes(ext)) category = 'sound'
            else if (['.mp4','.webm','.avi','.mov','.mkv','.wmv'].includes(ext)) category = 'video'
            else if (['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.odt','.ods','.odp','.rtf'].includes(ext)) category = 'doc'
            else if (['.txt','.md','.js','.ts','.html','.css','.json','.py','.java','.c','.cpp','.h','.vue','.xml','.yaml','.yml','.ini','.conf','.sh','.bat','.log','.csv','.rs','.go','.php','.rb','.pl','.swift','.kt','.sql','.r','.m','.make','.dockerfile'].includes(ext)) category = 'txt'
            else category = 'other'
        }

        const categoryDir = path.join(BASE_UPLOAD_DIR, category)
        // Double check existence (though we created them at start)
        if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true })

        // Generate random filename to prevent collisions but keep original name part for reference
        // Format: [timestamp]_[random]_[clean_original_name]
        const cleanName = decodedName.replace(/[^a-zA-Z0-9.\-_]/g, '')
        const randomName = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${cleanName}`
        
        const filePath = path.join(categoryDir, randomName)
        const writeStream = fs.createWriteStream(filePath)

        req.pipe(writeStream)

        writeStream.on('finish', () => {
          res.setHeader('Content-Type', 'application/json')
          // Returns: { url: ..., path: ... }
          // URL should be accessible via the static handler
          const webPath = `/server/data/upload/${category}/${randomName}`
          res.end(JSON.stringify({ url: webPath, path: webPath, category }))
        })

        writeStream.on('error', (err: any) => {
          console.error('Upload error:', err)
          res.statusCode = 500
          res.end('Upload failed')
        })
        return
      }
      
      // 5. Blog Posts API
      // -----------------------------------------------------------
      const POSTS_DIR = path.resolve(process.cwd(), '../server/data/posts')
      const INDEX_FILE = path.join(POSTS_DIR, 'index.json')

      if (!fs.existsSync(POSTS_DIR)) {
        fs.mkdirSync(POSTS_DIR, { recursive: true })
      }
      if (!fs.existsSync(INDEX_FILE)) {
        fs.writeFileSync(INDEX_FILE, '[]')
      }

      // GET /api/posts - Get list sorted by time
      if (urlObj.pathname === '/api/posts' && req.method === 'GET') {
          try {
            const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8')
            let posts = JSON.parse(indexContent || '[]')
            
            // Filter out Drafts if requested? Or standard behavior:
            // "Public" API for BlogList should probably only return 'published'
            // But we need a flag for the editor to fetch all.
            const includeDrafts = urlObj.searchParams.get('includeDrafts') === 'true'
            
            if (!includeDrafts) {
                // Show published, modifying (which count as published for viewers) and legacy posts
                posts = posts.filter((p: any) => p.status === 'published' || p.status === 'modifying' || !p.status)
            }

            // Sort by date desc (newest first)
            posts.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(posts))
          } catch(e) {
            res.statusCode = 500
            res.end('[]')
          }
          return
      }

      // GET /api/post?id=xxx - Get single post content
      if (urlObj.pathname === '/api/post' && req.method === 'GET') {
           const id = urlObj.searchParams.get('id')
           const mode = urlObj.searchParams.get('mode') // 'edit' or undefined
           if (!id) { res.statusCode = 400; res.end('Missing ID'); return }

           try {
             // Reload index to ensure sync
             const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8')
             const posts = JSON.parse(indexContent || '[]')
             const post = posts.find((p: any) => p.id === id)

             if (!post) { res.statusCode = 404; res.end('Post not found'); return }

             // Determine which file to read
             let targetFilename = post.filename
             if (mode === 'edit' && post.status === 'modifying' && post.draftFilename) {
                 targetFilename = post.draftFilename
             }

             const mdPath = path.join(POSTS_DIR, targetFilename)
             let content = ''
             if (fs.existsSync(mdPath)) {
                 const raw = fs.readFileSync(mdPath, 'utf-8')
                 // Try decrypt
                 try {
                     content = decrypt(raw)
                 } catch(err) {
                     // Fallback in case of old non-encrypted files
                     content = raw
                 }
             }
             res.setHeader('Content-Type', 'application/json')
             res.end(JSON.stringify({ ...post, content }))
           } catch(e) {
               console.error(e)
               res.statusCode = 500; res.end('Error')
           }
           return
      }

      // POST /api/restore - Restore original published version (discard draft)
      if (urlObj.pathname === '/api/restore' && req.method === 'POST') {
          const id = urlObj.searchParams.get('id')
          if (!id) { res.statusCode = 400; res.end('Missing ID'); return }

          try {
             const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8')
             const posts = JSON.parse(indexContent || '[]')
             const post = posts.find((p: any) => p.id === id)

             if (post && post.status === 'modifying' && post.draftFilename) {
                 // Delete draft file
                 const draftPath = path.join(POSTS_DIR, post.draftFilename)
                 if (fs.existsSync(draftPath)) {
                     fs.unlinkSync(draftPath)
                 }
                 
                 // Update metadata
                 post.status = 'published'
                 delete post.draftFilename // remove reference
                 
                 fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2))
             }
             
             res.end(JSON.stringify({ success: true }))
          } catch(e) {
              res.statusCode = 500
              res.end('Error restoring')
          }
          return
      }

      // POST /api/post - Save/Update post
      if (urlObj.pathname === '/api/post' && req.method === 'POST') {
          let body = ''
          req.on('data', chunk => body += chunk)
          req.on('end', () => {
             try {
                 const data = JSON.parse(body)
                 if (!data.title) {
                     res.statusCode = 400; res.end('Missing title'); return;
                 }

                 let posts: any[] = []
                 try {
                    const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8')
                    posts = JSON.parse(indexContent || '[]')
                 } catch (e) {}

                 let post;
                 const now = new Date().toISOString()
                 const content = data.content // undefined if not provided
                 const status = data.status // undefined if not provided

                 if (data.id) {
                     // Update existing
                     post = posts.find((p: any) => p.id === data.id)
                     if (post) {
                         post.title = data.title || post.title
                         if (content !== undefined) {
                            post.summary = content.slice(0, 200).replace(/[#*`\[\]]/g, '')
                         }
                         
                         // Handle Modifying Logic
                         if (status === 'modifying') {
                             if (!post.draftFilename) {
                                  post.draftFilename = `${post.id}_draft.md`
                             }
                             post.status = 'modifying'
                         } else if (status === 'published') {
                             // Publishing: Clear draft if exists
                             if (post.draftFilename) {
                                 const draftPath = path.join(POSTS_DIR, post.draftFilename)
                                 if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath)
                                 delete post.draftFilename
                             }
                             post.status = 'published'
                         } else if (status) {
                             // Regular draft or other
                             post.status = status
                         }

                         if (data.tags) post.tags = data.tags
                         post.updatedAt = now
                     }
                 }

                 if (!post) {
                     // Create new
                     // Use crypto.randomUUID if available, else fallback
                     const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)
                     const filename = `${id}.md`
                     post = {
                         id,
                         title: data.title,
                         date: now,
                         updatedAt: now,
                         filename,
                         summary: (content || '').slice(0, 200).replace(/[#*`\[\]]/g, ''),
                         tags: data.tags || [],
                         status: status || 'draft'
                     }
                     posts.push(post)
                     data.id = id
                 }

                 // Encrypt content before writing (ONLY if content provided OR it's a new post)
                 if (content !== undefined || !data.id) {
                     const encryptedContent = encrypt(content || '')
                     
                     // Decide where to write
                     const targetFilename = (post.status === 'modifying' && post.draftFilename) 
                        ? post.draftFilename 
                        : post.filename
                     
                     fs.writeFileSync(path.join(POSTS_DIR, targetFilename), encryptedContent)
                 }

                 // Save Index
                 fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2))

                 res.setHeader('Content-Type', 'application/json')
                 res.end(JSON.stringify({ success: true, id: post.id }))

             } catch(e) {
                 console.error(e)
                 res.statusCode = 500
                 res.end('Error saving post')
             }
          })
          return
      }

      // DELETE /api/post
      if (urlObj.pathname === '/api/post' && req.method === 'DELETE') {
          const id = urlObj.searchParams.get('id')
          if (!id) { res.statusCode = 400; res.end('ID required'); return }
          
          try {
             const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8')
             let posts = JSON.parse(indexContent || '[]')
             const post = posts.find((p: any) => p.id === id)

             if (post) {
                 // Delete file
                 const mdPath = path.join(POSTS_DIR, post.filename)
                 if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath)
                 
                 // Update index
                 posts = posts.filter((p: any) => p.id !== id)
                 fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2))
             }
             res.end(JSON.stringify({ success: true }))
          } catch(e) {
              res.statusCode = 500; res.end('Error')
          }
          return
      }
      
      // SCAN /api/scan
      if (urlObj.pathname === '/api/scan' && req.method === 'POST') {
          try {
             // 1. Read Index
             let posts: any[] = []
             try {
                const indexContent = fs.readFileSync(INDEX_FILE, 'utf-8')
                posts = JSON.parse(indexContent || '[]')
             } catch (e) {}
             
             // 2. Read Directory
             const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'))
             const fileSet = new Set(files)

             // 3. Remove index entries for missing files
             const originalCount = posts.length
             posts = posts.filter((p: any) => fileSet.has(p.filename))
             
             // 4. Find orphans
             const indexedFiles = new Set(posts.map((p: any) => p.filename))
             const orphans = files.filter(f => !indexedFiles.has(f))

             // 5. Add orphans
             let recoveredCount = 0
             orphans.forEach(filename => {
                 try {
                     const raw = fs.readFileSync(path.join(POSTS_DIR, filename), 'utf-8')
                     let content = raw
                     try { content = decrypt(raw) } catch(e) {}
                     
                     const stats = fs.statSync(path.join(POSTS_DIR, filename))
                     const id = filename.replace('.md', '')
                     
                     posts.push({
                         id,
                         title: `Recovered: ${id}`,
                         date: stats.birthtime || new Date(),
                         filename,
                         summary: content.slice(0, 100).replace(/[#*`\[\]]/g, ''),
                         tags: ['recovered'],
                         status: 'draft'
                     })
                     recoveredCount++
                 } catch(e) {}
             })

             // 6. Save
             if (posts.length !== originalCount || recoveredCount > 0) {
                 fs.writeFileSync(INDEX_FILE, JSON.stringify(posts, null, 2))
             }

             res.end(JSON.stringify({ 
                 success: true, 
                 removed: originalCount - posts.length + recoveredCount, // This math is slightly off if we removed and added, but sufficient
                 recovered: recoveredCount 
             }))

          } catch(e) {
              console.error(e)
              res.statusCode = 500; res.end('Scan failed')
          }
          return
      }

      // Static File Serving Handler
      if (req.url && req.url.startsWith('/server/data/upload/')) {
          const urlPath = req.url.split('?')[0] // remove query string
          const relPath = urlPath.replace('/server/data/upload/', '')
          const safeSuffix = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '')
          
          const filePath = path.join(BASE_UPLOAD_DIR, safeSuffix)

          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const stream = fs.createReadStream(filePath)
            // Basic mime types
            if (filePath.endsWith('.png')) res.setHeader('Content-Type', 'image/png')
            else if (filePath.match(/\.jpe?g$/)) res.setHeader('Content-Type', 'image/jpeg')
            else if (filePath.endsWith('.gif')) res.setHeader('Content-Type', 'image/gif')
            else if (filePath.endsWith('.svg')) res.setHeader('Content-Type', 'image/svg+xml')
            
            stream.pipe(res)
            return
          }
      }

      next()
    })
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), backendPlugin()],
  server: {
    fs: {
      strict: false
    }
  }
})

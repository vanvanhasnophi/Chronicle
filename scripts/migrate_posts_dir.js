const fs = require('fs')
const path = require('path')

const BASE = path.join(__dirname, '..')
const POSTS_DIR = path.join(BASE, 'server', 'data', 'posts')
const INDEX_FILE = path.join(POSTS_DIR, 'index.json')

function safeReadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8') || '[]') } catch(e) { return [] }
}

function safeWriteJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8')
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function migrate() {
  if (!fs.existsSync(POSTS_DIR)) {
    console.error('Posts dir not found:', POSTS_DIR)
    process.exit(1)
  }
  if (!fs.existsSync(INDEX_FILE)) {
    console.error('Index file not found:', INDEX_FILE)
    process.exit(1)
  }

  const posts = safeReadJSON(INDEX_FILE)
  let changed = false

  posts.forEach(post => {
    const id = post.id
    if (!id) return
    const dir = path.join(POSTS_DIR, String(id))
    ensureDir(dir)

    // candidates in root posts dir
    const legacyNames = []
    if (post.filename) legacyNames.push(post.filename)
    // common legacy patterns
    legacyNames.push(`${id}-content.md`)
    legacyNames.push(`${id}.md`)
    legacyNames.push(`${id}-draft.md`)

    // Move first existing legacy file (published)
    let movedPublished = false
    for (const name of legacyNames) {
      const src = path.join(POSTS_DIR, name)
      if (fs.existsSync(src) && fs.statSync(src).isFile()) {
        const dest = path.join(dir, `${id}-content.md`)
        try {
          fs.renameSync(src, dest)
          console.log(`Moved published: ${src} -> ${dest}`)
          movedPublished = true
          changed = true
          break
        } catch (e) {
          console.error('Failed moving published file', src, e)
        }
      }
    }

    // Move draft if exists (legacy draft filename may be stored as draftFilename)
    const draftCandidates = []
    if (post.draftFilename) draftCandidates.push(post.draftFilename)
    draftCandidates.push(`${id}-draft.md`)
    draftCandidates.push(`${id}-content-draft.md`)

    for (const name of draftCandidates) {
      const src = path.join(POSTS_DIR, name)
      if (fs.existsSync(src) && fs.statSync(src).isFile()) {
        const dest = path.join(dir, `${id}-draft.md`)
        try {
          fs.renameSync(src, dest)
          console.log(`Moved draft: ${src} -> ${dest}`)
          changed = true
          break
        } catch (e) {
          console.error('Failed moving draft file', src, e)
        }
      }
    }

    // Update post metadata to use dir
    if (post.dir !== String(id)) {
      post.dir = String(id)
      changed = true
    }
    if (post.filename) {
      delete post.filename
      changed = true
    }
    if (post.draftFilename) {
      delete post.draftFilename
      changed = true
    }
  })

  if (changed) {
    safeWriteJSON(INDEX_FILE, posts)
    console.log('Updated index.json with per-post directories')
  } else {
    console.log('No changes detected; index.json left unchanged')
  }
}

migrate()

/**
 * useCloudRelay — Cloud I/O 面（纯函数，零业务逻辑）
 *
 * 编辑器与 Chronicle Host 之间的所有 HTTP + localStorage 通道。
 * 不预设 editorType，不拆包 content，不区分 article/slides。
 *
 * 职责：
 *   1. 文章 CRUD — allocateId, fetchPost, savePost, fetchAbout, saveAbout
 *   2. 草稿管理 — saveDraft, getDraft, clearDraft（localStorage）
 *   3. 认证 — getAuthToken（localStorage）
 *   4. 构建 — triggerAstroBuild
 *   5. 媒体 — uploadFile, fetchServerFiles
 */

import { triggerBuild } from '../../useAstroBuild'

// ══════════════════════════════════════════════════════
// 类型
// ══════════════════════════════════════════════════════

export interface DraftMeta {
  title: string
  tags: string[]
  author: string
  date?: string
  aiGenerated: boolean
  font?: string
  slideshow?: Record<string, any>
}

export interface ServerFile {
  name: string
  url: string
  path: string
  thumb: string
}

export interface BuildOptions {
  source: string
  postId: string
  t: (key: string) => string
}

// ══════════════════════════════════════════════════════
// 文章 CRUD
// ══════════════════════════════════════════════════════

/** 分配一个新的云端文章 ID */
export async function allocateId(fetchWithAuth: any): Promise<string | null> {
  try {
    const res = await fetchWithAuth('/api/post/allocate-id', { method: 'POST' })
    const data = res.ok ? await res.json() : null
    return data?.id || null
  } catch { return null }
}

/** 获取云端文章详情（编辑模式） */
export async function fetchPost(fetchWithAuth: any, id: string): Promise<Record<string, any> | null> {
  try {
    const res = await fetchWithAuth(`/api/post?id=${id}&mode=edit&t=${Date.now()}`)
    return res.ok ? await res.json() : null
  } catch { return null }
}

/** 获取云端文章列表（含草稿） */
export async function fetchPostList(fetchWithAuth: any): Promise<Record<string, any>[]> {
  try {
    const res = await fetchWithAuth(`/api/posts?includeDrafts=true&t=${Date.now()}`)
    return res.ok ? await res.json() : []
  } catch { return [] }
}

/** 验证云端文章 ID 有效性。返回 { valid, reason } 或 null */
export async function validateId(
  fetchWithAuth: any,
  id: string,
): Promise<{ valid: boolean; reason?: string } | null> {
  try {
    const res = await fetchWithAuth('/api/post/validate-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    return res.ok ? await res.json() : null
  } catch { return null }
}

/**
 * 保存文章到云端。
 * 只传三个字段：id、content（完整 .md 含 YAML）、status。
 * 不传 type/font/tags/slideshow——已在 content 的 frontmatter 里。
 */
export async function savePost(
  fetchWithAuth: any,
  payload: { id?: string; content: string; status: string },
): Promise<Record<string, any> | null> {
  try {
    const res = await fetchWithAuth(`/api/post?t=${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.ok ? await res.json() : null
  } catch { return null }
}

/** 获取关于页 */
export async function fetchAbout(fetchWithAuth: any): Promise<{ content: string; lastModified: string } | null> {
  try {
    const res = await fetchWithAuth('/api/admin/about')
    return res.ok ? await res.json() : null
  } catch { return null }
}

/** 保存关于页 */
export async function saveAbout(fetchWithAuth: any, content: string): Promise<boolean> {
  try {
    const res = await fetchWithAuth('/api/admin/about', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    return res.ok
  } catch { return false }
}

// ══════════════════════════════════════════════════════
// 本地草稿（localStorage）
// ══════════════════════════════════════════════════════

function draftKey(id: string) { return `chronicle_draft_${id}` }
function draftMetaKey(id: string) { return `chronicle_draft_meta_${id}` }
function historyKey(id: string) { return `chronicle_history_${id}` }

export function saveDraft(id: string, content: string, meta: DraftMeta): void {
  try {
    localStorage.setItem(draftKey(id), content)
    localStorage.setItem(draftMetaKey(id), JSON.stringify(meta))
  } catch {}
}

export function getDraft(id: string): { content: string; meta: DraftMeta } | null {
  try {
    const content = localStorage.getItem(draftKey(id))
    if (!content) return null
    const metaRaw = localStorage.getItem(draftMetaKey(id))
    const meta: DraftMeta = metaRaw ? JSON.parse(metaRaw) : { title: '', tags: [], author: '', date: '', aiGenerated: false, font: 'sans', slideshow: {} }
    return { content, meta }
  } catch { return null }
}

export function clearDraft(id: string): void {
  try {
    localStorage.removeItem(draftKey(id))
    localStorage.removeItem(draftMetaKey(id))
  } catch {}
}

export function saveHistory(id: string, history: Record<string, any>): void {
  try { sessionStorage.setItem(historyKey(id), JSON.stringify(history)) } catch {}
}

export function getHistory(id: string): Record<string, any> | null {
  try {
    const raw = sessionStorage.getItem(historyKey(id))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function clearHistory(id: string): void {
  try { sessionStorage.removeItem(historyKey(id)) } catch {}
}

// ══════════════════════════════════════════════════════
// 认证
// ══════════════════════════════════════════════════════

const AUTH_KEY = 'chronicle_auth'

export function getAuthToken(): string {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    return typeof parsed?.token === 'string' ? parsed.token : ''
  } catch { return '' }
}

// ══════════════════════════════════════════════════════
// 构建
// ══════════════════════════════════════════════════════

export async function triggerAstroBuild(opts: BuildOptions): Promise<boolean> {
  try {
    await triggerBuild({ source: opts.source, postId: opts.postId, t: opts.t })
    return true
  } catch {
    return false
  }
}

// ══════════════════════════════════════════════════════
// 媒体上传
// ══════════════════════════════════════════════════════

export async function uploadFile(
  fetchWithAuth: any,
  file: File,
  apiBaseUrl?: string,
): Promise<string | null> {
  try {
    const encodedName = encodeURIComponent(file.name)
    const uploadUrl = apiBaseUrl
      ? `${apiBaseUrl.replace(/\/$/, '')}/api/upload`
      : '/api/upload'
    const res = await fetchWithAuth(`${uploadUrl}?t=${Date.now()}`, {
      method: 'POST',
      headers: { 'x-filename': encodedName },
      body: file,
    })
    if (!res.ok) throw new Error('upload failed')
    const j = await res.json()
    return j && j.url ? j.url : null
  } catch (e) {
    console.error('[useCloudRelay] uploadFile failed', e)
    return null
  }
}

export async function fetchServerFiles(
  fetchWithAuth: any,
  path: string,
): Promise<ServerFile[]> {
  try {
    const res = await fetchWithAuth(`/api/files?path=${encodeURIComponent(path)}&t=${Date.now()}`)
    if (!res.ok) return []
    const items = await res.json()
    return (items as any[])
      .filter((i: any) => i.type === 'file')
      .map((i: any) => ({
        name: i.name,
        url: i.url || `/server/data/upload/${i.path}`,
        path: i.url || `/server/data/upload/${i.path}`,
        thumb: (i.url || `/server/data/upload/${i.path}`).replace(
          '/server/data/upload/',
          '/server/data/upload/.thumbs/',
        ),
      }))
  } catch (e) {
    console.error('[useCloudRelay] fetchServerFiles failed', e)
    return []
  }
}

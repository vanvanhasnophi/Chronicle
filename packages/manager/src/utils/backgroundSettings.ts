export type BackgroundScope = 'frontend' | 'backend'

export interface NormalizedBackgroundSetting {
  url: string
  path: string
  sourcePath: string
  sourceName: string
  generatedPath: string
  generatedName: string
  compression: number
  compressionFactor: number
  [key: string]: any
}

function stripQueryHash(value: string) {
  return String(value || '').split('?')[0].split('#')[0]
}

function isAbsoluteMediaUrl(value: any) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

export function normalizeUploadRelPath(value: any) {
  const raw = stripQueryHash(String(value || '')).trim()
  if (!raw) return ''

  let pathPart = raw
  try {
    if (/^https?:\/\//i.test(raw)) {
      pathPart = new URL(raw).pathname || raw
    }
  } catch (e) { }

  pathPart = stripQueryHash(String(pathPart || '')).trim()
  if (!pathPart) return ''

  const prefix = '/server/data/upload/'
  if (pathPart.startsWith(prefix)) pathPart = pathPart.slice(prefix.length)
  else if (pathPart.startsWith('/server/data/manager-background/')) pathPart = pathPart.slice('/server/data/manager-background/'.length)
  else if (pathPart.startsWith('/server/data/branding/')) pathPart = pathPart.slice('/server/data/branding/'.length)
  else if (pathPart.startsWith('/server/data/background/')) pathPart = pathPart.slice('/server/data/background/'.length)
  else if (pathPart.startsWith('/')) pathPart = pathPart.slice(1)

  pathPart = pathPart.replace(/^\/+/, '')
  if (pathPart.startsWith('manager-background/')) pathPart = pathPart.slice('manager-background/'.length)
  if (pathPart.startsWith('branding/')) pathPart = pathPart.slice('branding/'.length)
  if (pathPart.startsWith('background/')) pathPart = pathPart.slice('background/'.length)
  if (pathPart.startsWith('server/data/upload/')) pathPart = pathPart.slice('server/data/upload/'.length)
  if (pathPart.startsWith('server/data/manager-background/')) pathPart = pathPart.slice('server/data/manager-background/'.length)
  if (pathPart.startsWith('server/data/branding/')) pathPart = pathPart.slice('server/data/branding/'.length)
  if (pathPart.startsWith('server/data/background/')) pathPart = pathPart.slice('server/data/background/'.length)
  if (pathPart.startsWith('..')) return ''
  return pathPart
}

export function backgroundRelToUrl(rel: any) {
  if (isAbsoluteMediaUrl(rel)) return String(rel || '').trim()
  const normalized = normalizeUploadRelPath(rel)
  if (!normalized) return ''
  const isElec = typeof window !== 'undefined' && !!(window as any).chronicleElectron?.isElectron
  // In Electron (file:// protocol), resolve against the media origin
  // (server-declared via /api/admin/status) or API server URL.
  // In browser deployments, use window.location.origin — the Vite dev proxy
  // or same-origin server handles relative URLs natively.
  const origin = isElec
    ? getMediaOrigin()
    : (typeof window !== 'undefined' && window.location ? window.location.origin : '')
  const fileName = normalized.split('/').pop() || '';
  // chr_b_bg-* → manager-background (CMS), chr_f_bg-* → branding (frontend)
  if (/^chr_b_bg-/i.test(fileName) || normalized.startsWith('manager-background/')) {
    const base = '/server/data/manager-background/';
    return origin ? `${origin}${base}${normalized}` : `${base}${normalized}`;
  }
  const base = normalized.startsWith('branding/') || normalized.startsWith('background/') || /^chr_f_bg-/i.test(fileName)
    ? '/server/data/branding/'
    : '/server/data/upload/'
  return origin ? `${origin}${base}${normalized}` : `${base}${normalized}`
}

/**
 * Resolve a root-relative media URL (e.g. /server/data/…) against the API server
 * when running in Electron (file:// protocol) or standalone mode. In browser
 * deployments, relative URLs are returned as-is — the Vite dev proxy or same-origin
 * server handles them.
 *
 * Use this for CSS background-image, <img src>, and other display paths that go
 * through the browser's resource loader (NOT through fetch()).
 */
export function resolveMediaUrl(url: string): string {
  if (!url || /^https?:\/\//i.test(url)) return url
  if (!url.startsWith('/')) return url
  const isElec = typeof window !== 'undefined' && !!(window as any).chronicleElectron?.isElectron
  if (!isElec) return url
  const baseUrl = getMediaOrigin()
  return baseUrl ? `${baseUrl}${url}` : url
}

/**
 * Resolve the media origin (scheme + host) for resolving relative media URLs.
 *
 * Priority:
 * 1. chronicle_media_url — server-declared via /api/admin/status (useServerUrl)
 * 2. __CHRONICLE_MEDIA_BASE_URL__ — build-time VITE_CDN_BASE_URL / VITE_MEDIA_DOMAIN
 * 3. chronicle_api_url — user-configured API server (also serves static files)
 * 4. VITE_API_BASE_URL — build-time API base URL
 * 5. http://localhost:3000 — Electron default (user hasn't configured anything yet)
 */
export function getMediaOrigin(): string {
  // 1. Server-declared media domain (from useServerUrl.verify() → localStorage)
  const mediaUrl = (() => { try { return localStorage.getItem('chronicle_media_url') || '' } catch { return '' } })()
  if (mediaUrl) return mediaUrl.replace(/\/$/, '')

  // 2. Build-time CDN / media domain
  try {
    const globalMedia = (window as any).__CHRONICLE_MEDIA_BASE_URL__
    if (globalMedia && typeof globalMedia === 'string') return globalMedia.replace(/\/$/, '')
  } catch (e) { }

  // 3. User-configured API server (also serves /server/data/… static files)
  const apiUrl = (() => { try { return localStorage.getItem('chronicle_api_url') || '' } catch { return '' } })()
  if (apiUrl) return apiUrl.replace(/\/$/, '')

  // 4. Build-time API base URL
  const buildApiUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim()
  if (buildApiUrl) return buildApiUrl

  // 5. Electron default (no URL configured yet)
  const isElec = typeof window !== 'undefined' && !!(window as any).chronicleElectron?.isElectron
  if (isElec) return 'http://localhost:3000'

  return ''
}

export function isBackgroundGeneratedRel(rel: any, scope: BackgroundScope) {
  const normalized = normalizeUploadRelPath(rel)
  if (!normalized) return false
  const base = normalized.split('/').pop() || ''
  const prefix = scope === 'frontend' ? 'chr_f_bg-' : 'chr_b_bg-'
  return base.startsWith(prefix) && base.endsWith('.webp')
}

function getCompressionFromMeta(meta: any) {
  if (!meta) return 1
  const explicitCandidates = [meta.compressionFactor, meta.compression, meta.bgCompression, meta.scale]
  for (const value of explicitCandidates) {
    const num = Number(value)
    if (Number.isFinite(num) && num > 0) return Math.min(30, num)
  }

  return 1
}

export function normalizeBackgroundRecord(raw: any, scope: BackgroundScope): NormalizedBackgroundSetting | null {
  if (!raw) return null

  if (typeof raw === 'string') {
    const rel = normalizeUploadRelPath(raw)
    if (!rel) return null
    const generated = isBackgroundGeneratedRel(rel, scope) ? rel : ''
    const source = generated ? rel : rel
    return {
      url: isAbsoluteMediaUrl(raw) ? String(raw).trim() : backgroundRelToUrl(rel) || raw,
      path: rel,
      sourcePath: source,
      sourceName: rel.split('/').pop() || '',
      generatedPath: generated,
      generatedName: generated.split('/').pop() || '',
      compression: 1,
      compressionFactor: 1,
    }
  }

  const pathValue = normalizeUploadRelPath(raw.path || raw.url || raw.generatedPath || '')
  const sourcePath = normalizeUploadRelPath(raw.sourcePath || raw.originalPath || raw.sourceUrl || raw.source || raw.path || raw.url || '')
  const generatedPath = normalizeUploadRelPath(raw.generatedPath || raw.outputPath || raw.path || raw.url || '')
  const sourceName = raw.sourceName || raw.name || (sourcePath ? sourcePath.split('/').pop() : (generatedPath ? generatedPath.split('/').pop() : ''))
  const compression = getCompressionFromMeta(raw)

  return {
    ...raw,
    url: raw.url && String(raw.url).trim()
      ? (isAbsoluteMediaUrl(raw.url) ? String(raw.url).trim() : backgroundRelToUrl(pathValue || generatedPath || sourcePath))
      : backgroundRelToUrl(pathValue || generatedPath || sourcePath),
    path: pathValue || generatedPath || sourcePath || '',
    sourcePath: sourcePath || generatedPath || pathValue || '',
    sourceName,
    generatedPath: generatedPath || '',
    generatedName: raw.generatedName || (generatedPath ? generatedPath.split('/').pop() || '' : ''),
    compression,
    compressionFactor: compression,
  }
}

export function resolveBackgroundUrl(raw: any, scope: BackgroundScope) {
  if (!raw) return ''
  if (typeof raw === 'string') return isAbsoluteMediaUrl(raw) ? String(raw).trim() : backgroundRelToUrl(raw) || raw
  return normalizeBackgroundRecord(raw, scope)?.url || ''
}

export function resolveBackgroundSourcePath(raw: any, scope: BackgroundScope) {
  return normalizeBackgroundRecord(raw, scope)?.sourcePath || ''
}

export function resolveBackgroundSourceName(raw: any, scope: BackgroundScope) {
  return normalizeBackgroundRecord(raw, scope)?.sourceName || ''
}

/**
 * Build a fallback URL for the same path against the API server origin.
 * Used when the primary URL (e.g. media CDN) fails to load — retry against
 * the API server which also serves /server/data/… static files.
 *
 * Returns empty string if the URL is already pointing to the API server
 * (no point falling back to the same origin), or if no API server URL is known.
 */
export function buildApiFallbackUrl(mediaUrl: string): string {
  if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) return ''
  try {
    const u = new URL(mediaUrl)
    const apiUrl = (() => { try { return localStorage.getItem('chronicle_api_url') || '' } catch { return '' } })()
    if (!apiUrl) return ''
    const apiOrigin = apiUrl.replace(/\/$/, '')
    // If the URL is already on the API server origin, no fallback needed
    if (u.origin === new URL(apiOrigin).origin) return ''
    // Same path, different origin
    return `${apiOrigin}${u.pathname}${u.search}${u.hash}`
  } catch (e) { return '' }
}

export function resolveBackgroundCompression(raw: any, scope: BackgroundScope) {
  return normalizeBackgroundRecord(raw, scope)?.compression || 1
}

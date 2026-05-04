export type BackgroundScope = 'frontend' | 'backend'

export interface NormalizedBackgroundSetting {
  url: string
  path: string
  sourcePath: string
  sourceName: string
  originalName: string
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
  else if (pathPart.startsWith('/server/data/background/')) pathPart = pathPart.slice('/server/data/background/'.length)
  else if (pathPart.startsWith('/')) pathPart = pathPart.slice(1)

  pathPart = pathPart.replace(/^\/+/, '')
  if (pathPart.startsWith('background/')) pathPart = pathPart.slice('background/'.length)
  if (pathPart.startsWith('server/data/upload/')) pathPart = pathPart.slice('server/data/upload/'.length)
  if (pathPart.startsWith('server/data/background/')) pathPart = pathPart.slice('server/data/background/'.length)
  if (pathPart.startsWith('..')) return ''
  return pathPart
}

export function backgroundRelToUrl(rel: any) {
  if (isAbsoluteMediaUrl(rel)) return String(rel || '').trim()
  const normalized = normalizeUploadRelPath(rel)
  if (!normalized) return ''
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : ''
  const base = normalized.startsWith('background/') || /^chr_[fb]_bg-/i.test(normalized.split('/').pop() || '')
    ? '/server/data/background/'
    : '/server/data/upload/'
  return origin ? `${origin}${base}${normalized}` : `${base}${normalized}`
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
      originalName: rel.split('/').pop() || '',
      generatedPath: generated,
      generatedName: generated.split('/').pop() || '',
      compression: 1,
      compressionFactor: 1,
    }
  }

  const pathValue = normalizeUploadRelPath(raw.path || raw.url || raw.generatedPath || '')
  const sourcePath = normalizeUploadRelPath(raw.sourcePath || raw.originalPath || raw.sourceUrl || raw.source || raw.path || raw.url || '')
  const generatedPath = normalizeUploadRelPath(raw.generatedPath || raw.outputPath || raw.path || raw.url || '')
  const sourceName = raw.sourceName || raw.originalName || raw.name || (sourcePath ? sourcePath.split('/').pop() : (generatedPath ? generatedPath.split('/').pop() : ''))
  const compression = getCompressionFromMeta(raw)

  return {
    ...raw,
    url: raw.url && String(raw.url).trim() ? String(raw.url).trim() : backgroundRelToUrl(pathValue || generatedPath || sourcePath),
    path: pathValue || generatedPath || sourcePath || '',
    sourcePath: sourcePath || generatedPath || pathValue || '',
    sourceName,
    originalName: sourceName,
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

export function resolveBackgroundCompression(raw: any, scope: BackgroundScope) {
  return normalizeBackgroundRecord(raw, scope)?.compression || 1
}

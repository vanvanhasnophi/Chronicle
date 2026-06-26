/**
 * Chronicle Manager — Authenticated Fetch Wrapper
 *
 * - Attaches x-chronicle-auth header automatically
 * - Rewrites legacy /api/* → /api/admin/*
 * - Auto-unwraps Chronicle API envelope { code, data, message } → data
 * - Emits status notifications for 401/503 via notification center
 */

import { getNotificationCenter } from '../composables/useNotificationCenter'
import { i18n } from '../main'

export interface ChronicleResponse extends Response {
  json(): Promise<any>
}

export const fetchWithAuth = async (
  url: string | URL | Request,
  options: RequestInit = {},
): Promise<ChronicleResponse> => {
  const token = localStorage.getItem('chronicle_auth') || ''
  const headers = new Headers(options.headers || {})
  if (token && !headers.has('x-chronicle-auth')) {
    headers.set('x-chronicle-auth', token)
  }

  // Rewrite legacy /api/* → /api/admin/*
  let finalUrl: string | URL | Request = url
  if (
    typeof url === 'string' &&
    url.startsWith('/api/') &&
    !url.startsWith('/api/admin/') &&
    !url.startsWith('/api/public/')
  ) {
    finalUrl = url.replace('/api/', '/api/admin/')
  }

  const response = await fetch(finalUrl, { ...options, headers })

  // 401 guard: redirect to login on production pages.
  // Auth-related pages are exempt — they handle auth failures themselves.
  const AUTH_EXEMPT_PATHS = ['/login', '/setup', '/recover', '/editor', '/']
  if (response.status === 401) {
    const currentPath = window.location.pathname + window.location.search
    const isExempt = AUTH_EXEMPT_PATHS.some(p =>
      currentPath === p || (p !== '/' && currentPath.startsWith(p))
    )
    if (!isExempt) {
      try {
        const t = i18n.global.t as any
        getNotificationCenter().dispatch({
          kind: 'status',
          level: 'warning',
          title: t('notification.sessionExpired'),
          message: t('notification.sessionExpiredMsg'),
          _key: 'session-expired',
        })
      } catch { /* notification center may not be ready */ }
      localStorage.removeItem('chronicle_auth')
      // Electron (file:// protocol) must use hash-based routing, otherwise
      // `/login` resolves to a non-existent `file:///C:/login` filesystem path.
      const isFileProtocol = window.location.protocol === 'file:'
      const loginUrl = isFileProtocol
        ? `${window.location.pathname}#/login?next=${encodeURIComponent(currentPath)}`
        : `/login?next=${encodeURIComponent(currentPath)}`
      window.location.href = loginUrl
      throw new Error('Session expired — redirecting to login')
    }
  }

  // 503 guard: server unavailable — notify but don't redirect
  if (response.status === 503) {
    try {
      const t = i18n.global.t as any
      getNotificationCenter().dispatch({
        kind: 'status',
        level: 'warning',
        title: t('notification.serverUnavailable'),
        message: t('notification.serverUnavailableMsg'),
        _key: 'server-unavailable',
      })
    } catch { /* notification center may not be ready */ }
  }

  // Patch .json() to auto-unwrap { code, data, message } envelope
  const origJson = response.json.bind(response)
  ;(response as ChronicleResponse).json = async () => {
    const raw = await origJson().catch(() => null)
    if (raw && typeof raw === 'object' && 'code' in raw && 'data' in raw) {
      if (raw.code >= 400) {
        const err = new Error(raw.message || `HTTP ${raw.code}`) as any
        err.code = raw.code
        err.data = raw.data
        throw err
      }
      return raw.data
    }
    return raw
  }

  return response as ChronicleResponse
}

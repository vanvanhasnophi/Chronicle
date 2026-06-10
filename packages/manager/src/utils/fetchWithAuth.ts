/**
 * Chronicle Manager — Authenticated Fetch Wrapper
 *
 * - Attaches x-chronicle-auth header automatically
 * - Rewrites legacy /api/* → /api/admin/*
 * - Auto-unwraps Chronicle API envelope { code, data, message } → data
 */

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
      localStorage.removeItem('chronicle_auth')
      window.location.href = `/login?next=${encodeURIComponent(currentPath)}`
      throw new Error('Session expired — redirecting to login')
    }
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

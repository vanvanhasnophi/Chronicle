export function _normalizeLocale(locale?: string) {
  if (!locale) {
    try {
      if (typeof window !== 'undefined') return navigator.language || 'en-US'
    } catch (e) {}
    return 'en-US'
  }
  // i18n locale may be like 'zh-CN' or 'zh' — Intl accepts these
  return String(locale)
}

export function formatDate(isoStr?: string | null, locale?: string) {
  if (!isoStr) return ''
  const loc = _normalizeLocale(locale)
  try {
    return new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(isoStr))
  } catch (e) {
    return new Date(isoStr).toLocaleDateString()
  }
}

export function formatDateTime(isoStr?: string | null, locale?: string) {
  if (!isoStr) return ''
  const loc = _normalizeLocale(locale)
  try {
    return new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(isoStr))
  } catch (e) {
    return new Date(isoStr).toLocaleString()
  }
}

export function formatMonthName(isoStr?: string | null, locale?: string, opts?: { month?: 'long' | 'short' | 'numeric' }) {
  if (!isoStr) return ''
  const loc = _normalizeLocale(locale)
  const monthOpt = (opts && opts.month) || 'long'
  try {
    return new Intl.DateTimeFormat(loc, { month: monthOpt as any }).format(new Date(isoStr))
  } catch (e) {
    const d = new Date(isoStr)
    return String(d.getMonth() + 1)
  }
}

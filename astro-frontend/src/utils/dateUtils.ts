export function formatDate(isoStr: string, locale: string = 'en'): string {
  if (!isoStr) return ''
  try {
    return new Date(isoStr).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  } catch (e) {
    return isoStr
  }
}

export function formatMonthName(isoStr: string, locale: string = 'en', options?: Intl.DateTimeFormatOptions): string {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    const month = d.getMonth() + 1

    if (locale.startsWith('zh')) {
      return `${month}月`
    }

    return d.toLocaleDateString(locale, options || { month: 'short' })
  } catch (e) {
    return ''
  }
}

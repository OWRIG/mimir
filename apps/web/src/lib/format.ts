/** 相对时间：一天内显示相对值，否则显示日期 */
export function formatTime(value: string | Date, locale: string, now = new Date()): string {
  const date = new Date(value)
  const diffMs = now.getTime() - date.getTime()
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return rtf.format(0, 'minute')
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return rtf.format(-hours, 'hour')
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date)
}

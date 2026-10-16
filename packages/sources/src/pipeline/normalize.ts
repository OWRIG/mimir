import type { FeedItem, RawItem } from '../types.ts'

export function toDate(value: RawItem['pubDate']): Date | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function resolveUrl(
  value: string | null | undefined,
  base: string | undefined,
): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value.trim(), base).toString()
  } catch {
    return undefined
  }
}

const clean = (value: string | null | undefined) => value?.trim() || undefined

/**
 * 归一化单条；guid 缺失时依次用 link、title+pubDate 兜底。
 * 兜底规则一旦上线就不能改，否则存量条目会被当成新条目重复入库。
 */
export function normalizeItem(raw: RawItem, feedLink: string | undefined): FeedItem | null {
  const link = resolveUrl(raw.link, feedLink)
  const pubDate = toDate(raw.pubDate)
  const title = clean(raw.title) ?? ''
  const guid =
    clean(raw.guid) ?? link ?? (title ? `${title}|${pubDate?.toISOString() ?? ''}` : undefined)
  if (!guid) return null
  const categories = (
    Array.isArray(raw.category) ? raw.category : raw.category ? [raw.category] : []
  )
    .map((c) => c.trim())
    .filter(Boolean)
  const enclosureUrl = resolveUrl(raw.enclosure_url, link ?? feedLink)
  return {
    guid,
    title,
    link,
    content: clean(raw.description),
    summary: clean(raw.summary),
    pubDate,
    author: clean(raw.author),
    categories,
    image: resolveUrl(raw.image, link ?? feedLink),
    enclosure: enclosureUrl ? { url: enclosureUrl, type: clean(raw.enclosure_type) } : undefined,
  }
}

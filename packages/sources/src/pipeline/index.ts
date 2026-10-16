import type { Transform } from '../config.ts'
import type { FeedItem, FeedResult, FetchContext, RawFeed } from '../types.ts'
import { normalizeItem } from './normalize.ts'
import { absolutizeHtml, firstImage, sanitizeContent, toPlainText } from './sanitize.ts'
import { applyTransform } from './transforms.ts'

function finalize(item: FeedItem, feedLink: string | undefined): FeedItem {
  const summary = item.summary ? toPlainText(item.summary) || undefined : undefined
  if (!item.content) return { ...item, summary }
  const content = sanitizeContent(absolutizeHtml(item.content, item.link ?? feedLink))
  return {
    ...item,
    summary,
    content: content || undefined,
    image: item.image ?? firstImage(content),
  }
}

/**
 * RawFeed → FeedResult：归一化 → 按声明顺序执行 transforms → 固定的补全地址与清洗。
 * 清洗是最后一步且不可配置，任何 transform 产出的 HTML 都会经过它。
 */
export async function runPipeline(
  raw: RawFeed,
  transforms: readonly Transform[],
  ctx: FetchContext,
): Promise<FeedResult> {
  const feedLink = raw.link?.trim() || undefined
  let items = raw.item
    .map((i) => normalizeItem(i, feedLink))
    .filter((i): i is FeedItem => i !== null)
  for (const transform of transforms) items = await applyTransform(items, transform, ctx)
  return {
    title: raw.title.trim(),
    link: feedLink,
    description: raw.description?.trim() || undefined,
    image: raw.image?.trim() || undefined,
    items: items.map((i) => finalize(i, feedLink)),
  }
}

import { Readability } from '@mozilla/readability'
import * as cheerio from 'cheerio'
import { parseHTML } from 'linkedom'
import type { Transform } from '../config.ts'
import type { FeedItem, FetchContext } from '../types.ts'

const FULLTEXT_CONCURRENCY = 3

function textOf(item: FeedItem): string {
  const body = item.content ? cheerio.load(item.content, null, false).text() : ''
  return `${item.title}\n${body}`
}

function compile(patterns: string[] | undefined): RegExp[] {
  return (patterns ?? []).map((p) => new RegExp(p, 'i'))
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index] as T)
    }
  })
  await Promise.all(workers)
  return results
}

export async function extractFulltext(
  url: string,
  ctx: FetchContext,
  selector?: string,
): Promise<string | undefined> {
  const res = await ctx.http.get(url, {
    signal: ctx.signal,
    headers: { accept: 'text/html,*/*;q=0.8' },
  })
  if (res.status < 200 || res.status >= 300) return undefined
  if (selector) {
    const html = cheerio.load(res.body)(selector).first().html()
    return html?.trim() || undefined
  }
  const { document } = parseHTML(res.body)
  // readability 会就地修改 DOM，这里的 document 只用一次
  const article = new Readability(
    document as unknown as ConstructorParameters<typeof Readability>[0],
  ).parse()
  return article?.content?.trim() || undefined
}

export async function applyTransform(
  items: FeedItem[],
  transform: Transform,
  ctx: FetchContext,
): Promise<FeedItem[]> {
  switch (transform.type) {
    case 'filter': {
      const include = compile(transform.include)
      const exclude = compile(transform.exclude)
      return items.filter((item) => {
        const text = textOf(item)
        if (include.length > 0 && !include.some((re) => re.test(text))) return false
        return !exclude.some((re) => re.test(text))
      })
    }
    case 'select':
      return items.map((item) => {
        if (!item.content) return item
        const $ = cheerio.load(item.content, null, false)
        for (const selector of transform.remove ?? []) $(selector).remove()
        const content = transform.keep
          ? $(transform.keep)
              .toArray()
              .map((el) => $.html(el))
              .join('')
          : $.html()
        return { ...item, content }
      })
    case 'rewrite':
      return items.map((item) => {
        let { link, content } = item
        for (const rule of transform.rules) {
          const re = new RegExp(rule.pattern, 'g')
          if (rule.target === 'link' && link) link = link.replace(re, rule.replace)
          if (rule.target === 'content' && content) content = content.replace(re, rule.replace)
        }
        return { ...item, link, content }
      })
    case 'fulltext':
      return mapLimit(items, FULLTEXT_CONCURRENCY, async (item) => {
        if (!item.link) return item
        // 单篇失败不影响整个 feed，保留 feed 自带内容
        const content = await extractFulltext(item.link, ctx, transform.selector).catch(
          () => undefined,
        )
        return content ? { ...item, summary: item.summary ?? item.content, content } : item
      })
  }
}

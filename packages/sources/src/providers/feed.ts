import { parseFeed } from 'feedsmith'
import type { FetchContext, ProviderResult, RawFeed, RawItem, SourceProvider } from '../types.ts'

export class FeedHttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} from ${url}`)
    this.name = 'FeedHttpError'
  }
}

const first = <T>(values: readonly T[] | undefined): T | undefined => values?.[0]

const alternate = (links?: { href?: string; rel?: string }[]) =>
  (links?.find((l) => !l.rel || l.rel === 'alternate') ?? links?.[0])?.href

/** 把 RSS / Atom / RDF / JSON Feed 文档统一成 RawFeed */
export function parseFeedDocument(body: string): RawFeed {
  const trimmed = body.trimStart()
  const parsed = parseFeed(trimmed.startsWith('{') ? JSON.parse(trimmed) : trimmed)
  switch (parsed.format) {
    case 'rss': {
      const f = parsed.feed
      return {
        title: f.title ?? '',
        link: f.link,
        description: f.description,
        image: f.image?.url,
        item: (f.items ?? []).map((i): RawItem => ({
          title: i.title,
          link: i.link ?? i.guid?.value,
          guid: i.guid?.value,
          description: i.content?.encoded ?? i.description,
          summary: i.content?.encoded ? i.description : undefined,
          pubDate: i.pubDate ?? first(i.dc?.dates),
          author: first(i.authors)?.name ?? first(i.dc?.creators),
          category: i.categories?.map((c) => c.name).filter((c): c is string => !!c),
          enclosure_url: first(i.enclosures)?.url,
          enclosure_type: first(i.enclosures)?.type,
        })),
      }
    }
    case 'atom': {
      const f = parsed.feed
      return {
        title: f.title?.value ?? '',
        link: alternate(f.links),
        description: f.subtitle?.value,
        image: f.logo ?? f.icon,
        item: (f.entries ?? []).map((e): RawItem => ({
          title: e.title?.value,
          link: alternate(e.links),
          guid: e.id,
          description: e.content?.value ?? e.summary?.value,
          summary: e.content?.value ? e.summary?.value : undefined,
          pubDate: e.published ?? e.updated,
          author: first(e.authors)?.name,
          category: e.categories?.map((c) => c.label ?? c.term).filter((c): c is string => !!c),
        })),
      }
    }
    case 'rdf': {
      const f = parsed.feed
      return {
        title: f.title ?? '',
        link: f.link,
        description: f.description,
        image: f.image?.url,
        item: (f.items ?? []).map((i): RawItem => ({
          title: i.title,
          link: i.link,
          description: i.content?.encoded ?? i.description,
          pubDate: first(i.dc?.dates),
          author: first(i.dc?.creators),
          category: i.dc?.subjects,
        })),
      }
    }
    case 'json': {
      const f = parsed.feed
      return {
        title: f.title ?? '',
        link: f.home_page_url,
        description: f.description,
        image: f.icon ?? f.favicon,
        item: (f.items ?? []).map((i): RawItem => ({
          title: i.title,
          link: i.url ?? i.external_url,
          guid: i.id,
          description: i.content_html ?? i.content_text,
          summary: i.summary,
          pubDate: i.date_published ?? i.date_modified,
          author: first(i.authors)?.name,
          category: i.tags,
          image: i.image ?? i.banner_image,
          enclosure_url: first(i.attachments)?.url,
          enclosure_type: first(i.attachments)?.mime_type,
        })),
      }
    }
  }
}

/** 按 URL 抓取并解析一个 feed 文档，支持条件请求 */
export async function fetchFeedDocument(url: URL, ctx: FetchContext): Promise<ProviderResult> {
  const headers: Record<string, string> = {
    accept:
      'application/rss+xml, application/atom+xml, application/feed+json, application/json;q=0.9, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
  }
  if (ctx.conditional.etag) headers['if-none-match'] = ctx.conditional.etag
  if (ctx.conditional.lastModified) headers['if-modified-since'] = ctx.conditional.lastModified
  const res = await ctx.http.get(url, { headers, signal: ctx.signal })
  if (res.status === 304) return { notModified: true }
  if (res.status < 200 || res.status >= 300) throw new FeedHttpError(res.status, res.url)
  return {
    feed: parseFeedDocument(res.body),
    etag: res.headers.get('etag') ?? undefined,
    lastModified: res.headers.get('last-modified') ?? undefined,
  }
}

export const feedProvider: SourceProvider = {
  schemes: ['http:', 'https:'],
  fetch: fetchFeedDocument,
}

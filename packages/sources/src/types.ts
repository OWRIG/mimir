import type { HttpClient } from './http/client.ts'

/**
 * Provider 的原始输出。字段是 RSSHub `Data` / `DataItem` 的子集，
 * 便于移植 RSSHub 路由：handler 可以按 RSSHub 的习惯返回宽松的值，归一化交给 pipeline。
 */
export type RawItem = {
  title?: string | null
  link?: string | null
  guid?: string | null
  /** 正文 HTML（RSSHub 语义：description 即内容） */
  description?: string | null
  /** feed 自带的短摘要（纯文本或简单 HTML） */
  summary?: string | null
  pubDate?: Date | string | number | null
  author?: string | null
  category?: string[] | string | null
  image?: string | null
  enclosure_url?: string | null
  enclosure_type?: string | null
}

export type RawFeed = {
  title: string
  link?: string | null
  description?: string | null
  image?: string | null
  item: RawItem[]
}

/** pipeline 输出：字段已归一化，content 已清洗 */
export type FeedItem = {
  /** 稳定标识，缺失时按 link → title+pubDate 兜底 */
  guid: string
  title: string
  link?: string
  /** 清洗后的正文 HTML */
  content?: string
  summary?: string
  pubDate?: Date
  author?: string
  categories: string[]
  image?: string
  enclosure?: { url: string; type?: string }
}

export type FeedResult = {
  title: string
  link?: string
  description?: string
  image?: string
  items: FeedItem[]
}

export type Conditional = { etag?: string; lastModified?: string }

export type FetchContext = {
  /** 唯一网络出口：代理、超时、体积上限、SSRF 防护、按 host 限速都在这里 */
  http: HttpClient
  conditional: Conditional
  signal?: AbortSignal
}

export type ProviderResult =
  | { notModified: true }
  | { notModified?: false; feed: RawFeed; etag?: string; lastModified?: string }

export interface SourceProvider {
  schemes: readonly string[]
  fetch(uri: URL, ctx: FetchContext): Promise<ProviderResult>
}

/** site:// 适配器，形态对齐 RSSHub route */
export type SiteRoute = {
  /** Hono 风格路径，含站点前缀，如 "/github/trending/:since?" */
  path: string
  name: string
  /** 对应站点，不含协议 */
  url: string
  /** 示例 source URI 路径，如 "/github/trending/daily" */
  example: string
  parameters?: Record<string, string>
  handler(params: Record<string, string>, ctx: FetchContext): Promise<RawFeed>
}

import type { SourceConfig } from './config.ts'
import type { HttpClient } from './http/client.ts'
import { runPipeline } from './pipeline/index.ts'
import { feedProvider } from './providers/feed.ts'
import { createRsshubProvider } from './providers/rsshub.ts'
import { createSiteProvider } from './providers/site.ts'
import { siteRoutes } from './sites/index.ts'
import type { Conditional, FeedResult, SiteRoute, SourceProvider } from './types.ts'

export type SourceRegistryOptions = {
  rsshubInstances?: readonly string[]
  sites?: readonly SiteRoute[]
}

export type SourceRegistry = { providerFor(uri: URL): SourceProvider }

export function createSourceRegistry(options: SourceRegistryOptions = {}): SourceRegistry {
  const providers = [
    feedProvider,
    createRsshubProvider(options.rsshubInstances ?? []),
    createSiteProvider(options.sites ?? siteRoutes),
  ]
  const byScheme = new Map(providers.flatMap((p) => p.schemes.map((s) => [s, p] as const)))
  return {
    providerFor(uri) {
      const provider = byScheme.get(uri.protocol)
      if (!provider) throw new Error(`No provider for scheme ${uri.protocol}`)
      return provider
    },
  }
}

export type FetchSourceInput = {
  /** 已规范化的 source URI */
  uri: string
  config: SourceConfig
  conditional?: Conditional
  signal?: AbortSignal
}

export type FetchSourceOutcome =
  | { notModified: true }
  | { notModified: false; feed: FeedResult; etag?: string; lastModified?: string }

/** 抓取一个源并跑完整 pipeline。这是 sources 包对外的主入口 */
export async function fetchSource(
  registry: SourceRegistry,
  http: HttpClient,
  input: FetchSourceInput,
): Promise<FetchSourceOutcome> {
  const uri = new URL(input.uri)
  // 代理选择在这里绑定到 http 上，适配器和 transform 无需感知
  const boundHttp: HttpClient = {
    get: (url, req) => http.get(url, { ...req, useProxy: input.config.proxy ?? false }),
  }
  const ctx = { http: boundHttp, conditional: input.conditional ?? {}, signal: input.signal }
  const result = await registry.providerFor(uri).fetch(uri, ctx)
  if (result.notModified) return { notModified: true }
  const feed = await runPipeline(result.feed, input.config.transforms ?? [], ctx)
  return { notModified: false, feed, etag: result.etag, lastModified: result.lastModified }
}

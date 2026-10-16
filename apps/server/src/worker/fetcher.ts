import {
  canonicalItemUrl,
  fetchSource,
  type FeedItem,
  type FeedResult,
  type HttpClient,
  type SourceConfig,
  type SourceRegistry,
} from '@mimir/sources'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { feeds, items } from '../db/schema.ts'
import type { Logger } from '../logger.ts'

const MINUTE = 60_000
/** 认领租约：处理中的 feed 在这段时间内不会被其他 worker 认领；进程崩溃后到期自动释放 */
const LEASE_MS = 10 * MINUTE
const MIN_INTERVAL = 10
const MAX_INTERVAL = 24 * 60
/** 连续失败且距上次成功超过该时长，标记为 dead，等待人工恢复 */
const DEAD_AFTER_MS = 7 * 24 * 60 * MINUTE

type ClaimedFeed = {
  id: string
  sourceUri: string
  config: SourceConfig
  etag: string | null
  lastModified: string | null
  intervalMinutes: number
  errorCount: number
  lastSuccessAt: Date | null
  createdAt: Date
}

const sha1 = (value: string) => new Bun.CryptoHasher('sha1').update(value).digest('hex')
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/**
 * 自适应间隔：取本次结果中相邻条目发布时间的平均间隔的一半，夹在 [10m, 24h]。
 * 配置了 intervalMinutes 时以配置为准；数据不足时保持当前值。
 */
export function computeInterval(result: FeedResult, current: number, config: SourceConfig): number {
  if (config.intervalMinutes) return config.intervalMinutes
  const times = result.items
    .map((i) => i.pubDate?.getTime())
    .filter((t): t is number => t !== undefined)
    .toSorted((a, b) => b - a)
    .slice(0, 20)
  if (times.length < 3) return current
  const span = (times[0]! - times.at(-1)!) / (times.length - 1)
  return clamp(Math.round(span / MINUTE / 2), MIN_INTERVAL, MAX_INTERVAL)
}

/** 失败退避：间隔按 2^错误次数 放大，上限 24h */
export function backoffMinutes(interval: number, errorCount: number): number {
  return clamp(interval * 2 ** Math.min(errorCount, 10), MIN_INTERVAL, MAX_INTERVAL)
}

export function toItemRow(feedId: string, item: FeedItem, now: Date) {
  const canonical = item.link ? canonicalItemUrl(item.link) : undefined
  // 缺失或未来的发布时间按入库时间处理，避免时间线被"未来条目"霸占顶部
  const publishedAt = item.pubDate && item.pubDate <= now ? item.pubDate : now
  return {
    feedId,
    guid: item.guid,
    guidHash: sha1(item.guid),
    url: item.link ?? null,
    urlHash: canonical ? sha1(canonical) : null,
    title: item.title || item.link || '(untitled)',
    author: item.author ?? null,
    excerpt: item.summary ?? null,
    contentHtml: item.content ?? null,
    imageUrl: item.image ?? null,
    categories: item.categories,
    enclosureUrl: item.enclosure?.url ?? null,
    enclosureType: item.enclosure?.type ?? null,
    publishedAt,
  }
}

export type FetcherDeps = { db: Db; registry: SourceRegistry; http: HttpClient; logger: Logger }

/**
 * 认领到期 feed：FOR UPDATE SKIP LOCKED 保证多 worker 互斥，同时把 next_fetch_at 推后一个租约作为占位。
 * 没有任何订阅者、也不在任何 Collection 里的 feed 不会被认领（停止抓取，但保留数据）。
 */
export async function claimDueFeeds(
  db: Db,
  limit: number,
  now = new Date(),
): Promise<ClaimedFeed[]> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS)
  const result = await db.execute<Record<string, unknown>>(sql`
    update feeds set next_fetch_at = ${leaseUntil}
    where id in (
      select f.id from feeds f
      where f.status = 'active' and f.next_fetch_at <= ${now}
        and (
          exists (select 1 from subscriptions s where s.feed_id = f.id)
          or exists (select 1 from collection_feeds cf where cf.feed_id = f.id)
        )
      order by f.next_fetch_at
      limit ${limit}
      for update skip locked
    )
    returning id, source_uri, config, etag, last_modified, interval_minutes, error_count, last_success_at, created_at
  `)
  return result.rows.map((r) => ({
    id: r.id as string,
    sourceUri: r.source_uri as string,
    config: (r.config ?? {}) as SourceConfig,
    etag: r.etag as string | null,
    lastModified: r.last_modified as string | null,
    intervalMinutes: r.interval_minutes as number,
    errorCount: r.error_count as number,
    lastSuccessAt: r.last_success_at ? new Date(r.last_success_at as string) : null,
    createdAt: new Date(r.created_at as string),
  }))
}

export async function processFeed(deps: FetcherDeps, feed: ClaimedFeed): Promise<void> {
  const { db, registry, http, logger } = deps
  const startedAt = new Date()
  const log = logger.child({ feedId: feed.id, uri: feed.sourceUri })
  try {
    const outcome = await fetchSource(registry, http, {
      uri: feed.sourceUri,
      config: feed.config,
      conditional: { etag: feed.etag ?? undefined, lastModified: feed.lastModified ?? undefined },
    })
    const now = new Date()
    if (outcome.notModified) {
      await db
        .update(feeds)
        .set({
          lastFetchedAt: now,
          lastSuccessAt: now,
          lastError: null,
          errorCount: 0,
          nextFetchAt: new Date(now.getTime() + feed.intervalMinutes * MINUTE),
        })
        .where(eq(feeds.id, feed.id))
      log.debug('not modified')
      return
    }
    const { feed: result } = outcome
    const interval = computeInterval(result, feed.intervalMinutes, feed.config)
    const rows = result.items.map((item) => toItemRow(feed.id, item, now))
    await db.transaction(async (tx) => {
      if (rows.length > 0) {
        await tx
          .insert(items)
          .values(rows)
          .onConflictDoUpdate({
            target: [items.feedId, items.guidHash],
            set: {
              title: sql`excluded.title`,
              url: sql`excluded.url`,
              urlHash: sql`excluded.url_hash`,
              author: sql`excluded.author`,
              excerpt: sql`excluded.excerpt`,
              contentHtml: sql`excluded.content_html`,
              imageUrl: sql`excluded.image_url`,
              categories: sql`excluded.categories`,
              updatedAt: now,
            },
            // 只在实质变化时更新；已过保留期被清空正文的条目不回填
            setWhere: sql`${items.contentPurgedAt} is null and (
              ${items.title} is distinct from excluded.title
              or ${items.contentHtml} is distinct from excluded.content_html
            )`,
          })
      }
      await tx
        .update(feeds)
        .set({
          title: result.title || null,
          siteUrl: result.link ?? null,
          description: result.description ?? null,
          imageUrl: result.image ?? null,
          etag: outcome.etag ?? null,
          lastModified: outcome.lastModified ?? null,
          lastFetchedAt: now,
          lastSuccessAt: now,
          lastError: null,
          errorCount: 0,
          intervalMinutes: interval,
          nextFetchAt: new Date(now.getTime() + interval * MINUTE),
        })
        .where(eq(feeds.id, feed.id))
    })
    log.info({ items: rows.length, interval, ms: Date.now() - startedAt.getTime() }, 'fetched')
  } catch (error) {
    const now = new Date()
    const errorCount = feed.errorCount + 1
    const lastGood = feed.lastSuccessAt ?? feed.createdAt
    const dead = now.getTime() - lastGood.getTime() > DEAD_AFTER_MS
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    await db
      .update(feeds)
      .set({
        lastFetchedAt: now,
        lastError: message.slice(0, 1000),
        errorCount,
        status: dead ? 'dead' : 'active',
        nextFetchAt: new Date(
          now.getTime() + backoffMinutes(feed.intervalMinutes, errorCount) * MINUTE,
        ),
      })
      .where(eq(feeds.id, feed.id))
    log.warn({ errorCount, dead, err: message }, 'fetch failed')
  }
}

export type FetchLoop = { stop(): Promise<void> }

/** 轮询认领并以有限并发处理；stop() 停止认领并等待在途任务结束 */
export function startFetchLoop(
  deps: FetcherDeps,
  options: { concurrency: number; pollMs?: number },
): FetchLoop {
  const { concurrency, pollMs = 5_000 } = options
  const inFlight = new Set<Promise<void>>()
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  async function tick() {
    if (stopped) return
    try {
      const capacity = concurrency - inFlight.size
      if (capacity > 0) {
        for (const feed of await claimDueFeeds(deps.db, capacity)) {
          const task = processFeed(deps, feed).finally(() => inFlight.delete(task))
          inFlight.add(task)
        }
      }
    } catch (error) {
      deps.logger.error({ err: error }, 'fetch loop tick failed')
    }
    if (!stopped) timer = setTimeout(tick, pollMs)
  }

  void tick()
  return {
    async stop() {
      stopped = true
      clearTimeout(timer)
      await Promise.allSettled(inFlight)
    },
  }
}

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  createSourceRegistry,
  type FeedResult,
  type HttpClient,
  type RawFeed,
} from '@mimir/sources'
import { eq } from 'drizzle-orm'
import { collectionFeeds, collections, feeds, items } from '../db/schema.ts'
import { logger } from '../logger.ts'
import { createFeed, createUser, resetDb, subscribeTo, testDb } from '../test/db.ts'
import {
  backoffMinutes,
  claimDueFeeds,
  computeInterval,
  processFeed,
  toItemRow,
} from './fetcher.ts'

const { db } = await testDb()
beforeEach(() => resetDb(db))

const silent = logger.child({}, { level: 'silent' })
const noHttp: HttpClient = { get: () => Promise.reject(new Error('network disabled in tests')) }

/** 用一个测试站点适配器代替网络，handler 的输出由用例控制 */
function registryReturning(next: () => RawFeed) {
  return createSourceRegistry({
    sites: [
      {
        path: '/test/:id',
        name: 't',
        url: 'test',
        example: '/test/1',
        handler: async () => next(),
      },
    ],
  })
}

const result = (dates: string[]): FeedResult => ({
  title: 't',
  items: dates.map((d, i) => ({
    guid: `${i}`,
    title: `${i}`,
    categories: [],
    pubDate: new Date(d),
  })),
})

describe('纯函数', () => {
  test('computeInterval：平均发文间隔的一半，夹在 [10, 1440]', () => {
    const hourly = result([
      '2026-01-01T03:00Z',
      '2026-01-01T02:00Z',
      '2026-01-01T01:00Z',
      '2026-01-01T00:00Z',
    ])
    expect(computeInterval(hourly, 30, {})).toBe(30)
    const fast = result(['2026-01-01T00:03Z', '2026-01-01T00:02Z', '2026-01-01T00:01Z'])
    expect(computeInterval(fast, 30, {})).toBe(10)
    const slow = result(['2026-03-01Z', '2026-02-01Z', '2026-01-01Z'])
    expect(computeInterval(slow, 30, {})).toBe(1440)
    expect(computeInterval(result(['2026-01-01Z']), 45, {})).toBe(45)
    expect(computeInterval(hourly, 30, { intervalMinutes: 120 })).toBe(120)
  })

  test('backoffMinutes：指数退避，上限 24h', () => {
    expect(backoffMinutes(30, 1)).toBe(60)
    expect(backoffMinutes(30, 3)).toBe(240)
    expect(backoffMinutes(30, 20)).toBe(1440)
  })

  test('toItemRow：未来或缺失的发布时间按入库时间处理', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const future = toItemRow(
      'f',
      { guid: 'g', title: '', categories: [], pubDate: new Date('2030-01-01Z') },
      now,
    )
    expect(future.publishedAt).toEqual(now)
    expect(future.title).toBe('(untitled)')
    const linked = toItemRow(
      'f',
      { guid: 'g', title: 't', link: 'https://a.com/p?utm_source=x', categories: [] },
      now,
    )
    expect(linked.urlHash).toBe(
      toItemRow('f', { guid: 'h', title: 't', link: 'https://a.com/p', categories: [] }, now)
        .urlHash,
    )
  })
})

describe('claimDueFeeds', () => {
  test('只认领到期、active 且有订阅者或在 Collection 中的 feed', async () => {
    const user = await createUser(db)
    const past = new Date(Date.now() - 60_000)
    const subscribed = await createFeed(db, { nextFetchAt: past })
    const inCollection = await createFeed(db, { nextFetchAt: past })
    const orphan = await createFeed(db, { nextFetchAt: past })
    const notDue = await createFeed(db, { nextFetchAt: new Date(Date.now() + 3_600_000) })
    const dead = await createFeed(db, { nextFetchAt: past, status: 'dead' })
    for (const f of [subscribed, notDue, dead]) await subscribeTo(db, user.id, f.id)
    const [c] = await db.insert(collections).values({ name: 'c', ownerUserId: user.id }).returning()
    await db.insert(collectionFeeds).values({ collectionId: c!.id, feedId: inCollection.id })

    const claimed = await claimDueFeeds(db, 10)
    expect(claimed.map((f) => f.id).toSorted()).toEqual([subscribed.id, inCollection.id].toSorted())
    expect(orphan.id).not.toBeOneOf(claimed.map((f) => f.id))
    // 认领后 next_fetch_at 被推后为租约，立即再次认领拿不到
    expect(await claimDueFeeds(db, 10)).toHaveLength(0)
  })

  test('并发认领互不重叠', async () => {
    const user = await createUser(db)
    for (let i = 0; i < 20; i++) {
      const f = await createFeed(db, { nextFetchAt: new Date(Date.now() - 1000) })
      await subscribeTo(db, user.id, f.id)
    }
    const batches = await Promise.all([
      claimDueFeeds(db, 8),
      claimDueFeeds(db, 8),
      claimDueFeeds(db, 8),
    ])
    const ids = batches.flat().map((f) => f.id)
    expect(ids).toHaveLength(20)
    expect(new Set(ids).size).toBe(20)
  })
})

async function claimOne(uri: string, values: Partial<typeof feeds.$inferInsert> = {}) {
  const user = await createUser(db)
  const feed = await createFeed(db, {
    sourceUri: uri,
    nextFetchAt: new Date(Date.now() - 1000),
    ...values,
  })
  await subscribeTo(db, user.id, feed.id)
  const [claimed] = await claimDueFeeds(db, 1)
  return claimed!
}

describe('processFeed', () => {
  test('入库新条目、更新 feed 元数据；再次抓取只在内容变化时更新', async () => {
    let content = '<p>v1</p>'
    const registry = registryReturning(() => ({
      title: 'Test Feed',
      link: 'https://test.example.com/',
      item: [
        {
          title: 'A',
          guid: 'a',
          link: '/a',
          description: content,
          pubDate: '2026-01-01T00:00:00Z',
        },
        {
          title: 'B',
          guid: 'b',
          link: '/b',
          description: '<p>b</p>',
          pubDate: '2026-01-01T01:00:00Z',
        },
      ],
    }))
    const claimed = await claimOne('site://test/1')
    await processFeed({ db, registry, http: noHttp, logger: silent }, claimed)

    const [feed] = await db.select().from(feeds).where(eq(feeds.id, claimed.id))
    expect(feed).toMatchObject({
      title: 'Test Feed',
      siteUrl: 'https://test.example.com/',
      errorCount: 0,
      lastError: null,
    })
    expect(feed!.nextFetchAt.getTime()).toBeGreaterThan(Date.now())
    const rows = await db.select().from(items).where(eq(items.feedId, claimed.id))
    expect(rows.map((r) => r.url).toSorted()).toEqual([
      'https://test.example.com/a',
      'https://test.example.com/b',
    ])

    content = '<p>v2</p>'
    await processFeed({ db, registry, http: noHttp, logger: silent }, { ...claimed })
    const after = await db.select().from(items).where(eq(items.feedId, claimed.id))
    expect(after).toHaveLength(2)
    expect(after.find((r) => r.guid === 'a')?.contentHtml).toBe('<p>v2</p>')
  })

  test('失败时记录错误并退避；长期失败标记 dead', async () => {
    const registry = registryReturning(() => {
      throw new Error('boom')
    })
    const claimed = await claimOne('site://test/2')
    await processFeed({ db, registry, http: noHttp, logger: silent }, claimed)
    const [feed] = await db.select().from(feeds).where(eq(feeds.id, claimed.id))
    expect(feed).toMatchObject({ status: 'active', errorCount: 1 })
    expect(feed!.lastError).toContain('boom')

    const longAgo = new Date(Date.now() - 8 * 24 * 3_600_000)
    await processFeed(
      { db, registry, http: noHttp, logger: silent },
      { ...claimed, lastSuccessAt: longAgo },
    )
    const [deadFeed] = await db.select().from(feeds).where(eq(feeds.id, claimed.id))
    expect(deadFeed!.status).toBe('dead')
  })
})

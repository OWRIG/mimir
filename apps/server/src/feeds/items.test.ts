import { beforeEach, describe, expect, test } from 'bun:test'
import { items } from '../db/schema.ts'
import { createFeed, createUser, resetDb, subscribeTo, testDb } from '../test/db.ts'
import { getItem, listItems, markFeedsRead, setItemState } from './items.ts'

const { db } = await testDb()
beforeEach(() => resetDb(db))

async function seedItems(feedId: string, count: number) {
  const base = Date.UTC(2026, 0, 1)
  const rows = Array.from({ length: count }, (_, i) => ({
    feedId,
    guid: `g${i}`,
    guidHash: `h${i}`,
    title: `item ${i}`,
    contentHtml: `<p>${i}</p>`,
    // 第 0、1 条同一时刻，用于验证游标的 id 次序
    publishedAt: new Date(base + Math.max(i, 1) * 60_000),
  }))
  return db.insert(items).values(rows).returning()
}

const query = (extra: Partial<Parameters<typeof listItems>[2]> = {}) => ({ limit: 30, ...extra })

describe('listItems', () => {
  test('只返回可见 feed 的条目，按发布时间倒序', async () => {
    const user = await createUser(db)
    const [mine, other] = [await createFeed(db, { title: 'Mine' }), await createFeed(db)]
    await subscribeTo(db, user.id, mine.id)
    await seedItems(mine.id, 3)
    await seedItems(other.id, 2)
    const page = await listItems(db, user.id, query())
    // item 0 与 item 1 发布时间相同，按 id（UUIDv7，后插入者更大）倒序
    expect(page.items.map((i) => i.title)).toEqual(['item 2', 'item 1', 'item 0'])
    expect(page.items.every((i) => i.feedTitle === 'Mine')).toBe(true)
  })

  test('游标分页无重复、无遗漏（含同一时间戳）', async () => {
    const user = await createUser(db)
    const feed = await createFeed(db)
    await subscribeTo(db, user.id, feed.id)
    await seedItems(feed.id, 7)
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await listItems(db, user.id, query({ limit: 3, cursor }))
      seen.push(...page.items.map((i) => i.id))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    expect(seen).toHaveLength(7)
    expect(new Set(seen).size).toBe(7)
  })

  test('水位线 + 单条已读 + 星标', async () => {
    const user = await createUser(db)
    const feed = await createFeed(db)
    await subscribeTo(db, user.id, feed.id)
    const rows = await seedItems(feed.id, 4)
    // 水位线覆盖 item 0..2（发布时间 ≤ 第 2 条）
    await markFeedsRead(db, user.id, [feed.id], rows[2]!.publishedAt)
    // 水位线不后退
    await markFeedsRead(db, user.id, [feed.id], new Date(0))
    const unread = await listItems(db, user.id, query({ unreadOnly: 'true' }))
    expect(unread.items.map((i) => i.title)).toEqual(['item 3'])

    expect(await setItemState(db, user.id, rows[3]!.id, { read: true, starred: true })).toBe(true)
    expect((await listItems(db, user.id, query({ unreadOnly: 'true' }))).items).toHaveLength(0)
    const starred = await listItems(db, user.id, query({ starredOnly: 'true' }))
    expect(starred.items.map((i) => i.title)).toEqual(['item 3'])

    await setItemState(db, user.id, rows[3]!.id, { read: false })
    const [again] = (await listItems(db, user.id, query({ unreadOnly: 'true' }))).items
    expect(again).toMatchObject({ title: 'item 3', isStarred: true, isRead: false })
  })

  test('不可见条目：getItem 返回 null，setItemState 返回 false', async () => {
    const [owner, stranger] = [await createUser(db), await createUser(db)]
    const feed = await createFeed(db)
    await subscribeTo(db, owner.id, feed.id)
    const [row] = await seedItems(feed.id, 1)
    expect(await getItem(db, stranger.id, row!.id)).toBeNull()
    expect(await setItemState(db, stranger.id, row!.id, { read: true })).toBe(false)
    expect((await getItem(db, owner.id, row!.id))?.contentHtml).toBe('<p>0</p>')
  })
})

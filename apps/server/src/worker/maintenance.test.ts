import { beforeEach, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { items, itemStates } from '../db/schema.ts'
import { createFeed, createUser, resetDb, testDb } from '../test/db.ts'
import { purgeExpiredContent } from './maintenance.ts'

const { db } = await testDb()
beforeEach(() => resetDb(db))

test('清空过期正文，保留星标条目与未过期条目', async () => {
  const user = await createUser(db)
  const feed = await createFeed(db)
  const old = new Date(Date.now() - 40 * 24 * 3_600_000)
  const [expired, starred, fresh] = await db
    .insert(items)
    .values([
      {
        feedId: feed.id,
        guid: '1',
        guidHash: '1',
        title: 'old',
        contentHtml: '<p>x</p>',
        publishedAt: old,
      },
      {
        feedId: feed.id,
        guid: '2',
        guidHash: '2',
        title: 'starred',
        contentHtml: '<p>x</p>',
        publishedAt: old,
      },
      {
        feedId: feed.id,
        guid: '3',
        guidHash: '3',
        title: 'fresh',
        contentHtml: '<p>x</p>',
        publishedAt: new Date(),
      },
    ])
    .returning()
  await db
    .insert(itemStates)
    .values({ userId: user.id, itemId: starred!.id, starredAt: new Date() })

  expect(await purgeExpiredContent(db, 30)).toBe(1)
  const byId = async (id: string) => (await db.select().from(items).where(eq(items.id, id)))[0]!
  expect(await byId(expired!.id)).toMatchObject({ contentHtml: null, title: 'old' })
  expect((await byId(expired!.id)).contentPurgedAt).toBeInstanceOf(Date)
  expect((await byId(starred!.id)).contentHtml).toBe('<p>x</p>')
  expect((await byId(fresh!.id)).contentHtml).toBe('<p>x</p>')
})

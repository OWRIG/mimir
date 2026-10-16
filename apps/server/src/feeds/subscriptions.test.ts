import { beforeEach, expect, test } from 'bun:test'
import { InvalidSourceUriError } from '@mimir/sources'
import { eq } from 'drizzle-orm'
import { feeds } from '../db/schema.ts'
import { createUser, resetDb, testDb } from '../test/db.ts'
import { listSubscriptions, subscribe, unsubscribe } from './subscriptions.ts'

const { db } = await testDb()
beforeEach(() => resetDb(db))

test('同一个源（写法不同）全组织只建一个 feed', async () => {
  const [alice, bob] = [await createUser(db), await createUser(db)]
  const a = await subscribe(db, alice.id, { uri: 'https://Example.com/rss?utm_source=x' })
  const b = await subscribe(db, bob.id, { uri: 'example.com/rss#top' })
  expect(a.id).toBe(b.id)
  expect(a.sourceUri).toBe('https://example.com/rss')
  expect(await db.$count(feeds)).toBe(1)
})

test('重复订阅幂等；标题覆盖生效；取消订阅', async () => {
  const user = await createUser(db)
  await subscribe(db, user.id, { uri: 'https://a.com/rss', title: '我的 A' })
  await subscribe(db, user.id, { uri: 'https://a.com/rss' })
  const list = await listSubscriptions(db, user.id)
  expect(list).toHaveLength(1)
  expect(list[0]?.title).toBe('我的 A')
  await unsubscribe(db, user.id, list[0]!.feedId)
  expect(await listSubscriptions(db, user.id)).toHaveLength(0)
})

test('重新订阅 dead feed 会恢复调度', async () => {
  const user = await createUser(db)
  const feed = await subscribe(db, user.id, { uri: 'https://a.com/rss' })
  await db.update(feeds).set({ status: 'dead', errorCount: 9 }).where(eq(feeds.id, feed.id))
  await subscribe(db, (await createUser(db)).id, { uri: 'https://a.com/rss' })
  const [after] = await db.select().from(feeds).where(eq(feeds.id, feed.id))
  expect(after).toMatchObject({ status: 'active', errorCount: 0 })
})

test('非法 URI 抛 InvalidSourceUriError', async () => {
  const user = await createUser(db)
  expect(subscribe(db, user.id, { uri: 'file:///etc/passwd' })).rejects.toBeInstanceOf(
    InvalidSourceUriError,
  )
})

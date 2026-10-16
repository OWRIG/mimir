import { beforeEach, describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import {
  collectionFeeds,
  collectionFollows,
  collections,
  departments,
  userDepartments,
} from '../db/schema.ts'
import { createFeed, createUser, resetDb, subscribeTo, testDb } from '../test/db.ts'
import { visibleFeedIds } from './visibility.ts'

const { db } = await testDb()
beforeEach(() => resetDb(db))

async function visible(userId: string) {
  const { rows } = await db.execute<{ feed_id: string }>(
    sql`select feed_id from ${visibleFeedIds(userId)} v`,
  )
  return rows.map((r) => r.feed_id).toSorted()
}

async function collectionWith(
  feedId: string,
  values: Partial<typeof collections.$inferInsert> & { ownerUserId: string },
) {
  const [c] = await db
    .insert(collections)
    .values({ name: 'c', ...values })
    .returning()
  await db.insert(collectionFeeds).values({ collectionId: c!.id, feedId })
  return c!
}

describe('visibleFeedIds', () => {
  test('个人订阅可见，他人订阅不可见', async () => {
    const [alice, bob] = [await createUser(db), await createUser(db)]
    const feed = await createFeed(db)
    await subscribeTo(db, alice.id, feed.id)
    expect(await visible(alice.id)).toEqual([feed.id])
    expect(await visible(bob.id)).toEqual([])
  })

  test('关注公开 Collection 后可见；只关注不等于订阅，未关注不可见', async () => {
    const [owner, reader, other] = [
      await createUser(db),
      await createUser(db),
      await createUser(db),
    ]
    const feed = await createFeed(db)
    const c = await collectionWith(feed.id, { ownerUserId: owner.id, visibility: 'public' })
    await db.insert(collectionFollows).values({ userId: reader.id, collectionId: c.id })
    expect(await visible(reader.id)).toEqual([feed.id])
    expect(await visible(other.id)).toEqual([])
  })

  test('关注后 Collection 变为私有，关注者失去可见性，创建者仍可见', async () => {
    const [owner, reader] = [await createUser(db), await createUser(db)]
    const feed = await createFeed(db)
    const c = await collectionWith(feed.id, { ownerUserId: owner.id, visibility: 'private' })
    await db.insert(collectionFollows).values([
      { userId: reader.id, collectionId: c.id },
      { userId: owner.id, collectionId: c.id },
    ])
    expect(await visible(reader.id)).toEqual([])
    expect(await visible(owner.id)).toEqual([feed.id])
  })

  test('部门可见：本部门与下级部门成员可见，平级部门不可见', async () => {
    const [owner, child, sibling] = [
      await createUser(db),
      await createUser(db),
      await createUser(db),
    ]
    const [root] = await db.insert(departments).values({ name: '研发' }).returning()
    const [sub] = await db
      .insert(departments)
      .values({ name: '前端', parentId: root!.id })
      .returning()
    const [peer] = await db.insert(departments).values({ name: '市场' }).returning()
    await db.insert(userDepartments).values([
      { userId: child.id, departmentId: sub!.id },
      { userId: sibling.id, departmentId: peer!.id },
    ])
    const feed = await createFeed(db)
    const c = await collectionWith(feed.id, {
      ownerUserId: owner.id,
      visibility: 'department',
      departmentId: root!.id,
    })
    await db.insert(collectionFollows).values([
      { userId: child.id, collectionId: c.id },
      { userId: sibling.id, collectionId: c.id },
    ])
    expect(await visible(child.id)).toEqual([feed.id])
    expect(await visible(sibling.id)).toEqual([])
  })
})

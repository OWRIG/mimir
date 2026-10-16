import type { ItemsQuery, ItemStateInput } from '@mimir/shared'
import { and, desc, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { feeds, items, itemStates, readMarks, subscriptions } from '../db/schema.ts'
import { visibleFeedIds } from './visibility.ts'

type Cursor = { publishedAt: string; id: string }

const encodeCursor = (c: Cursor) =>
  Buffer.from(JSON.stringify([c.publishedAt, c.id])).toString('base64url')

function decodeCursor(value: string | undefined): Cursor | undefined {
  if (!value) return undefined
  try {
    const [publishedAt, id] = JSON.parse(Buffer.from(value, 'base64url').toString()) as [
      string,
      string,
    ]
    return { publishedAt, id }
  } catch {
    return undefined
  }
}

/**
 * 已读判定：落在 feed 水位线之内，或水位线之后单独标记过已读。
 * 已知局限：水位线之内的条目无法单独标回未读。
 */
const isReadExpr = sql<boolean>`(
  (${readMarks.readBefore} is not null and ${items.publishedAt} <= ${readMarks.readBefore})
  or ${itemStates.readAt} is not null
)`

function baseQuery(db: Db, userId: string) {
  return db
    .select({
      id: items.id,
      feedId: items.feedId,
      feedTitle: sql<string>`coalesce(${subscriptions.titleOverride}, ${feeds.title}, ${feeds.sourceUri})`,
      title: items.title,
      url: items.url,
      author: items.author,
      excerpt: items.excerpt,
      imageUrl: items.imageUrl,
      categories: items.categories,
      publishedAt: items.publishedAt,
      isRead: isReadExpr,
      isStarred: sql<boolean>`${itemStates.starredAt} is not null`,
    })
    .from(items)
    .innerJoin(feeds, eq(feeds.id, items.feedId))
    .leftJoin(
      subscriptions,
      and(eq(subscriptions.feedId, items.feedId), eq(subscriptions.userId, userId)),
    )
    .leftJoin(readMarks, and(eq(readMarks.feedId, items.feedId), eq(readMarks.userId, userId)))
    .leftJoin(itemStates, and(eq(itemStates.itemId, items.id), eq(itemStates.userId, userId)))
}

export async function listItems(db: Db, userId: string, query: ItemsQuery) {
  const cursor = decodeCursor(query.cursor)
  const conditions: SQL[] = [sql`${items.feedId} in ${visibleFeedIds(userId)}`]
  if (query.feedId) conditions.push(eq(items.feedId, query.feedId))
  if (query.unreadOnly === 'true') conditions.push(sql`not ${isReadExpr}`)
  if (query.starredOnly === 'true') conditions.push(isNotNull(itemStates.starredAt))
  if (cursor) {
    conditions.push(
      sql`(${items.publishedAt}, ${items.id}) < (${cursor.publishedAt}::timestamptz, ${cursor.id}::uuid)`,
    )
  }
  const rows = await baseQuery(db, userId)
    .where(and(...conditions))
    .orderBy(desc(items.publishedAt), desc(items.id))
    .limit(query.limit + 1)
  const page = rows.slice(0, query.limit)
  const last = page.at(-1)
  return {
    items: page,
    nextCursor:
      rows.length > query.limit && last
        ? encodeCursor({ publishedAt: last.publishedAt.toISOString(), id: last.id })
        : null,
  }
}

export async function getItem(db: Db, userId: string, itemId: string) {
  const [row] = await baseQuery(db, userId)
    .where(and(eq(items.id, itemId), sql`${items.feedId} in ${visibleFeedIds(userId)}`))
    .limit(1)
  if (!row) return null
  const [content] = await db
    .select({ contentHtml: items.contentHtml, contentPurgedAt: items.contentPurgedAt })
    .from(items)
    .where(eq(items.id, itemId))
  return {
    ...row,
    contentHtml: content?.contentHtml ?? null,
    contentPurgedAt: content?.contentPurgedAt ?? null,
  }
}

/** 返回 false 表示条目不存在或不可见 */
export async function setItemState(db: Db, userId: string, itemId: string, input: ItemStateInput) {
  const [visible] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, itemId), sql`${items.feedId} in ${visibleFeedIds(userId)}`))
  if (!visible) return false
  const now = new Date()
  const patch: { readAt?: Date | null; starredAt?: Date | null } = {}
  if (input.read !== undefined) patch.readAt = input.read ? now : null
  if (input.starred !== undefined) patch.starredAt = input.starred ? now : null
  await db
    .insert(itemStates)
    .values({ userId, itemId, ...patch })
    .onConflictDoUpdate({ target: [itemStates.userId, itemStates.itemId], set: patch })
  return true
}

/** 推进 feed 水位线；只对可见 feed 生效 */
export async function markFeedsRead(db: Db, userId: string, feedIds: string[], before: Date) {
  const visible = await db
    .select({ id: feeds.id })
    .from(feeds)
    .where(and(inArray(feeds.id, feedIds), sql`${feeds.id} in ${visibleFeedIds(userId)}`))
  if (visible.length === 0) return
  await db
    .insert(readMarks)
    .values(visible.map((f) => ({ userId, feedId: f.id, readBefore: before })))
    .onConflictDoUpdate({
      target: [readMarks.userId, readMarks.feedId],
      // 水位线只前进不后退
      set: { readBefore: sql`greatest(${readMarks.readBefore}, excluded.read_before)` },
    })
}

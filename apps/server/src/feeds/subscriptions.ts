import { normalizeSourceUri } from '@mimir/sources'
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import { feeds, subscriptions } from '../db/schema.ts'

/** 订阅一个源：URI 规范化后按全局身份复用已有 feed，新 feed 立即进入抓取调度 */
export async function subscribe(
  db: Db,
  userId: string,
  input: { uri: string; title?: string; folder?: string },
) {
  const sourceUri = normalizeSourceUri(input.uri)
  return db.transaction(async (tx) => {
    await tx.insert(feeds).values({ sourceUri }).onConflictDoNothing({ target: feeds.sourceUri })
    const [feed] = await tx.select().from(feeds).where(eq(feeds.sourceUri, sourceUri))
    if (!feed) throw new Error('feed upsert failed')
    // 已失效或暂停的 feed 被重新订阅时，恢复调度并立即抓取
    if (feed.status !== 'active') {
      await tx
        .update(feeds)
        .set({ status: 'active', errorCount: 0, nextFetchAt: new Date() })
        .where(eq(feeds.id, feed.id))
    }
    await tx
      .insert(subscriptions)
      .values({ userId, feedId: feed.id, titleOverride: input.title, folder: input.folder })
      .onConflictDoNothing()
    return feed
  })
}

export async function unsubscribe(db: Db, userId: string, feedId: string) {
  await db
    .delete(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.feedId, feedId)))
}

export async function listSubscriptions(db: Db, userId: string) {
  return db
    .select({
      feedId: feeds.id,
      sourceUri: feeds.sourceUri,
      title: sql<string>`coalesce(${subscriptions.titleOverride}, ${feeds.title}, ${feeds.sourceUri})`,
      folder: subscriptions.folder,
      siteUrl: feeds.siteUrl,
      imageUrl: feeds.imageUrl,
      status: feeds.status,
      lastError: feeds.lastError,
      lastSuccessAt: feeds.lastSuccessAt,
      subscribedAt: subscriptions.createdAt,
    })
    .from(subscriptions)
    .innerJoin(feeds, eq(feeds.id, subscriptions.feedId))
    .where(eq(subscriptions.userId, userId))
    .orderBy(subscriptions.folder, subscriptions.createdAt)
}

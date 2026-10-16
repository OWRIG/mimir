import { Cron } from 'croner'
import { sql } from 'drizzle-orm'
import type { Db } from '../db/client.ts'
import type { Logger } from '../logger.ts'

/** 清空过保留期且无人星标的正文，元数据保留 */
export async function purgeExpiredContent(db: Db, retentionDays: number, now = new Date()) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60_000)
  const result = await db.execute(sql`
    update items set content_html = null, content_purged_at = ${now}
    where content_purged_at is null and content_html is not null and published_at < ${cutoff}
      and not exists (
        select 1 from item_states st where st.item_id = items.id and st.starred_at is not null
      )
  `)
  return result.rowCount ?? 0
}

export function startMaintenance(deps: { db: Db; logger: Logger; retentionDays: number }) {
  const jobs = [
    new Cron('17 3 * * *', { protect: true }, async () => {
      const purged = await purgeExpiredContent(deps.db, deps.retentionDays)
      deps.logger.info({ purged }, 'purged expired content')
    }),
  ]
  return { stop: () => jobs.forEach((j) => j.stop()) }
}

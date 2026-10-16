import { sql } from 'drizzle-orm'
import pg from 'pg'
import { createDb, type Db } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'
import { feeds, subscriptions, users } from '../db/schema.ts'

/**
 * 集成测试使用真实 Postgres 的独立库（默认 mimir_test，与开发库同实例）。
 * 先 `bun dev:db` 起数据库；CI 中通过 TEST_DATABASE_URL 指定。
 */
const TEST_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://mimir:mimir@localhost:55432/mimir_test'

let ready: Promise<{ db: Db; pool: pg.Pool }> | undefined

async function ensureDatabase(url: string) {
  const target = new URL(url)
  const name = target.pathname.slice(1)
  const admin = new URL(url)
  admin.pathname = '/postgres'
  const client = new pg.Client({ connectionString: admin.toString() })
  try {
    await client.connect()
  } catch (error) {
    throw new Error(`无法连接测试数据库 ${admin.host}，请先运行 \`bun dev:db\``, { cause: error })
  }
  const exists = await client.query('select 1 from pg_database where datname = $1', [name])
  if (exists.rowCount === 0) await client.query(`create database "${name.replace(/"/g, '')}"`)
  await client.end()
}

export function testDb(): Promise<{ db: Db; pool: pg.Pool }> {
  ready ??= (async () => {
    await ensureDatabase(TEST_URL)
    const { db, pool } = createDb(TEST_URL)
    await runMigrations(pool)
    return { db, pool }
  })()
  return ready
}

/** 清空全部业务表；测试文件串行执行，每个用例前调用 */
export async function resetDb(db: Db) {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  )
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ')
  if (tables) await db.execute(sql.raw(`truncate ${tables} restart identity cascade`))
}

let seq = 0
export async function createUser(db: Db, name = `user${++seq}`) {
  const [user] = await db
    .insert(users)
    .values({ name, email: `${name}-${Bun.randomUUIDv7()}@example.com` })
    .returning()
  return user!
}

export async function createFeed(db: Db, values: Partial<typeof feeds.$inferInsert> = {}) {
  const [feed] = await db
    .insert(feeds)
    .values({ sourceUri: `https://feeds.example.com/${Bun.randomUUIDv7()}`, ...values })
    .returning()
  return feed!
}

export async function subscribeTo(db: Db, userId: string, feedId: string) {
  await db.insert(subscriptions).values({ userId, feedId })
}

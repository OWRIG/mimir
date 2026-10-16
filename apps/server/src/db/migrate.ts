import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { logger } from '../logger.ts'

// 任意固定值，用于跨进程互斥：多个容器同时启动时只有一个在执行迁移
const MIGRATION_LOCK_KEY = 0x6d696d6972

export async function runMigrations(pool: pg.Pool): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY])
    await migrate(drizzle(client), {
      migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
    })
    logger.info('database migrations applied')
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {})
    client.release()
  }
}

if (import.meta.main) {
  const { default: pgModule } = await import('pg')
  const pool = new pgModule.Pool({ connectionString: process.env.DATABASE_URL })
  await runMigrations(pool)
  await pool.end()
}

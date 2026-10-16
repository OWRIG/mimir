import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.ts'

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 10 })
  return { db: drizzle(pool, { schema, casing: 'snake_case' }), pool }
}

export type Db = ReturnType<typeof createDb>['db']
export { schema }

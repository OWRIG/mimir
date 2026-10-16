import type { Auth } from '../auth.ts'
import type { Db } from '../db/client.ts'

export type SessionUser = Auth['$Infer']['Session']['user']

export type AppEnv = {
  Variables: { user: SessionUser | null }
}

export type AppDeps = { db: Db; auth: Auth }

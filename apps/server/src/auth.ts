import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { genericOAuth } from 'better-auth/plugins/generic-oauth'
import type { Config } from './config.ts'
import type { Db } from './db/client.ts'
import * as schema from './db/schema.ts'
import { feishuOAuth } from './integrations/feishu/oauth.ts'

export function createAuth(config: Config, db: Db) {
  const providers = new Set(config.MIMIR_AUTH_PROVIDERS)
  const oauthConfigs = []
  if (providers.has('feishu') && config.MIMIR_FEISHU_APP_ID && config.MIMIR_FEISHU_APP_SECRET) {
    oauthConfigs.push(
      feishuOAuth({
        appId: config.MIMIR_FEISHU_APP_ID,
        appSecret: config.MIMIR_FEISHU_APP_SECRET,
        domain: config.MIMIR_FEISHU_DOMAIN,
      }),
    )
  }

  return betterAuth({
    baseURL: config.MIMIR_PUBLIC_URL,
    basePath: '/api/auth',
    secret: config.MIMIR_SECRET_KEY,
    database: drizzleAdapter(db, {
      provider: 'pg',
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
      },
    }),
    advanced: { database: { generateId: () => Bun.randomUUIDv7() } },
    emailAndPassword: { enabled: providers.has('password') },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'member', input: false },
        status: { type: 'string', defaultValue: 'active', input: false },
        locale: { type: 'string', required: false },
      },
    },
    plugins: oauthConfigs.length > 0 ? [genericOAuth({ config: oauthConfigs })] : [],
  })
}

export type Auth = ReturnType<typeof createAuth>

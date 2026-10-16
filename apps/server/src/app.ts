import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { apiRoutes } from './api/routes.ts'
import type { AppDeps, AppEnv } from './api/context.ts'
import type { Config } from './config.ts'
import { logger } from './logger.ts'

export function createApp(
  deps: AppDeps,
  config: Pick<Config, 'MIMIR_AUTH_PROVIDERS' | 'MIMIR_DEFAULT_LOCALE'>,
) {
  const app = new Hono<AppEnv>()
    .get('/healthz', (c) => c.json({ ok: true }))
    // 登录页在未登录时需要知道启用了哪些登录方式
    .get('/api/public/config', (c) =>
      c.json({
        authProviders: config.MIMIR_AUTH_PROVIDERS,
        defaultLocale: config.MIMIR_DEFAULT_LOCALE,
      }),
    )
    .on(['GET', 'POST'], '/api/auth/*', (c) => deps.auth.handler(c.req.raw))
    .use('/api/*', async (c, next) => {
      const session = await deps.auth.api.getSession({ headers: c.req.raw.headers })
      c.set('user', session?.user ?? null)
      await next()
    })
    .route('/api', apiRoutes(deps))

  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse()
    logger.error({ err: error, path: c.req.path }, 'unhandled error')
    return c.json({ error: 'internal_error' }, 500)
  })
  return app
}

/** web 通过 `import type` 引用，用于 Hono RPC 的端到端类型 */
export type AppType = ReturnType<typeof createApp>

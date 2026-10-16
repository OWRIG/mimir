import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { apiRoutes } from './api/routes.ts'
import type { AppDeps, AppEnv } from './api/context.ts'
import { logger } from './logger.ts'

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()
    .get('/healthz', (c) => c.json({ ok: true }))
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

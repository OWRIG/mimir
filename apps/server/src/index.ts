import { createHttpClient, createSourceRegistry } from '@mimir/sources'
import { serveStatic } from 'hono/bun'
import { createApp } from './app.ts'
import { createAuth } from './auth.ts'
import { loadConfig } from './config.ts'
import { createDb } from './db/client.ts'
import { runMigrations } from './db/migrate.ts'
import { logger } from './logger.ts'
import { startFetchLoop } from './worker/fetcher.ts'
import { startMaintenance } from './worker/maintenance.ts'

const config = loadConfig()
const { db, pool } = createDb(config.DATABASE_URL)
if (config.MIMIR_AUTO_MIGRATE) await runMigrations(pool)

const stops: Array<() => Promise<void> | void> = []

if (config.MIMIR_ROLE !== 'worker') {
  const app = createApp({ db, auth: createAuth(config, db) }, config)
  if (config.MIMIR_WEB_DIST) {
    const root = config.MIMIR_WEB_DIST
    app.use('/*', serveStatic({ root }))
    // SPA 回退：未命中静态文件的非 API 路径返回 index.html
    app.get('*', serveStatic({ root, path: 'index.html' }))
  }
  const server = Bun.serve({ port: config.MIMIR_PORT, fetch: app.fetch })
  logger.info({ port: server.port, role: config.MIMIR_ROLE }, 'api listening')
  stops.push(() => server.stop())
}

if (config.MIMIR_ROLE !== 'api') {
  const http = createHttpClient({
    userAgent: config.MIMIR_FETCH_USER_AGENT,
    proxy: config.MIMIR_FETCH_PROXY,
    allowedCidrs: config.MIMIR_FETCH_ALLOWED_CIDRS,
  })
  const registry = createSourceRegistry({ rsshubInstances: config.MIMIR_RSSHUB_URLS })
  const loop = startFetchLoop(
    { db, registry, http, logger },
    { concurrency: config.MIMIR_FETCH_CONCURRENCY },
  )
  const maintenance = startMaintenance({
    db,
    logger,
    retentionDays: config.MIMIR_CONTENT_RETENTION_DAYS,
  })
  logger.info({ concurrency: config.MIMIR_FETCH_CONCURRENCY }, 'worker started')
  stops.push(
    () => maintenance.stop(),
    () => loop.stop(),
  )
}

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down')
  for (const stop of stops) await stop()
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

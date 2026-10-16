import pg from 'pg'

/**
 * 重建 E2E 专用库，保证用例从空库开始。
 * 由 webServer 命令在启动 server 前执行（Playwright 先启动 webServer 再跑 globalSetup，不能放在 globalSetup 里）。
 */
const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const admin = new URL(url)
const name = admin.pathname.slice(1)
admin.pathname = '/postgres'
const client = new pg.Client({ connectionString: admin.toString() })
await client.connect()
await client.query(`drop database if exists "${name.replace(/"/g, '')}" with (force)`)
await client.query(`create database "${name.replace(/"/g, '')}"`)
await client.end()

import { beforeEach, describe, expect, test } from 'bun:test'
import { createApp } from '../app.ts'
import { createAuth } from '../auth.ts'
import { parseConfig } from '../config.ts'
import { items } from '../db/schema.ts'
import { resetDb, testDb } from '../test/db.ts'

const { db } = await testDb()
beforeEach(() => resetDb(db))

const BASE = 'http://localhost:3000'

// 测试里按需断言响应形状
const json = async <T = Record<string, any>>(res: Response | Promise<Response>) =>
  (await (await res).json()) as T
const config = parseConfig({
  DATABASE_URL: 'postgres://unused',
  MIMIR_PUBLIC_URL: BASE,
  MIMIR_SECRET_KEY: 'test-secret-'.padEnd(40, 'x'),
  MIMIR_AUTH_PROVIDERS: 'password',
})
const app = createApp({ db, auth: createAuth(config, db) }, config)

async function signUp(email = `u${Bun.randomUUIDv7()}@example.com`) {
  const res = await app.request(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ email, password: 'correct-horse-battery', name: 'Tester' }),
  })
  expect(res.status).toBe(200)
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  return (path: string, init: RequestInit = {}) =>
    app.request(`${BASE}${path}`, {
      ...init,
      headers: { cookie, origin: BASE, 'content-type': 'application/json', ...init.headers },
    })
}

describe('API', () => {
  test('公开配置无需登录', async () => {
    expect(await json(app.request(`${BASE}/api/public/config`))).toEqual({
      authProviders: ['password'],
      defaultLocale: 'zh-CN',
    })
  })

  test('未登录返回 401', async () => {
    expect((await app.request(`${BASE}/api/me`)).status).toBe(401)
    expect((await app.request(`${BASE}/api/items`)).status).toBe(401)
  })

  test('注册后可获取当前用户，健康检查无需登录', async () => {
    const call = await signUp('alice@example.com')
    const me = await json(call('/api/me'))
    expect(me).toMatchObject({ email: 'alice@example.com', role: 'member' })
    expect((await app.request(`${BASE}/healthz`)).status).toBe(200)
  })

  test('订阅：非法 URI 400，合法 URI 201 且出现在列表中', async () => {
    const call = await signUp()
    const bad = await call('/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ uri: 'ftp://x' }),
    })
    expect(bad.status).toBe(400)
    expect((await json(bad)).error).toBe('invalid_uri')
    const ok = await call('/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ uri: 'https://a.com/rss' }),
    })
    expect(ok.status).toBe(201)
    const list = await json<{ sourceUri: string }[]>(call('/api/subscriptions'))
    expect(list.map((s) => s.sourceUri)).toEqual(['https://a.com/rss'])
  })

  test('条目：只能看到自己订阅的，标记已读后从未读列表消失', async () => {
    const alice = await signUp()
    const bob = await signUp()
    const { feedId } = await json<{ feedId: string }>(
      alice('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ uri: 'https://a.com/rss' }),
      }),
    )
    const [item] = await db
      .insert(items)
      .values({
        feedId,
        guid: 'g',
        guidHash: 'g',
        title: 'Hello',
        contentHtml: '<p>hi</p>',
        publishedAt: new Date(),
      })
      .returning()

    expect((await json(alice('/api/items'))).items).toHaveLength(1)
    expect((await json(bob('/api/items'))).items).toHaveLength(0)
    expect((await bob(`/api/items/${item!.id}`)).status).toBe(404)
    expect((await json(alice(`/api/items/${item!.id}`))).contentHtml).toBe('<p>hi</p>')

    const state = await alice(`/api/items/${item!.id}/state`, {
      method: 'POST',
      body: JSON.stringify({ read: true }),
    })
    expect(state.status).toBe(204)
    expect((await json(alice('/api/items?unreadOnly=true'))).items).toHaveLength(0)
  })

  test('参数校验：非 uuid 的 id 返回 400', async () => {
    const call = await signUp()
    expect((await call('/api/items/not-a-uuid')).status).toBe(400)
  })
})

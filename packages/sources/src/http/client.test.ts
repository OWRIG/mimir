import { describe, expect, test } from 'bun:test'
import { createHttpClient, HttpError } from './client.ts'

const publicLookup = async () => ['93.184.216.34']

function client(fetchImpl: (url: URL) => Response, lookup = publicLookup, maxBytes?: number) {
  return createHttpClient({
    userAgent: 'test',
    minHostIntervalMs: 0,
    maxBytes,
    lookup: async (host) => (host.endsWith('.internal') ? ['10.0.0.5'] : lookup()),
    fetch: (async (input: URL) => fetchImpl(input)) as unknown as typeof fetch,
  })
}

describe('createHttpClient', () => {
  test('跟随重定向并返回最终地址', async () => {
    const http = client((url) =>
      url.pathname === '/a'
        ? new Response(null, { status: 301, headers: { location: '/b' } })
        : new Response('ok'),
    )
    const res = await http.get('https://example.com/a')
    expect(res.url).toBe('https://example.com/b')
    expect(res.body).toBe('ok')
  })

  test('拒绝解析到内网的地址', async () => {
    const http = client(() => new Response('secret'))
    const error = await http.get('https://metadata.internal/').catch((e) => e)
    expect(error).toBeInstanceOf(HttpError)
    expect(error.code).toBe('blocked_address')
  })

  test('拒绝 IP 字面量形式的元数据地址', async () => {
    const http = client(() => new Response('secret'))
    const error = await http.get('http://100.100.100.200/latest/meta-data').catch((e) => e)
    expect(error.code).toBe('blocked_address')
  })

  test('重定向跳到内网时拒绝', async () => {
    const http = client(
      () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }),
    )
    const error = await http.get('https://example.com/').catch((e) => e)
    expect(error.code).toBe('blocked_address')
  })

  test('超过体积上限时拒绝', async () => {
    const http = client(() => new Response('x'.repeat(100)), publicLookup, 10)
    const error = await http.get('https://example.com/').catch((e) => e)
    expect(error.code).toBe('too_large')
  })

  test('拒绝非 http(s) 协议', async () => {
    const http = client(() => new Response('x'))
    const error = await http.get('file:///etc/passwd').catch((e) => e)
    expect(error.code).toBe('bad_protocol')
  })
})

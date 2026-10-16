import { expect, test } from 'bun:test'
import { createSourceRegistry, fetchSource } from './fetch-source.ts'
import type { HttpClient } from './http/client.ts'
import { fixture } from './test-utils.ts'

test('端到端：抓取 → 解析 → pipeline，并把 proxy 配置绑定到每次请求', async () => {
  const body = await fixture('rss.xml')
  const proxies: (boolean | undefined)[] = []
  const http: HttpClient = {
    async get(url, req) {
      proxies.push(req?.useProxy)
      return { status: 200, url: url.toString(), headers: new Headers({ etag: '"e1"' }), body }
    },
  }
  const out = await fetchSource(createSourceRegistry(), http, {
    uri: 'https://blog.example.com/rss',
    config: { proxy: true, transforms: [{ type: 'filter', include: ['first'] }] },
  })
  expect(out.notModified).toBe(false)
  if (out.notModified) return
  expect(out.etag).toBe('"e1"')
  expect(out.feed.items.map((i) => i.guid)).toEqual(['post-1'])
  expect(out.feed.items[0]?.content).toContain('src="https://blog.example.com/img/a.png"')
  expect(proxies).toEqual([true])
})

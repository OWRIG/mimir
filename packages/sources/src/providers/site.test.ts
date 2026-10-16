import { describe, expect, test } from 'bun:test'
import { ctxOf, fakeHttp } from '../test-utils.ts'
import { createSiteProvider, matchRoutePath, UnknownSiteRouteError } from './site.ts'

describe('matchRoutePath', () => {
  const pattern = '/github/trending/:since?/:language?'
  test.each([
    ['/github/trending', {}],
    ['/github/trending/weekly', { since: 'weekly' }],
    ['/github/trending/daily/c%2B%2B', { since: 'daily', language: 'c++' }],
  ])('%s', (path, params) => expect(matchRoutePath(pattern, path)).toEqual(params))
  test('不匹配', () => {
    expect(matchRoutePath(pattern, '/github/issues')).toBeNull()
    expect(matchRoutePath(pattern, '/github/trending/a/b/c')).toBeNull()
    expect(matchRoutePath('/a/:id', '/a')).toBeNull()
  })
})

test('site provider 分发到匹配的路由，查询参数并入 params', async () => {
  let received: Record<string, string> = {}
  const provider = createSiteProvider([
    {
      path: '/demo/:id',
      name: 'demo',
      url: 'demo.example.com',
      example: '/demo/1',
      handler: async (params) => {
        received = params
        return { title: 'demo', item: [] }
      },
    },
  ])
  await provider.fetch(new URL('site://demo/42?lang=zh'), ctxOf(fakeHttp({})))
  expect(received).toEqual({ id: '42', lang: 'zh' })
  await expect(
    provider.fetch(new URL('site://nope/1'), ctxOf(fakeHttp({}))),
  ).rejects.toBeInstanceOf(UnknownSiteRouteError)
})

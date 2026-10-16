import { expect, test } from 'bun:test'
import { ctxOf, fakeHttp } from '../../test-utils.ts'
import { githubTrending, parseTrending } from './trending.ts'

const html = () => Bun.file(new URL('./__fixtures__/trending-daily.html', import.meta.url)).text()

test('解析 trending 列表', async () => {
  const items = parseTrending(await html(), 'https://github.com/trending?since=daily')
  expect(items).toHaveLength(3)
  expect(items[0]).toMatchObject({
    title: 'morluto / rea',
    link: 'https://github.com/morluto/rea',
    category: ['TypeScript'],
  })
  expect(items[0]?.description).toContain('Reverse engineer anything')
  expect(items[0]?.description).toContain('stars today')
})

test('handler 根据参数拼出地址', async () => {
  const http = fakeHttp({
    'https://github.com/trending/typescript?since=weekly': { body: await html() },
  })
  const feed = await githubTrending.handler(
    { since: 'weekly', language: 'typescript' },
    ctxOf(http),
  )
  expect(feed.title).toBe('GitHub Trending · typescript (weekly)')
  expect(feed.item).toHaveLength(3)
})

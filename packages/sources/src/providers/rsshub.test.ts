import { expect, test } from 'bun:test'
import { ctxOf, fakeHttp, fixture } from '../test-utils.ts'
import { createRsshubProvider } from './rsshub.ts'

test('解析到实例，并在失败时回退到下一个实例', async () => {
  const http = fakeHttp({
    'https://hub2.example.com/github/trending/daily?limit=5': { body: await fixture('rss.xml') },
  })
  const provider = createRsshubProvider(['https://hub1.example.com/', 'https://hub2.example.com'])
  const result = await provider.fetch(
    new URL('rsshub://github/trending/daily?limit=5'),
    ctxOf(http),
  )
  expect(http.calls).toEqual([
    'https://hub1.example.com/github/trending/daily?limit=5',
    'https://hub2.example.com/github/trending/daily?limit=5',
  ])
  expect(result.notModified).toBeFalsy()
})

test('未配置实例时报错', async () => {
  await expect(
    createRsshubProvider([]).fetch(new URL('rsshub://a/b'), ctxOf(fakeHttp({}))),
  ).rejects.toThrow('No RSSHub instance')
})

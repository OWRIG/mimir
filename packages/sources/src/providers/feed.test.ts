import { describe, expect, test } from 'bun:test'
import { fakeHttp, ctxOf, fixture } from '../test-utils.ts'
import { feedProvider, parseFeedDocument } from './feed.ts'

describe('parseFeedDocument', () => {
  test('RSS 2.0：content:encoded 作为正文，description 作为摘要', async () => {
    const feed = parseFeedDocument(await fixture('rss.xml'))
    expect(feed.title).toBe('Example Blog')
    expect(feed.item[0]).toMatchObject({
      title: 'First post',
      guid: 'post-1',
      author: 'Alice',
      category: ['news'],
      summary: 'Short <b>summary</b>',
    })
    expect(feed.item[0]?.description).toContain('Hello')
  })
  test('Atom', async () => {
    const feed = parseFeedDocument(await fixture('atom.xml'))
    expect(feed.link).toBe('https://atom.example.com/')
    expect(feed.item[0]).toMatchObject({
      guid: 'urn:entry:1',
      link: 'https://atom.example.com/1',
      author: 'Bob',
    })
    expect(feed.item[0]?.pubDate).toBe('2025-01-01T00:00:00Z')
  })
  test('JSON Feed', async () => {
    const feed = parseFeedDocument(await fixture('feed.json'))
    expect(feed.item[0]).toMatchObject({ guid: 'j1', author: 'Carol', category: ['a', 'b'] })
  })
  test('RDF', async () => {
    const feed = parseFeedDocument(await fixture('rdf.xml'))
    expect(feed.item[0]).toMatchObject({
      title: 'RDF item',
      author: 'Dan',
      pubDate: '2025-02-01T00:00:00Z',
    })
  })
})

describe('feedProvider', () => {
  test('发送条件请求头并识别 304', async () => {
    const seen: Record<string, string>[] = []
    const http = {
      async get(url: string | URL, req?: { headers?: Record<string, string> }) {
        seen.push(req?.headers ?? {})
        return { status: 304, url: url.toString(), headers: new Headers(), body: '' }
      },
    }
    const result = await feedProvider.fetch(new URL('https://a.com/rss'), {
      http,
      conditional: { etag: '"v1"', lastModified: 'Tue, 10 Jun 2025 04:00:00 GMT' },
    })
    expect(result.notModified).toBe(true)
    expect(seen[0]).toMatchObject({
      'if-none-match': '"v1"',
      'if-modified-since': 'Tue, 10 Jun 2025 04:00:00 GMT',
    })
  })
  test('非 2xx 抛错', async () => {
    const http = fakeHttp({})
    await expect(feedProvider.fetch(new URL('https://a.com/missing'), ctxOf(http))).rejects.toThrow(
      'HTTP 404',
    )
  })
})

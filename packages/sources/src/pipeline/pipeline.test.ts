import { describe, expect, test } from 'bun:test'
import { ctxOf, fakeHttp } from '../test-utils.ts'
import type { RawFeed } from '../types.ts'
import { runPipeline } from './index.ts'

const raw = (item: RawFeed['item']): RawFeed => ({
  title: ' Feed ',
  link: 'https://a.com/blog/',
  item,
})

describe('runPipeline', () => {
  test('归一化：guid 兜底、日期解析、相对地址补全', async () => {
    const out = await runPipeline(
      raw([
        { title: 'A', link: '/p/1', pubDate: 'Tue, 10 Jun 2025 04:00:00 GMT' },
        { title: 'B', pubDate: 'not a date' },
        { description: 'no title no link' },
      ]),
      [],
      ctxOf(fakeHttp({})),
    )
    expect(out.title).toBe('Feed')
    expect(out.items).toHaveLength(2)
    expect(out.items[0]).toMatchObject({ guid: 'https://a.com/p/1', link: 'https://a.com/p/1' })
    expect(out.items[0]?.pubDate?.toISOString()).toBe('2025-06-10T04:00:00.000Z')
    expect(out.items[1]).toMatchObject({ guid: 'B|', pubDate: undefined })
  })

  test('清洗：去脚本与事件属性，链接加 rel，图片补全并提取首图，摘要转纯文本', async () => {
    const out = await runPipeline(
      raw([
        {
          title: 'X',
          link: 'https://a.com/p/x',
          summary: 'Short <b>bold</b>',
          description:
            '<p onclick="evil()">Hi <a href="javascript:alert(1)">bad</a> <a href="/ok">ok</a></p><img src="i.png"><script>alert(1)</script><iframe src="https://x"></iframe>',
        },
      ]),
      [],
      ctxOf(fakeHttp({})),
    )
    const item = out.items[0]!
    expect(item.content).not.toContain('script')
    expect(item.content).not.toContain('onclick')
    expect(item.content).not.toContain('javascript:')
    expect(item.content).not.toContain('iframe')
    expect(item.content).toContain('href="https://a.com/ok"')
    expect(item.content).toContain('rel="noopener noreferrer nofollow"')
    expect(item.image).toBe('https://a.com/p/i.png')
    expect(item.summary).toBe('Short bold')
  })

  test('filter / select / rewrite 按声明顺序执行', async () => {
    const out = await runPipeline(
      raw([
        { title: '招聘：前端', link: 'https://a.com/1', description: '<p>job</p>' },
        {
          title: 'Release v2',
          link: 'http://a.com/2',
          description: '<div class="ad">AD</div><p>body</p>',
        },
      ]),
      [
        { type: 'filter', exclude: ['招聘'] },
        { type: 'select', remove: ['.ad'] },
        { type: 'rewrite', rules: [{ target: 'link', pattern: '^http:', replace: 'https:' }] },
      ],
      ctxOf(fakeHttp({})),
    )
    expect(out.items.map((i) => i.title)).toEqual(['Release v2'])
    expect(out.items[0]?.content).toBe('<p>body</p>')
    expect(out.items[0]?.link).toBe('https://a.com/2')
  })

  test('fulltext：用 readability 提取正文，原内容降为摘要；失败时保留原内容', async () => {
    const article = `<html><head><title>T</title></head><body><nav>menu menu</nav><article><h1>Title</h1>${'<p>Long readable paragraph with enough words to be considered content by readability.</p>'.repeat(8)}</article><footer>footer</footer></body></html>`
    const http = fakeHttp({ 'https://a.com/full': { body: article } })
    const out = await runPipeline(
      raw([
        { title: 'F', link: 'https://a.com/full', description: 'teaser' },
        { title: 'G', link: 'https://a.com/missing', description: 'kept' },
      ]),
      [{ type: 'fulltext' }],
      ctxOf(http),
    )
    expect(out.items[0]?.content).toContain('Long readable paragraph')
    expect(out.items[0]?.content).not.toContain('menu menu')
    expect(out.items[0]?.summary).toBe('teaser')
    expect(out.items[1]?.content).toBe('kept')
  })
})

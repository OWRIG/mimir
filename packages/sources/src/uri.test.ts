import { describe, expect, test } from 'bun:test'
import { canonicalItemUrl, InvalidSourceUriError, normalizeSourceUri } from './uri.ts'

describe('normalizeSourceUri', () => {
  test('http(s): 去 fragment、追踪参数并排序参数，保留末尾斜杠', () => {
    expect(normalizeSourceUri(' HTTPS://Example.COM/feed/?b=2&utm_source=x&a=1#top ')).toBe(
      'https://example.com/feed/?a=1&b=2',
    )
  })
  test('缺省 scheme 补 https', () => {
    expect(normalizeSourceUri('example.com/rss')).toBe('https://example.com/rss')
  })
  test('去掉 userinfo', () => {
    expect(normalizeSourceUri('https://u:p@example.com/rss')).toBe('https://example.com/rss')
  })
  test('rsshub/site: 首段小写、去末尾斜杠、路径保留大小写', () => {
    expect(normalizeSourceUri('rsshub://GitHub/trending/Daily/')).toBe(
      'rsshub://github/trending/Daily',
    )
    expect(normalizeSourceUri('site://github/trending?b=1&a=2')).toBe(
      'site://github/trending?a=2&b=1',
    )
  })
  test('拒绝不支持的 scheme 与空输入', () => {
    expect(() => normalizeSourceUri('ftp://x.com/a')).toThrow(InvalidSourceUriError)
    expect(() => normalizeSourceUri('file:///etc/passwd')).toThrow(InvalidSourceUriError)
    expect(() => normalizeSourceUri('  ')).toThrow(InvalidSourceUriError)
  })
})

test('canonicalItemUrl', () => {
  expect(canonicalItemUrl('https://a.com/p?utm_medium=x&id=1#c')).toBe('https://a.com/p?id=1')
  expect(canonicalItemUrl('javascript:alert(1)')).toBeUndefined()
})

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'spm',
  'yclid',
])

function stripTracking(url: URL): void {
  // 先复制键列表：边遍历边删除会跳过元素
  for (const key of Array.from(url.searchParams.keys())) {
    if (key.startsWith('utm_') || TRACKING_PARAMS.has(key)) url.searchParams.delete(key)
  }
  url.searchParams.sort()
}

export class InvalidSourceUriError extends Error {
  constructor(input: string, reason: string) {
    super(`Invalid source URI "${input}": ${reason}`)
    this.name = 'InvalidSourceUriError'
  }
}

/**
 * 把用户输入的源地址规范成 feed 的全局身份。同一个源必须得到同一个字符串，
 * 否则全局去重失效、同一 feed 会被抓多次。
 *
 * - http(s)：去 fragment、去追踪参数、参数排序；保留末尾斜杠（部分站点对它敏感）
 * - rsshub: / site:：路由由我们解析，首段（站点名）转小写、去掉末尾斜杠
 */
export function normalizeSourceUri(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new InvalidSourceUriError(input, 'empty')
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new InvalidSourceUriError(input, 'unparseable')
  }
  url.hash = ''
  switch (url.protocol) {
    case 'http:':
    case 'https:':
      if (!url.hostname) throw new InvalidSourceUriError(input, 'missing host')
      url.username = ''
      url.password = ''
      stripTracking(url)
      return url.toString()
    case 'rsshub:':
    case 'site:': {
      // 非特殊 scheme 的 host 不会被 URL 自动转小写
      const host = url.host.toLowerCase()
      if (!host) throw new InvalidSourceUriError(input, 'missing route')
      const path = url.pathname.replace(/\/+$/, '')
      url.searchParams.sort()
      return `${url.protocol}//${host}${path}${url.search}`
    }
    default:
      throw new InvalidSourceUriError(input, `unsupported scheme ${url.protocol}`)
  }
}

/** 条目链接的规范形式，用于跨 feed 识别同一篇内容 */
export function canonicalItemUrl(link: string): string | undefined {
  try {
    const url = new URL(link)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    url.hash = ''
    stripTracking(url)
    return url.toString()
  } catch {
    return undefined
  }
}

/** rsshub:// 与 site:// URI 对应的路由路径（含站点首段） */
export function routePathOf(uri: URL): string {
  return `/${uri.host}${uri.pathname}`.replace(/\/+$/, '') || '/'
}

import * as cheerio from 'cheerio'
import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  'img',
  'picture',
  'source',
  'figure',
  'figcaption',
  'video',
  'audio',
  'h1',
  'h2',
  'del',
  'ins',
  'sup',
  'sub',
]

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'srcset', 'alt', 'title', 'width', 'height'],
    source: ['src', 'srcset', 'type', 'media'],
    video: ['src', 'poster', 'controls', 'width', 'height'],
    audio: ['src', 'controls'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    code: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer nofollow' }),
  },
}

/** 相对地址补全为绝对地址，必须在清洗前做（清洗会丢弃无法识别的相对 scheme） */
export function absolutizeHtml(html: string, base: string | undefined): string {
  if (!base) return html
  const $ = cheerio.load(html, null, false)
  const fix = (value: string | undefined) => {
    if (!value) return value
    try {
      return new URL(value, base).toString()
    } catch {
      return value
    }
  }
  $('a[href]').each((_, el) => void $(el).attr('href', fix($(el).attr('href'))))
  $('img[src], video[src], audio[src], source[src]').each(
    (_, el) => void $(el).attr('src', fix($(el).attr('src'))),
  )
  $('img[data-src]').each((_, el) => {
    // 常见懒加载写法：真实地址放在 data-src
    if (!$(el).attr('src')) $(el).attr('src', fix($(el).attr('data-src')))
  })
  return $.html()
}

/** 入库前固定执行的清洗，前端可以直接渲染其结果 */
export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim()
}

export function firstImage(html: string): string | undefined {
  return cheerio.load(html, null, false)('img[src]').first().attr('src') || undefined
}

/** 摘要只作为纯文本展示 */
export function toPlainText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim()
}

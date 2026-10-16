import * as cheerio from 'cheerio'
import { escapeHtml } from '../../html.ts'
import type { RawFeed, SiteRoute } from '../../types.ts'

const PERIODS = new Set(['daily', 'weekly', 'monthly'])

export function parseTrending(html: string, pageUrl: string): RawFeed['item'] {
  const $ = cheerio.load(html)
  return $('article.Box-row')
    .toArray()
    .map((el) => {
      const row = $(el)
      const href = row.find('h2 a').attr('href')
      if (!href) return null
      const repo = href.replace(/^\//, '')
      const description = row.find('p').first().text().trim()
      const language = row.find('[itemprop="programmingLanguage"]').text().trim()
      const stars = row.find('a[href$="/stargazers"]').text().trim()
      const starsToday = row.find('span.float-sm-right').text().trim()
      const meta = [language, stars && `★ ${stars}`, starsToday].filter(Boolean).join(' · ')
      return {
        title: repo.replace('/', ' / '),
        link: new URL(href, pageUrl).toString(),
        description: [description, meta]
          .filter(Boolean)
          .map((t) => `<p>${escapeHtml(t)}</p>`)
          .join(''),
        category: language ? [language] : undefined,
      }
    })
    .filter((item) => item !== null)
}

export const githubTrending: SiteRoute = {
  path: '/github/trending/:since?/:language?',
  name: 'GitHub Trending',
  url: 'github.com/trending',
  example: '/github/trending/daily/typescript',
  parameters: {
    since: 'daily | weekly | monthly，默认 daily',
    language: '编程语言，如 typescript；留空为全部语言',
  },
  async handler(params, ctx) {
    const since = PERIODS.has(params.since ?? '') ? params.since! : 'daily'
    const language = params.language ? `/${encodeURIComponent(params.language)}` : ''
    const url = `https://github.com/trending${language}?since=${since}`
    const res = await ctx.http.get(url, { signal: ctx.signal, headers: { accept: 'text/html' } })
    if (res.status !== 200) throw new Error(`GitHub trending responded ${res.status}`)
    return {
      title: `GitHub Trending${params.language ? ` · ${params.language}` : ''} (${since})`,
      link: url,
      item: parseTrending(res.body, url),
    }
  },
}

import { routePathOf } from '../uri.ts'
import type { SiteRoute, SourceProvider } from '../types.ts'

/** 极简的 Hono 风格路径匹配：支持 `:name` 与可选的 `:name?`，不支持通配与正则 */
export function matchRoutePath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)
  if (pathParts.length > patternParts.length) return null
  const params: Record<string, string> = {}
  for (const [i, part] of patternParts.entries()) {
    const value = pathParts[i]
    if (part.startsWith(':')) {
      const optional = part.endsWith('?')
      const name = part.slice(1, optional ? -1 : undefined)
      if (value === undefined) {
        if (!optional) return null
        continue
      }
      params[name] = decodeURIComponent(value)
    } else if (part !== value) {
      return null
    }
  }
  return params
}

export class UnknownSiteRouteError extends Error {
  constructor(path: string) {
    super(`No site adapter matches ${path}`)
    this.name = 'UnknownSiteRouteError'
  }
}

export function createSiteProvider(routes: readonly SiteRoute[]): SourceProvider {
  return {
    schemes: ['site:'],
    async fetch(uri, ctx) {
      const path = routePathOf(uri)
      for (const route of routes) {
        const params = matchRoutePath(route.path, path)
        if (!params) continue
        for (const [key, value] of uri.searchParams) params[key] ??= value
        return { feed: await route.handler(params, ctx) }
      }
      throw new UnknownSiteRouteError(path)
    },
  }
}

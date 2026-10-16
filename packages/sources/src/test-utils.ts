import type { HttpClient, HttpResponse } from './http/client.ts'
import type { FetchContext } from './types.ts'

type Route = Partial<HttpResponse> & { body: string }

/** 按 URL 返回固定响应的假 HttpClient，测试中不访问真实网络 */
export function fakeHttp(routes: Record<string, Route>): HttpClient & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async get(url) {
      const key = url.toString()
      calls.push(key)
      const route = routes[key]
      if (!route) return { status: 404, url: key, headers: new Headers(), body: '' }
      return { status: 200, url: key, headers: new Headers(), ...route }
    },
  }
}

export function ctxOf(http: HttpClient): FetchContext {
  return { http, conditional: {} }
}

export const fixture = (name: string) =>
  Bun.file(new URL(`./__fixtures__/${name}`, import.meta.url)).text()

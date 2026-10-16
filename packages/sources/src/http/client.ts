import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { createAddressPolicy } from './address.ts'

export type HttpErrorCode =
  | 'blocked_address'
  | 'bad_protocol'
  | 'too_many_redirects'
  | 'too_large'
  | 'timeout'
  | 'network'

export class HttpError extends Error {
  constructor(
    readonly code: HttpErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export type HttpResponse = {
  status: number
  /** 跟随重定向后的最终地址 */
  url: string
  headers: Headers
  body: string
}

export type HttpRequest = {
  headers?: Record<string, string>
  signal?: AbortSignal
  /** 本次请求是否走代理；未配置代理时忽略 */
  useProxy?: boolean
}

export interface HttpClient {
  get(url: string | URL, req?: HttpRequest): Promise<HttpResponse>
}

export type LookupFn = (hostname: string) => Promise<string[]>

export type HttpClientOptions = {
  userAgent: string
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  /** 同一 host 两次请求的最小间隔，多个 feed 同站时互相让路 */
  minHostIntervalMs?: number
  proxy?: string
  /** 额外放行的网段（如 fake-IP 代理的 198.18.0.0/15）；默认只放行公网单播地址 */
  allowedCidrs?: readonly string[]
  lookup?: LookupFn
  fetch?: typeof fetch
}

const defaultLookup: LookupFn = async (hostname) =>
  (await dnsLookup(hostname, { all: true, verbatim: true })).map((r) => r.address)

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const {
    userAgent,
    timeoutMs = 20_000,
    maxBytes = 10 * 1024 * 1024,
    maxRedirects = 5,
    minHostIntervalMs = 1_000,
    proxy,
    allowedCidrs = [],
    lookup = defaultLookup,
    fetch: fetchImpl = fetch,
  } = options
  const isAllowedAddress = createAddressPolicy(allowedCidrs)
  const nextSlotByHost = new Map<string, number>()

  async function assertAllowed(url: URL): Promise<void> {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new HttpError('bad_protocol', `Unsupported protocol ${url.protocol}`)
    }
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const addresses = isIP(host) ? [host] : await lookup(host).catch(() => [])
    if (addresses.length === 0) throw new HttpError('network', `Cannot resolve ${host}`)
    // 任一解析结果是非公网地址都拒绝，防止多 A 记录混入内网地址。
    // 已知局限：解析与连接之间存在 DNS rebinding 窗口；走代理时由代理侧解析。
    if (!addresses.every(isAllowedAddress)) {
      throw new HttpError('blocked_address', `Blocked non-public address for ${host}`)
    }
  }

  async function waitHostSlot(host: string): Promise<void> {
    const now = Date.now()
    const slot = Math.max(now, nextSlotByHost.get(host) ?? 0)
    nextSlotByHost.set(host, slot + minHostIntervalMs)
    if (slot > now) await Bun.sleep(slot - now)
  }

  async function readLimited(res: Response): Promise<string> {
    const declared = Number(res.headers.get('content-length'))
    if (declared > maxBytes) throw new HttpError('too_large', `Body exceeds ${maxBytes} bytes`)
    if (!res.body) return ''
    const chunks: Uint8Array[] = []
    let total = 0
    for await (const chunk of res.body) {
      total += chunk.byteLength
      if (total > maxBytes) throw new HttpError('too_large', `Body exceeds ${maxBytes} bytes`)
      chunks.push(chunk)
    }
    return new TextDecoder().decode(Buffer.concat(chunks))
  }

  return {
    async get(input, req = {}) {
      let url = new URL(input)
      const timeout = AbortSignal.timeout(timeoutMs)
      const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout
      try {
        // 手动跟随重定向：每一跳都重新做地址校验，防止公网地址 30x 跳到内网
        for (let hop = 0; hop <= maxRedirects; hop++) {
          await assertAllowed(url)
          await waitHostSlot(url.host)
          const res = await fetchImpl(url, {
            redirect: 'manual',
            signal,
            headers: { 'user-agent': userAgent, accept: '*/*', ...req.headers },
            ...(proxy && req.useProxy ? { proxy } : {}),
          })
          const location = res.headers.get('location')
          if (res.status >= 300 && res.status < 400 && location) {
            await res.body?.cancel()
            url = new URL(location, url)
            continue
          }
          return {
            status: res.status,
            url: url.toString(),
            headers: res.headers,
            body: await readLimited(res),
          }
        }
        throw new HttpError('too_many_redirects', `More than ${maxRedirects} redirects`)
      } catch (error) {
        if (error instanceof HttpError) throw error
        if (timeout.aborted) throw new HttpError('timeout', `Timed out after ${timeoutMs}ms`)
        throw new HttpError('network', error instanceof Error ? error.message : String(error))
      }
    },
  }
}

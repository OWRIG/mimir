import type { AppType } from '@mimir/server/app'
import {
  type ClientResponse,
  DetailedError,
  hc,
  type InferResponseType,
  parseResponse,
} from 'hono/client'

/** 类型来自 server 路由定义（仅类型引用，不打包 server 代码） */
export const api = hc<AppType>('/', { init: { credentials: 'include' } }).api

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** 解析成功响应的类型化数据；非 2xx 统一转换为 ApiError，便于 react-query 处理 */
export async function unwrap<T extends ClientResponse<unknown>>(res: T | Promise<T>) {
  try {
    return await parseResponse(res)
  } catch (error) {
    if (!(error instanceof DetailedError)) throw error
    const body = (error.detail?.data ?? {}) as { error?: string; message?: string }
    throw new ApiError(
      Number(error.statusCode ?? 0),
      body.error,
      body.message ?? body.error ?? error.message,
    )
  }
}

export type TimelineItem = InferResponseType<typeof api.items.$get, 200>['items'][number]
export type Subscription = InferResponseType<typeof api.subscriptions.$get, 200>[number]

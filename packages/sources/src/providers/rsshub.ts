import { routePathOf } from '../uri.ts'
import type { SourceProvider } from '../types.ts'
import { fetchFeedDocument } from './feed.ts'

/**
 * rsshub://<route> 在运行时解析到配置的实例，URI 本身不绑定实例，换实例不影响已有订阅。
 * 多个实例按顺序回退；只有最后一个实例的错误会抛出。
 */
export function createRsshubProvider(instances: readonly string[]): SourceProvider {
  return {
    schemes: ['rsshub:'],
    async fetch(uri, ctx) {
      if (instances.length === 0) throw new Error('No RSSHub instance configured')
      let lastError: unknown
      for (const [index, base] of instances.entries()) {
        const target = new URL(base.replace(/\/+$/, '') + routePathOf(uri) + uri.search)
        try {
          // 条件请求头只对产生它的实例有意义，回退到其他实例时不带
          return await fetchFeedDocument(target, index === 0 ? ctx : { ...ctx, conditional: {} })
        } catch (error) {
          lastError = error
        }
      }
      throw lastError
    },
  }
}

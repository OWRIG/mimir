import type { SiteRoute } from '../types.ts'
import { githubTrending } from './github/trending.ts'

/** 全部内置站点适配器。新增适配器在这里登记 */
export const siteRoutes: readonly SiteRoute[] = [githubTrending]

import { z } from 'zod'

export const transformSchema = z.discriminatedUnion('type', [
  /** feed 只给摘要时抓原文；selector 指定时用它取正文，否则用 readability */
  z.object({ type: z.literal('fulltext'), selector: z.string().min(1).optional() }),
  /** 在正文里删除元素，或只保留匹配元素 */
  z.object({
    type: z.literal('select'),
    remove: z.array(z.string().min(1)).optional(),
    keep: z.string().min(1).optional(),
  }),
  /** 按标题与正文文本过滤条目；pattern 为不区分大小写的正则 */
  z.object({
    type: z.literal('filter'),
    include: z.array(z.string().min(1)).optional(),
    exclude: z.array(z.string().min(1)).optional(),
  }),
  /** 对链接与正文做正则替换 */
  z.object({
    type: z.literal('rewrite'),
    rules: z
      .array(
        z.object({
          target: z.enum(['link', 'content']),
          pattern: z.string().min(1),
          replace: z.string(),
        }),
      )
      .min(1),
  }),
])

export const sourceConfigSchema = z.object({
  /** 覆盖自适应抓取间隔（分钟） */
  intervalMinutes: z.number().int().min(5).max(1440).optional(),
  /** 是否经部署配置的出口代理抓取 */
  proxy: z.boolean().optional(),
  transforms: z.array(transformSchema).optional(),
})

export type Transform = z.infer<typeof transformSchema>
export type SourceConfig = z.infer<typeof sourceConfigSchema>

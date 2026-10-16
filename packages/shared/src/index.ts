import { z } from 'zod'

export const subscribeInput = z.object({
  uri: z.string().trim().min(1).max(2048),
  title: z.string().trim().max(200).optional(),
  folder: z.string().trim().max(100).optional(),
})
export type SubscribeInput = z.infer<typeof subscribeInput>

export const itemsQuery = z.object({
  feedId: z.uuid().optional(),
  unreadOnly: z.enum(['true', 'false']).optional(),
  starredOnly: z.enum(['true', 'false']).optional(),
  /** 不透明游标，取自上一页响应的 nextCursor */
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})
export type ItemsQuery = z.infer<typeof itemsQuery>

export const itemStateInput = z
  .object({ read: z.boolean().optional(), starred: z.boolean().optional() })
  .refine((v) => v.read !== undefined || v.starred !== undefined, {
    message: 'read or starred required',
  })
export type ItemStateInput = z.infer<typeof itemStateInput>

export const markFeedReadInput = z.object({
  /** 把该时间点及之前的条目视为已读；缺省为当前时间 */
  before: z.iso.datetime().optional(),
})

export const FEED_STATUSES = ['active', 'paused', 'dead'] as const
export type FeedStatus = (typeof FEED_STATUSES)[number]

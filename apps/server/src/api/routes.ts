import { zValidator } from '@hono/zod-validator'
import { itemsQuery, itemStateInput, markFeedReadInput, subscribeInput } from '@mimir/shared'
import { InvalidSourceUriError } from '@mimir/sources'
import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import { getItem, listItems, markFeedsRead, setItemState } from '../feeds/items.ts'
import { listSubscriptions, subscribe, unsubscribe } from '../feeds/subscriptions.ts'
import type { AppDeps, AppEnv, SessionUser } from './context.ts'

const requireUser = createMiddleware<{ Variables: { user: SessionUser } }>(async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'unauthorized' }, 401)
  await next()
})

const idParam = z.object({ id: z.uuid() })

/** 业务 API。所有数据范围都经 feeds/visibility.ts 计算，这里不写权限查询 */
export function apiRoutes({ db }: AppDeps) {
  return new Hono<AppEnv>()
    .use(requireUser)
    .get('/me', (c) => {
      const user = c.get('user')!
      return c.json({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        role: user.role,
      })
    })
    .get('/subscriptions', async (c) => c.json(await listSubscriptions(db, c.get('user')!.id)))
    .post('/subscriptions', zValidator('json', subscribeInput), async (c) => {
      try {
        const feed = await subscribe(db, c.get('user')!.id, c.req.valid('json'))
        return c.json({ feedId: feed.id, sourceUri: feed.sourceUri }, 201)
      } catch (error) {
        if (error instanceof InvalidSourceUriError)
          return c.json({ error: 'invalid_uri', message: error.message }, 400)
        throw error
      }
    })
    .delete('/subscriptions/:id', zValidator('param', idParam), async (c) => {
      await unsubscribe(db, c.get('user')!.id, c.req.valid('param').id)
      return c.body(null, 204)
    })
    .post(
      '/subscriptions/:id/read',
      zValidator('param', idParam),
      zValidator('json', markFeedReadInput),
      async (c) => {
        const { before } = c.req.valid('json')
        await markFeedsRead(
          db,
          c.get('user')!.id,
          [c.req.valid('param').id],
          before ? new Date(before) : new Date(),
        )
        return c.body(null, 204)
      },
    )
    .get('/items', zValidator('query', itemsQuery), async (c) =>
      c.json(await listItems(db, c.get('user')!.id, c.req.valid('query'))),
    )
    .get('/items/:id', zValidator('param', idParam), async (c) => {
      const item = await getItem(db, c.get('user')!.id, c.req.valid('param').id)
      return item ? c.json(item) : c.json({ error: 'not_found' }, 404)
    })
    .post(
      '/items/:id/state',
      zValidator('param', idParam),
      zValidator('json', itemStateInput),
      async (c) => {
        const ok = await setItemState(
          db,
          c.get('user')!.id,
          c.req.valid('param').id,
          c.req.valid('json'),
        )
        return ok ? c.body(null, 204) : c.json({ error: 'not_found' }, 404)
      },
    )
}

import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { z } from 'zod'
import { authClient } from './lib/auth-client.ts'
import { LoginPage } from './routes/login.tsx'
import { ReaderPage } from './routes/reader.tsx'

const rootRoute = createRootRoute({ component: Outlet })

async function currentSession() {
  const { data } = await authClient.getSession()
  return data
}

const readerSearch = z.object({
  feedId: z.uuid().optional(),
  filter: z.enum(['all', 'unread', 'starred']).optional(),
  itemId: z.uuid().optional(),
})
export type ReaderSearch = z.infer<typeof readerSearch>

const readerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: readerSearch,
  beforeLoad: async () => {
    if (!(await currentSession())) throw redirect({ to: '/login' })
  },
  component: ReaderPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: async () => {
    if (await currentSession()) throw redirect({ to: '/' })
  },
  component: LoginPage,
})

export const router = createRouter({ routeTree: rootRoute.addChildren([readerRoute, loginRoute]) })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

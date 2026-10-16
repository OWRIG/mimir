import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type Subscription, type TimelineItem, unwrap } from '../lib/api.ts'
import { authClient } from '../lib/auth-client.ts'
import { formatTime } from '../lib/format.ts'

const route = getRouteApi('/')

export function ReaderPage() {
  const search = route.useSearch()
  return (
    <div className="grid h-screen grid-cols-[16rem_24rem_1fr] bg-white text-zinc-900">
      <Sidebar activeFeedId={search.feedId} filter={search.filter ?? 'all'} />
      <ItemList
        feedId={search.feedId}
        filter={search.filter ?? 'all'}
        activeItemId={search.itemId}
      />
      <ItemDetail itemId={search.itemId} />
    </div>
  )
}

/* ------------------------------- 侧栏 ------------------------------- */

function Sidebar({
  activeFeedId,
  filter,
}: {
  activeFeedId?: string
  filter: 'all' | 'unread' | 'starred'
}) {
  const { t } = useTranslation()
  const navigate = useNavigate({ from: '/' })
  const { data: subscriptions = [] } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => unwrap(api.subscriptions.$get()),
    // 新订阅的源需要几秒完成首次抓取，期间轮询刷新标题与状态
    refetchInterval: (q) =>
      q.state.data?.some((s) => !s.lastSuccessAt && !s.lastError) ? 3_000 : false,
  })

  return (
    <aside className="flex min-h-0 flex-col border-r border-zinc-200 bg-zinc-50">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-semibold">{t('app.name')}</span>
        <button
          type="button"
          className="text-xs text-zinc-500 hover:text-zinc-800"
          onClick={async () => {
            await authClient.signOut()
            await navigate({ to: '/login' })
          }}
        >
          {t('auth.signOut')}
        </button>
      </div>
      <nav className="px-2">
        {(['all', 'unread', 'starred'] as const).map((f) => (
          <NavButton
            key={f}
            active={!activeFeedId && filter === f}
            onClick={() => navigate({ search: { filter: f } })}
          >
            {t(`reader.${f}`)}
          </NavButton>
        ))}
      </nav>
      <AddSubscription />
      <div className="px-4 pb-1 pt-3 text-xs font-medium text-zinc-500">
        {t('reader.subscriptions')}
      </div>
      <ul
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-4"
        aria-label={t('reader.subscriptions')}
      >
        {subscriptions.length === 0 && (
          <li className="px-2 text-sm text-zinc-500">{t('reader.noSubscriptions')}</li>
        )}
        {subscriptions.map((s) => (
          <li key={s.feedId}>
            <NavButton
              active={activeFeedId === s.feedId}
              onClick={() => navigate({ search: { feedId: s.feedId, filter } })}
            >
              <FeedStatusDot subscription={s} />
              <span className="truncate">{s.title}</span>
            </NavButton>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function FeedStatusDot({ subscription }: { subscription: Subscription }) {
  const { t } = useTranslation()
  if (subscription.status === 'dead') {
    return (
      <span title={t('reader.feedDead')} className="size-1.5 shrink-0 rounded-full bg-red-500" />
    )
  }
  if (subscription.lastError) {
    return (
      <span
        title={`${t('reader.feedError')}: ${subscription.lastError}`}
        className="size-1.5 shrink-0 rounded-full bg-amber-500"
      />
    )
  }
  return <span className="size-1.5 shrink-0" />
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
        active ? 'bg-zinc-200 font-medium' : 'hover:bg-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}

function AddSubscription() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [uri, setUri] = useState('')
  const mutation = useMutation({
    mutationFn: (value: string) => unwrap(api.subscriptions.$post({ json: { uri: value } })),
    onSuccess: async () => {
      setUri('')
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (uri.trim()) mutation.mutate(uri.trim())
  }
  return (
    <form onSubmit={submit} className="space-y-1 px-4 pt-4">
      <input
        value={uri}
        onChange={(e) => setUri(e.target.value)}
        placeholder={t('reader.addPlaceholder')}
        aria-label={t('reader.addPlaceholder')}
        className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-500"
      />
      <button
        type="submit"
        disabled={mutation.isPending}
        className="w-full rounded-md bg-zinc-900 px-2 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {mutation.isPending ? t('reader.adding') : t('reader.add')}
      </button>
      {mutation.error && (
        <p role="alert" className="text-xs text-red-600">
          {t('reader.addFailed', { message: mutation.error.message })}
        </p>
      )}
    </form>
  )
}

/* ------------------------------ 条目列表 ------------------------------ */

function ItemList({
  feedId,
  filter,
  activeItemId,
}: {
  feedId?: string
  filter: 'all' | 'unread' | 'starred'
  activeItemId?: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate({ from: '/' })
  const queryClient = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: ['items', { feedId, filter }],
    initialPageParam: undefined as string | undefined,
    // 列表切换时重新拉取，保证"未读"等过滤条件反映最新状态
    staleTime: 0,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.items.$get({
          query: {
            feedId,
            cursor: pageParam,
            unreadOnly: filter === 'unread' ? 'true' : undefined,
            starredOnly: filter === 'starred' ? 'true' : undefined,
          },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const markAllRead = useMutation({
    mutationFn: (id: string) =>
      unwrap(api.subscriptions[':id'].read.$post({ param: { id }, json: {} })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['items'] }),
  })
  const items = query.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <section className="flex min-h-0 flex-col border-r border-zinc-200">
      {feedId && (
        <div className="flex justify-end border-b border-zinc-200 px-3 py-2">
          <button
            type="button"
            className="text-xs text-zinc-500 hover:text-zinc-800"
            onClick={() => markAllRead.mutate(feedId)}
          >
            {t('reader.markAllRead')}
          </button>
        </div>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="items">
        {query.isSuccess && items.length === 0 && (
          <li className="p-6 text-center text-sm text-zinc-500">
            <p>{t('reader.empty')}</p>
            <p className="mt-1 text-xs">{t('reader.fetching')}</p>
          </li>
        )}
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            active={item.id === activeItemId}
            onSelect={() => navigate({ search: (prev) => ({ ...prev, itemId: item.id }) })}
          />
        ))}
        {query.hasNextPage && (
          <li className="p-3 text-center">
            <button
              type="button"
              className="text-sm text-zinc-500 hover:text-zinc-800"
              disabled={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              {t('reader.loadMore')}
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}

function ItemRow({
  item,
  active,
  onSelect,
}: {
  item: TimelineItem
  active: boolean
  onSelect: () => void
}) {
  const { i18n } = useTranslation()
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={`block w-full border-b border-zinc-100 px-4 py-3 text-left ${active ? 'bg-zinc-100' : 'hover:bg-zinc-50'}`}
      >
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="truncate">{item.feedTitle}</span>
          <span className="shrink-0">· {formatTime(item.publishedAt, i18n.language)}</span>
          {item.isStarred && <span className="shrink-0 text-amber-500">★</span>}
        </div>
        <div
          className={`mt-1 line-clamp-2 text-sm ${item.isRead ? 'text-zinc-500' : 'font-medium'}`}
        >
          {item.title}
        </div>
        {item.excerpt && <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{item.excerpt}</p>}
      </button>
    </li>
  )
}

/* -------------------------------- 正文 -------------------------------- */

type ItemsPage = { items: TimelineItem[]; nextCursor: string | null }

/**
 * 就地更新所有已加载列表中的条目状态，而不是重新拉取：
 * 在"未读"列表里打开文章后，它应当留在当前列表（显示为已读），直到用户重新进入列表。
 */
function patchItemInLists(queryClient: QueryClient, id: string, patch: Partial<TimelineItem>) {
  queryClient.setQueriesData<InfiniteData<ItemsPage>>({ queryKey: ['items'] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
          })),
        }
      : data,
  )
}

function ItemDetail({ itemId }: { itemId?: string }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data: item } = useQuery({
    queryKey: ['item', itemId],
    enabled: Boolean(itemId),
    queryFn: () => unwrap(api.items[':id'].$get({ param: { id: itemId! } })),
  })
  const setState = useMutation({
    mutationFn: (json: { read?: boolean; starred?: boolean }) =>
      unwrap(api.items[':id'].state.$post({ param: { id: itemId! }, json })),
    onSuccess: (_, json) => {
      const patch = {
        ...(json.read !== undefined && { isRead: json.read }),
        ...(json.starred !== undefined && { isStarred: json.starred }),
      }
      patchItemInLists(queryClient, itemId!, patch)
      queryClient.setQueryData(['item', itemId], (prev: typeof item) =>
        prev ? { ...prev, ...patch } : prev,
      )
    },
  })

  // 打开即标记已读
  const { mutate } = setState
  useEffect(() => {
    if (item && !item.isRead) mutate({ read: true })
  }, [item, mutate])

  if (!itemId) {
    return (
      <section className="flex items-center justify-center text-sm text-zinc-400">
        {t('reader.selectItem')}
      </section>
    )
  }
  if (!item) return <section />

  return (
    <section className="min-h-0 overflow-y-auto">
      <article className="mx-auto max-w-3xl px-8 py-8">
        <div className="text-xs text-zinc-500">
          {item.feedTitle}
          {item.author && ` · ${item.author}`} · {formatTime(item.publishedAt, i18n.language)}
        </div>
        <h1 className="mt-2 text-2xl font-semibold leading-snug">{item.title}</h1>
        <div className="mt-3 flex gap-4 text-sm">
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {t('reader.openOriginal')}
            </a>
          )}
          <button
            type="button"
            className="text-zinc-500 hover:text-zinc-800"
            onClick={() => setState.mutate({ starred: !item.isStarred })}
          >
            {item.isStarred ? t('reader.unstar') : t('reader.star')}
          </button>
          <button
            type="button"
            className="text-zinc-500 hover:text-zinc-800"
            onClick={() => setState.mutate({ read: !item.isRead })}
          >
            {item.isRead ? t('reader.markUnread') : t('reader.markRead')}
          </button>
        </div>
        {item.contentHtml ? (
          // 正文在服务端入库前已用 sanitize-html 清洗（packages/sources/src/pipeline/sanitize.ts）
          <div
            className="article-body mt-6"
            dangerouslySetInnerHTML={{ __html: item.contentHtml }}
          />
        ) : (
          <p className="mt-6 text-sm text-zinc-500">
            {item.contentPurgedAt ? t('reader.contentPurged') : item.excerpt}
          </p>
        )}
      </article>
    </section>
  )
}

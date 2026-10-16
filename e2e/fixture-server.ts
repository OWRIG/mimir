// 本地静态 feed 服务，E2E 中代替外部站点，避免依赖网络
const feed = Bun.file(new URL('./fixtures/feed.xml', import.meta.url))

const server = Bun.serve({
  port: Number(process.env.FIXTURE_PORT ?? 3199),
  hostname: '127.0.0.1',
  fetch(req) {
    const { pathname } = new URL(req.url)
    if (pathname === '/feed.xml')
      return new Response(feed, { headers: { 'content-type': 'application/rss+xml' } })
    if (pathname === '/healthz') return new Response('ok')
    return new Response('not found', { status: 404 })
  },
})
console.log(`fixture server on ${server.url}`)

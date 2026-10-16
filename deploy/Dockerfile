# 单镜像，api / worker 两种角色由 MIMIR_ROLE 决定。构建上下文为仓库根目录：
#   docker build -f deploy/Dockerfile -t mimir .
ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
# 先只拷清单，依赖层在源码变化时可复用；--frozen-lockfile 需要全部 workspace 清单
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/sources/package.json packages/sources/
COPY e2e/package.json e2e/

FROM deps AS build
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM deps AS runtime
ENV NODE_ENV=production
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --filter '@mimir/server'
COPY packages/shared packages/shared
COPY packages/sources packages/sources
COPY apps/server apps/server
COPY --from=build /app/apps/web/dist apps/web/dist
ENV MIMIR_WEB_DIST=/app/apps/web/dist \
    MIMIR_PORT=3000
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.MIMIR_PORT ?? 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["bun", "apps/server/src/index.ts"]

# Mimir

开源、自托管的组织级信息渠道服务：统一抓取外部信息源（RSS，以及 RSSHub 式的站点适配），按部门和领域分发给人（Web 阅读、IM 推送），并通过 MCP、API 和 RSS 输出给各业务和个人的 AI 进一步消费。AI 只做轻量加工（摘要与领域打标）。飞书优先集成。

An open-source, self-hosted information hub for organizations: aggregate external feeds, organize them by department and domain, deliver to people (web reader, IM push), and expose them to AI agents via MCP, API, and RSS. Lightweight AI (summaries only). Feishu/Lark first.

> **状态 / Status**：v0 骨架。可以登录、订阅、自动抓取和阅读；MCP、AI 摘要、推送、通讯录同步尚未实现。Early skeleton — login, subscribe, fetch, and read work; MCP, AI summaries, push and directory sync are not implemented yet.

## 本地开发 / Development

需要 Bun 1.4+ 和 Docker（macOS 推荐 OrbStack）。Requires Bun 1.4+ and Docker.

```sh
bun install
cp .env.example .env          # 填写 MIMIR_SECRET_KEY：openssl rand -base64 48
bun dev:db                    # Postgres on 127.0.0.1:55432
bun dev                       # server :3000 + web http://localhost:5173
```

```sh
bun check                     # typecheck + lint + format + spec validation
bun run test                  # unit + DB integration tests
bun run e2e                   # Playwright journeys
```

## 部署 / Deployment

```sh
cp .env.example deploy/.env   # 填写 MIMIR_PUBLIC_URL、MIMIR_SECRET_KEY、MIMIR_DOMAIN、POSTGRES_PASSWORD
docker compose -f deploy/docker-compose.yml up -d --build
```

- 架构 / Architecture：[ARCHITECTURE.md](ARCHITECTURE.md)
- 贡献者规范 / Contributor & agent guide：[AGENTS.md](AGENTS.md)

## License

[AGPL-3.0](LICENSE). 贡献代码需签署 [CLA](CLA.md)，提交 PR 后机器人会自动引导。Contributions require signing the [CLA](CLA.md); the bot will guide you on your first pull request.

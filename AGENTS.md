# Mimir

开源、自托管的组织级信息渠道服务：统一抓取外部信息源（RSS，以及 RSSHub 式的站点适配），按部门和领域分发给人（Web 阅读、IM 推送），并通过 MCP、API 和 RSS 输出给 AI 消费。AI 只做摘要和领域打标。飞书是第一优先的集成平台。仓库：github.com/OWRIG/mimir（公开）。

技术架构、包职责、数据模型和关键机制只认根目录的 `ARCHITECTURE.md`，本文不复述。动手前先读它；改动涉及包边界、数据模型、对外接口或新的有状态组件时，同一次提交里同步更新它。

> 现状（2026-10-16）：只有设计稿，代码骨架尚未搭建。下面的命令和目录是约定，落地时以实际 `package.json` 为准，并回写本文。

## 工程原则

- 先定位根因，确认负责该行为的模块和边界，再动手。不要围绕症状叠加条件分支、旁路或兼容补丁；如果局部修补会制造第二份状态、第二套规则或永久特例，就回到模型和边界上解决。
- 目标是当前约束下最小而完整的设计。不要为假设中的未来预建抽象、扩展点或配置项。`ARCHITECTURE.md`「演进位置」里列出的能力，现在一律不留钩子。
- 抽象必须对应已经存在、说得清楚的共同语义或替换需求。站点特例放在 `site://` 适配器里，不进通用代码。
- 关键路径（鉴权、数据范围、持久化、迁移、调度认领与租约、并发、重试、SSRF）写简明的中文注释，讲清楚为什么和不变量是什么，不复述代码。

## 布局

bun workspaces：

- `apps/server`：Hono 后端，api 和 worker 两种角色共用一份代码（`MIMIR_ROLE`）。Drizzle schema 和迁移放在这里。平台集成在 `src/integrations/<provider>/`。
- `apps/web`：Vite + React SPA，界面通过 react-i18next 做多语言（默认 `zh-CN`，另有 `en`）。
- `packages/shared`：zod 契约和类型，只依赖 `zod`。
- `packages/sources`：信息源 Provider、站点适配器、Pipeline transforms。**不碰数据库，不知道用户和订阅。**
- `deploy/`：docker compose 和镜像构建。
- `docs/`：面向使用者的部署、配置、飞书接入文档；`docs/memos/` 放设计决策 memo，命名为 `YYYY-MM-DD-<slug>.md`。
- `reference/`：git-ignored 的上游项目（Folo、TrendRadar 等），用法见 `reference/README.md`。

## 边界红线

1. **依赖方向**：`web → shared`；`server → shared, sources`；`sources` 和 `shared` 不依赖任何 workspace 包。`web` 对 `server` 只允许 `import type`（Hono RPC 路由类型），禁止引入运行时代码。跨包一律通过包名引用，不用相对路径穿越包。
2. **数据范围单一来源**：用户可见的 feed 集合（个人订阅 ∪ 已关注 Collection）只由一个函数计算。Web API、MCP、RSS 输出、检索都必须经过它，不允许在路由里另写一份权限查询。
3. **网络出口单一**：`sources` 内的所有请求都走 `FetchContext.http`（代理、限速、超时、体积上限、SSRF 防护都在这里）。禁止在适配器或 transform 里直接调用全局 `fetch`。LLM 调用只走 `apps/server/src/llm/`。
4. **入库内容必须清洗**：HTML 在 pipeline 末尾固定经过 `sanitize-html`，前端可以直接渲染清洗后的 HTML。不得新增绕过清洗的写入路径。
5. **表即队列**：抓取调度和摘要任务通过 `FOR UPDATE SKIP LOCKED` 加租约认领。不引入 Redis、MQ 或独立的队列库；需要新的异步任务时，沿用同样的模式。
6. **AI 保持轻量**：服务端只做每条只算一次、结果全公司共享的加工（目前只有摘要和领域打标）。分析、对比、报告这类重推理交给消费端 AI，不要做成 MCP 工具。
7. **新增有状态组件**（搜索引擎、缓存、对象存储等）必须先写 memo 并经人确认。
8. **平台集成走接口**：业务代码只依赖 `AuthProvider` / `DirectoryProvider` / `Notifier` 接口。飞书 SDK 等平台依赖只允许出现在 `apps/server/src/integrations/<provider>/` 里。启用通讯录同步后，IdP 是部门和成员归属的唯一事实源，Mimir 不提供可写的第二份。
9. **配置两层、各有唯一归属**：部署配置（密钥、集成、基础设施）只来自环境变量，业务配置（领域、Collection、推送规则等）只存在数据库里，不做叠加覆盖。新增配置项要同时更新 `.env.example` 和 `docs/` 中的配置参考。可选功能（LLM、飞书、RSSHub、代理）在未配置时必须优雅关闭，不能导致启动失败。

## 信息源开发

- 能用原生 feed 就用原生 feed；不行先找 RSSHub 现成路由（`rsshub://`）；声明式 transforms 解决不了的，才写 `site://` 适配器。
- 适配器放在 `packages/sources/src/sites/<site>/`，形态对齐 RSSHub route（path、name、url、example、parameters、handler），输出字段对齐 RSSHub `DataItem` 的子集。可以参考 RSSHub 的实现（MIT 许可），但要按本项目的代码风格重写。
- 每个适配器都要附带 fixture 测试：把录制好的 HTML 或 JSON 放进 `__fixtures__/`，测试中不访问真实网络。
- Source URI 入库前必须规范化，这是 feed 全局去重的前提。

## 数据库

- Drizzle schema 是表结构的唯一事实源，迁移用 `drizzle-kit generate` 生成并入库，不手写 DDL，也不改已发布的迁移文件。
- ID 用 UUIDv7、时间用 `timestamptz`，都由应用代码生成（Drizzle `$defaultFn`），不用 PG 函数做默认值。表和关键列在 schema 里写 JSDoc 注释（Drizzle 不生成 DB comment，不为此手写 DDL）。
- 源数据（`items`）和 AI 派生数据（`item_summaries`、`item_domains`）分表存放，派生数据要能整体删掉重算。

## 命令（约定）

- `bun install`；`bun dev`：同时启动 server（`MIMIR_ROLE=all`）和 web 的 Vite dev server。
- `bun check`：类型检查 + oxlint + oxfmt 检查，只读不改文件。
- `bun test`：单元测试和 fixture 测试；涉及数据库的测试用独立的测试库。
- `bun db:generate` / `bun db:migrate`：生成和执行迁移。
- 改完至少跑与改动相关的 `bun test` 和 `bun check`，汇报时如实给出结果。

## 约定

- TypeScript strict；oxlint + oxfmt；校验统一用 zod，跨端 schema 放 `packages/shared`。
- 配置只来自环境变量，在 `apps/server/src/config.ts` 统一校验；仓库只提交 `.env.example`，绝不提交真实密钥或令牌。
- 日志用 pino 输出结构化 JSON，不打印令牌、cookie 或 LLM API key。
- 用户可见文案一律走 i18n key，禁止在组件或推送卡片里硬编码文案；新增 key 时 `zh-CN` 和 `en` 同时补齐。代码标识符、协议字段、日志字段用英文。
- 提交信息遵循 Conventional Commits，scope 用包名：`feat(server):`、`fix(sources):`、`feat(web):`、`docs(arch):`。
- `reference/` 里的代码优先理解后按本项目风格重写。确需引入上游代码时，只允许与 AGPL-3.0 兼容的来源（MIT、Apache-2.0、BSD、GPLv3、AGPLv3 等，Folo 和 TrendRadar 都可以），并在文件头保留原作者版权与许可声明、在 memo 里注明上游路径和 commit。

## 开源卫生

- 这是公开仓库：不得提交任何特定组织的数据，包括真实的部门名、内部域名、飞书 app_id、群 chat_id、服务器地址和测试账号。示例和 fixture 一律用虚构值。
- 本地运维信息（真实地址、凭据）放在 gitignored 的 `.env` 里，不写进文档或 commit message。
- 项目许可为 **AGPL-3.0**（`LICENSE`），外部贡献需签署 `CLA.md`（由 `.github/workflows/cla.yml` 在 PR 上自动收集，签名存于 `cla-signatures` 分支）。CLA 保留维护者对外提供商业授权的权利，不要删改这套流程。
- 新增依赖前确认许可与 AGPL-3.0 兼容；不引入许可证不明、禁止商用或仅限非商业的依赖。

# reference/

Mimir 设计的**长期参考库**：clone 进来的开源项目代码，用于做架构调研、能力设计、竞品对比时**先看别人怎么做的**，再决定 Mimir 怎么做。范围覆盖 Mimir 关心的设计面（信息源订阅/抓取、聚合与去重、AI 筛选/摘要/翻译、阅读体验、推送通知、MCP 接入、多端分发……），不限定具体 feature。

## 不上云

整个目录被 `.gitignore` 屏蔽（只保留本 README 和 `.gitignore` 自身）。代码量大、版本各异、跟 Mimir 发布无关，不进 git 历史。

## 使用约定

1. **设计/调研前先扫一眼 reference/**，按相关性挑 1–2 个项目过一遍代码
2. 直接 `rg`/`grep` 搜代码，比读 README 信息量大
3. 调研时优先用 sub-agent（Explore / general-purpose）扫 reference/，避免把大量上游代码塞进主上下文
4. 把"借鉴的实现 + 上游文件路径（含 commit hash 时更佳）"写进对应 design memo，保留可追溯性
5. 优先理解后用 Mimir 自己的代码风格重写。Mimir 是 AGPL-3.0，与当前条目（AGPL / GPLv3）许可兼容；确需引入上游代码时，保留原版权与许可声明并在 memo 注明来源
6. Reference 不是越多越好——只收**对 Mimir 设计真正可能有用**的项目，质量优先于数量

## 当前条目

| 目录          | 项目       | License     | 上游                            | 本地版本（clone 于 2026-10-16） | 借鉴方向                                                                                                                                                                                                                                             |
| ------------- | ---------- | ----------- | ------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `folo/`       | Folo       | AGPL-3.0    | github.com/RSSNext/Folo         | `148b453af2`                    | AI RSS 阅读器全栈参考：pnpm + turbo monorepo，`apps/{desktop,mobile,ssr,cli,ota}` 多端分发；`packages/internal/{database,store,models}` 本地数据层与状态管理；`packages/readability` 正文提取；订阅/条目/列表的数据模型与阅读 UX、AI 摘要/翻译交互 |
| `trendradar/` | TrendRadar | GPL-3.0     | github.com/sansan0/TrendRadar   | `657094ed6a`                    | 热点/舆情监控流水线参考（Python）：`trendradar/crawler` 多平台热榜 + RSS 抓取；`config/frequency_words.txt` 关键词筛选；`trendradar/ai` + `config/ai_*` AI 兴趣筛选/翻译/分析简报 prompt；`trendradar/notification` 飞书/钉钉/企微/Telegram/邮件等多渠道推送；`mcp_server/` MCP 工具化查询；Docker 部署 |

## 刷新

都是 `--depth 1` shallow clone，更新直接重 clone（在项目根目录执行）：

```bash
rm -rf reference/{folo,trendradar}
git clone --depth 1 https://github.com/RSSNext/Folo.git reference/folo
git clone --depth 1 https://github.com/sansan0/TrendRadar.git reference/trendradar
```

刷新后同步更新上表的"本地版本"列。

## 新增条目

clone 完后在上面表格加一行，并把 clone 命令补进"刷新"段，明确写出"借鉴方向"——这是判断该 reference 是否还值得留着的依据。临时 spike 用别的位置，本目录留给长期参考项目。

## 已评估但未收录

避免重复 recon。看过后判定没有独立参考价值或暂不收录的项目记在这里，附一句理由。

（暂无）

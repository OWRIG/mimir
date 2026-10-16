# source-ingestion Specification

## Purpose

把外部信息源统一抓取、解析、清洗为标准条目入库。覆盖源地址规范化、三类源（原生 feed、RSSHub 路由、站点适配器）、声明式处理管线、安全约束与抓取调度。

## Requirements

### Requirement: 源地址规范化与全局去重

系统 SHALL 在入库前把源地址规范化，并以规范化结果作为 feed 的全局身份；同一个源无论写法如何，全组织只保留一个 feed、只抓取一次。

#### Scenario: 不同写法指向同一个源

- **WHEN** 两个用户分别订阅 `https://Example.com/rss?utm_source=x` 和 `example.com/rss#top`
- **THEN** 两个订阅指向同一个 feed，其地址为 `https://example.com/rss`

#### Scenario: 不支持的地址

- **WHEN** 用户提交 `ftp:`、`file:` 等协议的地址或空地址
- **THEN** 系统拒绝订阅并提示地址无效

### Requirement: 支持三类信息源

系统 SHALL 支持原生 feed（RSS 2.0、Atom、RDF、JSON Feed）、`rsshub://<路由>`（解析到部署配置的 RSSHub 实例，按顺序回退）和 `site://<路由>`（内置站点适配器）。

#### Scenario: RSSHub 实例回退

- **WHEN** 配置了多个 RSSHub 实例且第一个实例请求失败
- **THEN** 系统依次尝试后续实例，任一成功即视为抓取成功

#### Scenario: 未知站点路由

- **WHEN** 订阅的 `site://` 路由没有匹配的适配器
- **THEN** 该 feed 的抓取记为失败并显示错误原因

### Requirement: 内容清洗

系统 MUST 在条目入库前清洗 HTML：移除脚本、事件属性、`javascript:` 链接与 iframe，相对地址补全为绝对地址，外链在新窗口打开且不携带来源信息。清洗不可配置、不可跳过。

#### Scenario: feed 内含脚本

- **WHEN** feed 条目正文包含 `<script>` 或 `onclick` 属性
- **THEN** 入库与展示的正文中不包含这些内容，阅读时脚本不会执行

### Requirement: 声明式处理管线

系统 SHALL 支持按源配置有序的处理步骤：`fulltext`（抓取原文提取正文）、`select`（按选择器删除或保留元素）、`filter`（按关键词或正则保留、丢弃条目）、`rewrite`（正则替换链接或正文）。

#### Scenario: 全文提取失败

- **WHEN** 某篇原文抓取或提取失败
- **THEN** 保留 feed 自带的内容，其余条目不受影响

### Requirement: 网络访问安全

系统 MUST 拒绝抓取解析到非公网地址（私网、回环、链路本地、CGNAT、云厂商元数据地址等）的源，重定向的每一跳都重新校验；仅允许部署配置中显式放行的网段例外。

#### Scenario: 指向云元数据地址

- **WHEN** 源地址或其重定向目标为 `100.100.100.200`、`169.254.169.254` 或内网地址
- **THEN** 抓取失败并记录为被拦截，不发出请求

### Requirement: 抓取调度

系统 SHALL 只抓取有订阅者或属于某个 Collection 的 feed；按发文频率自适应抓取间隔（10 分钟至 24 小时），支持条件请求；失败时指数退避，连续失败超过 7 天标记为失效并停止抓取，重新订阅可恢复。

#### Scenario: 新订阅的源

- **WHEN** 用户订阅一个新源
- **THEN** 该源在数秒内完成首次抓取，订阅列表显示 feed 标题

#### Scenario: 长期失败

- **WHEN** 某 feed 距上次成功抓取超过 7 天且仍在失败
- **THEN** 该 feed 被标记为失效，订阅列表中提示，不再自动抓取

#### Scenario: 内容更新

- **WHEN** 已入库条目的标题或正文在源中发生变化
- **THEN** 系统更新该条目，不产生重复条目

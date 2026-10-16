import type { SourceConfig } from '@mimir/sources'
import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// ID 与时间戳都在应用侧生成（$defaultFn 在写入前执行），不依赖 PG 函数默认值
const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => Bun.randomUUIDv7())
const ts = (name: string) => timestamp(name, { withTimezone: true })
const createdAt = () =>
  ts('created_at')
    .notNull()
    .$defaultFn(() => new Date())
const updatedAt = () =>
  ts('updated_at')
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())

/* ------------------------------------------------------------------ */
/* 认证：结构由 better-auth 约定（usePlural），额外字段见 auth.ts       */
/* ------------------------------------------------------------------ */

/** 用户。通讯录同步创建但尚未登录过的成员 status=inactive */
export const users = pgTable('users', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  /** member | admin */
  role: text('role').notNull().default('member'),
  /** active | inactive */
  status: text('status').notNull().default('active'),
  /** 界面语言，空则跟随实例默认 */
  locale: text('locale'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/** 登录会话（better-auth） */
export const sessions = pgTable('sessions', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/** 外部身份与本地密码（better-auth）。一个用户可绑定多个 provider */
export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** provider 侧的用户标识；飞书为 union_id */
    accountId: text('account_id').notNull(),
    /** credential | feishu | ... */
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('accounts_provider_account_uq').on(t.providerId, t.accountId)],
)

/** 一次性验证值（better-auth：邮箱验证、OAuth state 等） */
export const verifications = pgTable('verifications', {
  id: id(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/* ------------------------------------------------------------------ */
/* 组织维度                                                            */
/* ------------------------------------------------------------------ */

/** 部门树。启用 DirectoryProvider 后由同步写入，后台只读 */
export const departments = pgTable(
  'departments',
  {
    id: id(),
    parentId: uuid('parent_id').references((): AnyPgColumn => departments.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    /** manual | feishu | ... */
    source: text('source').notNull().default('manual'),
    /** provider 侧部门 ID，用于同步对齐 */
    externalId: text('external_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('departments_source_external_uq').on(t.source, t.externalId)],
)

/** 用户所属部门，一人可属多个部门 */
export const userDepartments = pgTable(
  'user_departments',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.departmentId] })],
)

/** 领域分类树，由管理员维护；description 会写进摘要打标的提示词 */
export const domains = pgTable('domains', {
  id: id(),
  parentId: uuid('parent_id').references((): AnyPgColumn => domains.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/* ------------------------------------------------------------------ */
/* 信息源                                                              */
/* ------------------------------------------------------------------ */

/** feed：source_uri 是全局身份，同一 URI 全组织只抓一次 */
export const feeds = pgTable(
  'feeds',
  {
    id: id(),
    /** 规范化后的 source URI（http(s): / rsshub: / site:） */
    sourceUri: text('source_uri').notNull().unique(),
    title: text('title'),
    siteUrl: text('site_url'),
    description: text('description'),
    imageUrl: text('image_url'),
    /** 对应 @mimir/sources 的 SourceConfig */
    config: jsonb('config').$type<SourceConfig>().notNull().default({}),
    /** active | paused | dead */
    status: text('status').notNull().default('active'),
    etag: text('etag'),
    lastModified: text('last_modified'),
    /** 调度游标；被认领时推后一个租约时长充当占位 */
    nextFetchAt: ts('next_fetch_at')
      .notNull()
      .$defaultFn(() => new Date()),
    lastFetchedAt: ts('last_fetched_at'),
    lastSuccessAt: ts('last_success_at'),
    lastError: text('last_error'),
    /** 连续失败次数，成功后归零 */
    errorCount: integer('error_count').notNull().default(0),
    /** 当前生效的自适应抓取间隔（分钟） */
    intervalMinutes: integer('interval_minutes').notNull().default(30),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('feeds_due_idx').on(t.status, t.nextFetchAt)],
)

/** 个人订阅 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feeds.id, { onDelete: 'cascade' }),
    titleOverride: text('title_override'),
    folder: text('folder'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.feedId] }),
    index('subscriptions_feed_idx').on(t.feedId),
  ],
)

/** 一组 feed 的打包，可归属部门或领域 */
export const collections = pgTable('collections', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  ownerUserId: uuid('owner_user_id')
    .notNull()
    .references(() => users.id),
  departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),
  /** public | department | private */
  visibility: text('visibility').notNull().default('private'),
  /** 为 true 时本部门及下级部门成员自动关注 */
  isDepartmentDefault: boolean('is_department_default').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const collectionFeeds = pgTable(
  'collection_feeds',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feeds.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.feedId] }),
    index('collection_feeds_feed_idx').on(t.feedId),
  ],
)

/** 关注是动态的：Collection 增删 feed 后关注者立即可见 */
export const collectionFollows = pgTable(
  'collection_follows',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.collectionId] })],
)

/* ------------------------------------------------------------------ */
/* 内容与用户状态                                                      */
/* ------------------------------------------------------------------ */

/** 条目。content_html 是清洗后的 HTML，过保留期且无人星标时清空 */
export const items = pgTable(
  'items',
  {
    id: id(),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feeds.id, { onDelete: 'cascade' }),
    guid: text('guid').notNull(),
    /** sha1(guid)，用于唯一约束（guid 可能很长） */
    guidHash: text('guid_hash').notNull(),
    url: text('url'),
    /** sha1(规范化 URL)，跨 feed 识别同一篇内容 */
    urlHash: text('url_hash'),
    title: text('title').notNull(),
    author: text('author'),
    /** feed 自带的纯文本摘要（区别于 AI 摘要） */
    excerpt: text('excerpt'),
    contentHtml: text('content_html'),
    contentPurgedAt: ts('content_purged_at'),
    imageUrl: text('image_url'),
    categories: text('categories')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    enclosureUrl: text('enclosure_url'),
    enclosureType: text('enclosure_type'),
    /** 源给出的发布时间；缺失时取入库时间 */
    publishedAt: ts('published_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('items_feed_guid_uq').on(t.feedId, t.guidHash),
    index('items_feed_published_idx').on(t.feedId, t.publishedAt),
    index('items_url_hash_idx').on(t.urlHash),
  ],
)

/** 按 feed 的已读水位线，"全部已读"只推进水位线 */
export const readMarks = pgTable(
  'read_marks',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    feedId: uuid('feed_id')
      .notNull()
      .references(() => feeds.id, { onDelete: 'cascade' }),
    readBefore: ts('read_before').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.feedId] })],
)

/** 水位线之后的单条已读与星标 */
export const itemStates = pgTable(
  'item_states',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    readAt: ts('read_at'),
    starredAt: ts('starred_at'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.itemId] }),
    index('item_states_item_idx').on(t.itemId),
  ],
)

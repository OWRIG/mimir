import { z } from 'zod'

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === 'true' || v === '1'))

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    MIMIR_ROLE: z.enum(['all', 'api', 'worker']).default('all'),
    MIMIR_PORT: z.coerce.number().int().default(3000),
    MIMIR_PUBLIC_URL: z.url(),
    MIMIR_SECRET_KEY: z.string().min(32, 'MIMIR_SECRET_KEY 至少 32 个字符'),
    MIMIR_DEFAULT_LOCALE: z.enum(['zh-CN', 'en']).default('zh-CN'),
    MIMIR_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    MIMIR_AUTO_MIGRATE: bool(true),
    /** 生产环境托管的 web 构建产物目录；不设置则不托管静态文件 */
    MIMIR_WEB_DIST: z.string().optional(),

    MIMIR_AUTH_PROVIDERS: csv.pipe(
      z.array(z.enum(['password', 'feishu'])).min(1, '至少启用一种登录方式'),
    ),
    MIMIR_FEISHU_APP_ID: z.string().optional(),
    MIMIR_FEISHU_APP_SECRET: z.string().optional(),
    MIMIR_FEISHU_DOMAIN: z.enum(['feishu', 'lark']).default('feishu'),

    MIMIR_RSSHUB_URLS: csv.pipe(z.array(z.url())),
    MIMIR_FETCH_PROXY: z.string().optional(),
    MIMIR_FETCH_ALLOWED_CIDRS: csv,
    MIMIR_FETCH_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(8),
    MIMIR_FETCH_USER_AGENT: z.string().default('Mimir/0.1 (+https://github.com/OWRIG/mimir)'),

    MIMIR_CONTENT_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  })
  .superRefine((env, ctx) => {
    if (
      env.MIMIR_AUTH_PROVIDERS.includes('feishu') &&
      !(env.MIMIR_FEISHU_APP_ID && env.MIMIR_FEISHU_APP_SECRET)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '启用 feishu 登录需要 MIMIR_FEISHU_APP_ID 与 MIMIR_FEISHU_APP_SECRET',
      })
    }
  })

export type Config = z.infer<typeof schema>

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`配置无效：\n${issues.map((i) => `  - ${i}`).join('\n')}`)
    this.name = 'ConfigError'
  }
}

export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = schema.safeParse(env)
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((i) => `${i.path.join('.') || '(env)'}: ${i.message}`),
    )
  }
  return result.data
}

/** 启动时校验一次；失败直接退出，避免带着错误配置运行 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  try {
    return parseConfig(env)
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error
    console.error(error.message)
    process.exit(1)
  }
}

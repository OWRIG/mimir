import { expect, test } from 'bun:test'
import { ConfigError, parseConfig } from './config.ts'

const minimal = {
  DATABASE_URL: 'postgres://x',
  MIMIR_PUBLIC_URL: 'http://localhost:3000',
  MIMIR_SECRET_KEY: 'x'.repeat(32),
  MIMIR_AUTH_PROVIDERS: 'password',
}

test('最小配置可运行，可选项有默认值', () => {
  const config = parseConfig(minimal)
  expect(config).toMatchObject({
    MIMIR_ROLE: 'all',
    MIMIR_AUTH_PROVIDERS: ['password'],
    MIMIR_RSSHUB_URLS: [],
    MIMIR_FETCH_ALLOWED_CIDRS: [],
    MIMIR_AUTO_MIGRATE: true,
    MIMIR_FEISHU_DOMAIN: 'feishu',
  })
})

test('启用飞书登录必须提供凭据', () => {
  expect(() => parseConfig({ ...minimal, MIMIR_AUTH_PROVIDERS: 'feishu' })).toThrow(ConfigError)
  expect(
    parseConfig({
      ...minimal,
      MIMIR_AUTH_PROVIDERS: 'feishu,password',
      MIMIR_FEISHU_APP_ID: 'a',
      MIMIR_FEISHU_APP_SECRET: 's',
    }).MIMIR_AUTH_PROVIDERS,
  ).toEqual(['feishu', 'password'])
})

test('拒绝过短密钥、未知登录方式、非法 RSSHub 地址', () => {
  expect(() => parseConfig({ ...minimal, MIMIR_SECRET_KEY: 'short' })).toThrow(ConfigError)
  expect(() => parseConfig({ ...minimal, MIMIR_AUTH_PROVIDERS: 'ldap' })).toThrow(ConfigError)
  expect(() => parseConfig({ ...minimal, MIMIR_AUTH_PROVIDERS: '' })).toThrow(ConfigError)
  expect(() => parseConfig({ ...minimal, MIMIR_RSSHUB_URLS: 'not a url' })).toThrow(ConfigError)
})

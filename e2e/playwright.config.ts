import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
export const BASE_URL = `http://localhost:${PORT}`
export const E2E_DATABASE =
  process.env.E2E_DATABASE_URL ?? 'postgres://mimir:mimir@localhost:55432/mimir_e2e'

/**
 * E2E 以接近生产的方式运行：server 托管已构建的 web（需先 `bun run build`），
 * 连接独立的 mimir_e2e 库，抓取本地 fixture feed。
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: BASE_URL, locale: 'zh-CN', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'bun fixture-server.ts',
      url: 'http://127.0.0.1:3199/healthz',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'bun reset-db.ts && bun ../apps/server/src/index.ts',
      url: `${BASE_URL}/healthz`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: E2E_DATABASE,
        MIMIR_PORT: String(PORT),
        MIMIR_PUBLIC_URL: BASE_URL,
        MIMIR_SECRET_KEY: 'e2e-secret-key-not-for-production-use-0123456789',
        MIMIR_AUTH_PROVIDERS: 'password',
        MIMIR_WEB_DIST: '../apps/web/dist',
        // fixture 服务在本机回环地址，仅 E2E 放行
        MIMIR_FETCH_ALLOWED_CIDRS: '127.0.0.1/32,::1/128',
        MIMIR_LOG_LEVEL: 'warn',
      },
    },
  ],
})

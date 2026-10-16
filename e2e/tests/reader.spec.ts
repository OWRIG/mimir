import { expect, test } from '@playwright/test'

/**
 * 关键用户旅程：注册 → 订阅 → 抓取入库 → 阅读（自动已读）→ 星标 → 退出。
 * 每条旅程一个用例，断言用户可见结果，不断言实现细节。
 */
test('新用户订阅一个源并完成阅读', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`

  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)

  await page.getByRole('button', { name: '没有账号？注册' }).click()
  await page.getByLabel('姓名').fill('E2E Tester')
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码').fill('correct-horse-battery')
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('还没有订阅，先添加一个源吧')).toBeVisible()

  await page
    .getByLabel('RSS 地址、rsshub:// 或 site:// 路由')
    .fill('http://127.0.0.1:3199/feed.xml')
  await page.getByRole('button', { name: '订阅', exact: true }).click()

  // worker 每 5 秒轮询一次，首次抓取后订阅标题更新为 feed 标题
  const subscriptions = page.getByRole('list', { name: '订阅' })
  await expect(subscriptions.getByText('E2E Fixture Blog')).toBeVisible({ timeout: 20_000 })

  await subscriptions.getByText('E2E Fixture Blog').click()
  const article = page.getByRole('button', { name: /Hello from the fixture feed/ })
  await expect(article).toBeVisible()
  await article.click()

  await expect(page.getByRole('heading', { name: 'Hello from the fixture feed' })).toBeVisible()
  await expect(page.getByText('The full body of the fixture article.')).toBeVisible()
  // 入库前已清洗，feed 里的脚本不会执行
  expect(await page.evaluate(() => (window as { mimirXss?: boolean }).mimirXss)).toBeUndefined()

  const nav = page.getByRole('navigation')
  const list = page.getByRole('list', { name: 'items' })
  const reader = page.getByRole('article')

  // 打开即已读：重新进入"未读"列表后只剩另一篇
  await expect(reader.getByRole('button', { name: '标为未读' })).toBeVisible()
  await nav.getByRole('button', { name: '未读' }).click()
  await expect(list.getByRole('button', { name: /Second fixture post/ })).toBeVisible()
  await expect(list.getByRole('button', { name: /Hello from the fixture feed/ })).toHaveCount(0)

  // 在未读列表中打开的文章留在当前列表，直到重新进入
  await list.getByRole('button', { name: /Second fixture post/ }).click()
  await expect(reader.getByRole('heading', { name: 'Second fixture post' })).toBeVisible()
  await expect(list.getByRole('button', { name: /Second fixture post/ })).toBeVisible()

  // 星标后出现在星标列表
  await reader.getByRole('button', { name: '星标', exact: true }).click()
  await expect(reader.getByRole('button', { name: '取消星标' })).toBeVisible()
  await nav.getByRole('button', { name: '星标' }).click()
  await expect(list.getByRole('button', { name: /Second fixture post/ })).toBeVisible()
  await expect(list.getByRole('button', { name: /Hello from the fixture feed/ })).toHaveCount(0)

  await page.getByRole('button', { name: '退出登录' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('订阅非法地址时给出错误提示', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: '没有账号？注册' }).click()
  await page.getByLabel('邮箱').fill(`e2e-bad-${Date.now()}@example.com`)
  await page.getByLabel('密码').fill('correct-horse-battery')
  await page.getByRole('button', { name: '注册', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.getByLabel('RSS 地址、rsshub:// 或 site:// 路由').fill('ftp://example.com/feed')
  await page.getByRole('button', { name: '订阅', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('订阅失败')
})

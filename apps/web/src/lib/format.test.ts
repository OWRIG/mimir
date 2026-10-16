import { expect, test } from 'bun:test'
import { formatTime } from './format.ts'

const now = new Date('2026-10-16T12:00:00Z')

test('一小时内显示分钟，一天内显示小时，更早显示日期', () => {
  expect(formatTime('2026-10-16T11:55:00Z', 'en', now)).toBe('5 minutes ago')
  expect(formatTime('2026-10-16T09:00:00Z', 'en', now)).toBe('3 hours ago')
  expect(formatTime('2026-10-10T09:00:00Z', 'en', now)).toBe('Oct 10')
})

test('不足一分钟按"现在"显示（具体措辞取决于 ICU 版本，不写死）', () => {
  const justNow = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' }).format(0, 'minute')
  expect(formatTime('2026-10-16T11:59:50Z', 'zh-CN', now)).toBe(justNow)
})

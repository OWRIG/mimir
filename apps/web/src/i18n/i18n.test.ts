import { expect, test } from 'bun:test'
import en from './en.json'
import zhCN from './zh-CN.json'

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
}

test('zh-CN 与 en 的文案 key 完全一致', () => {
  expect(keys(en).toSorted()).toEqual(keys(zhCN).toSorted())
})

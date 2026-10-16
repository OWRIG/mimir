import { expect, test } from 'bun:test'
import { createAddressPolicy, isPublicAddress } from './address.ts'

test.each([
  ['8.8.8.8', true],
  ['2606:4700:4700::1111', true],
  ['127.0.0.1', false],
  ['10.0.0.1', false],
  ['172.16.5.4', false],
  ['192.168.1.1', false],
  ['169.254.169.254', false],
  ['100.100.100.200', false],
  ['0.0.0.0', false],
  ['::1', false],
  ['fd00::1', false],
  ['fe80::1', false],
  ['::ffff:127.0.0.1', false],
  ['not-an-ip', false],
])('isPublicAddress(%s) = %p', (address, expected) => {
  expect(isPublicAddress(address)).toBe(expected)
})

test('createAddressPolicy 只额外放行指定网段', () => {
  const allowed = createAddressPolicy(['198.18.0.0/15'])
  expect(allowed('198.18.2.37')).toBe(true)
  expect(allowed('8.8.8.8')).toBe(true)
  expect(allowed('10.0.0.1')).toBe(false)
  expect(allowed('100.100.100.200')).toBe(false)
  expect(allowed('2001:2::265')).toBe(false)
})

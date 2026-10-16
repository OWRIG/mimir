import ipaddr from 'ipaddr.js'

/**
 * 只放行公网单播地址。私网、回环、链路本地、CGNAT（含阿里云元数据 100.100.100.200）、
 * 169.254.169.254 等云元数据、组播、保留段一律拒绝；IPv4-mapped IPv6 先还原再判断。
 */
export function isPublicAddress(address: string): boolean {
  const parsed = parseAddress(address)
  return parsed !== null && parsed.range() === 'unicast'
}

function parseAddress(address: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
  if (!ipaddr.isValid(address)) return null
  const parsed = ipaddr.parse(address)
  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    return (parsed as ipaddr.IPv6).toIPv4Address()
  }
  return parsed
}

/**
 * 构造地址校验函数：公网单播地址，或落在显式放行网段内的地址。
 * 放行网段用于 fake-IP 代理（Clash/Surge TUN 常用 198.18.0.0/15）等环境，必须精确到网段，不提供"全部放行"。
 */
export function createAddressPolicy(
  allowedCidrs: readonly string[] = [],
): (address: string) => boolean {
  const ranges = allowedCidrs.map((cidr) => ipaddr.parseCIDR(cidr))
  return (address) => {
    const parsed = parseAddress(address)
    if (!parsed) return false
    if (parsed.range() === 'unicast') return true
    return ranges.some(([net, bits]) => parsed.kind() === net.kind() && parsed.match(net, bits))
  }
}

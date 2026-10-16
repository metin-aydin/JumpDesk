export type OsKind = 'linux' | 'windows' | 'database' | 'network' | 'web' | 'other'

const DB = [
  'mysql',
  'mariadb',
  'postgresql',
  'oracle',
  'sqlserver',
  'mongodb',
  'redis',
  'clickhouse',
  'db2',
  'dameng'
]
const NET = [
  'switch',
  'router',
  'firewall',
  'cisco',
  'huawei',
  'h3c',
  'juniper',
  'tp_link',
  'general'
]

export function osKind(platformType?: string): OsKind {
  const t = (platformType ?? '').toLowerCase()
  if (t === 'windows' || t === 'windows_ad') return 'windows'
  if (['linux', 'unix', 'macos', 'bsd', 'aix'].includes(t)) return 'linux'
  if (DB.includes(t)) return 'database'
  if (NET.includes(t)) return 'network'
  if (t === 'website' || t === 'web' || t === 'http' || t === 'https') return 'web'
  return 'other'
}

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
const IPV6 = /^[0-9a-f:]+:[0-9a-f:]*$/i

export function isIpAddress(value?: string): boolean {
  return Boolean(value && (IPV4.test(value) || IPV6.test(value)))
}

/** Sunucu satırında adın yanında gösterilecek adres: iç IP her zaman, JumpServer adresi yalnız IP ise. */
export function displayAddress(
  localIp?: string,
  address?: string
): { text: string; local: boolean } | null {
  if (localIp) return { text: localIp, local: true }
  if (isIpAddress(address)) return { text: address!, local: false }
  return null
}

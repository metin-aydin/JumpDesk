// Mock ağaç verisi: Default kökü altında Linux/Windows/Veritabanı grupları ve
// sanallaştırmayı denemek için 250 sunuculu büyük bir alt grup.
import crypto from 'node:crypto'

function uuid(seed) {
  const h = crypto.createHash('md5').update(seed).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

export function buildData() {
  const nodes = [
    { key: '1', value: 'Default', parentKey: '' },
    { key: '1:1', value: 'Linux', parentKey: '1' },
    { key: '1:1:1', value: 'Prod', parentKey: '1:1' },
    { key: '1:1:2', value: 'Test', parentKey: '1:1' },
    { key: '1:2', value: 'Windows', parentKey: '1' },
    { key: '1:3', value: 'Veritabanı', parentKey: '1' },
    { key: '1:4', value: 'Büyük grup', parentKey: '1' },
    { key: '1:5', value: 'Entegrasyon(Partner A, Partner B, Partner C)', parentKey: '1' },
    { key: '1:5:1', value: 'Partner A', parentKey: '1:5' },
    {
      key: '1:5:1:1',
      value: 'Bölge Ofisleri ve Uzak Lokasyonlar (Kuzey Bölgesi)',
      parentKey: '1:5:1'
    },
    { key: '1:5:1:1:1', value: 'Merkez Kampüs', parentKey: '1:5:1:1' },
    {
      key: '1:5:1:1:1:1',
      value: 'Ana Veri Merkezi ve Felaket Kurtarma Sahası',
      parentKey: '1:5:1:1:1'
    }
  ].map((n) => ({ ...n, id: uuid(`node-${n.key}`) }))

  const assets = []
  const add = (name, nodeKey, opts = {}) => {
    const platformType = opts.platformType || 'linux'
    const isWin = platformType === 'windows'
    const index = assets.length
    assets.push({
      id: uuid(`asset-${name}`),
      name,
      address: opts.address || `10.12.${Math.floor(index / 250)}.${(index % 250) + 2}`,
      localIp: `192.168.${Math.floor(index / 250) + 10}.${(index % 250) + 2}`,
      comment: opts.comment || '',
      platformType,
      platformName: opts.platformName || (isWin ? 'Windows' : 'Linux'),
      category: 'host',
      isActive: true,
      favorite: Boolean(opts.favorite),
      nodeKeys: [nodeKey],
      account: opts.account || (isWin ? 'Administrator' : 'root'),
      protocols: opts.protocols
        ? opts.protocols
        : isWin
          ? [{ name: 'rdp', port: 3389 }]
          : [
              { name: 'ssh', port: 22 },
              { name: 'sftp', port: 22 }
            ],
      accounts: (opts.accounts || [isWin ? 'Administrator' : 'root']).map((u) => ({
        id: uuid(`acc-${name}-${u}`),
        alias: u.startsWith('@') ? u : uuid(`acc-${name}-${u}`),
        name: u,
        username: u,
        hasSecret: !u.startsWith('@')
      }))
    })
  }

  add('web-01', '1:1:1', { favorite: true, accounts: ['root', 'deploy'], comment: 'Nginx ön yüz' })
  add('web-02', '1:1:1', { accounts: ['root', 'deploy'] })
  add('app-01', '1:1:1', { platformName: 'RedHat', accounts: ['root'] })
  add('app-02', '1:1:1', { platformName: 'RedHat', accounts: ['@INPUT'] })
  add('test-01', '1:1:2')
  add('test-02', '1:1:2')
  add('dc-01', '1:2', { platformType: 'windows', favorite: true })
  add('ts-01', '1:2', { platformType: 'windows' })
  add('db-01', '1:3', { accounts: ['postgres', 'root'], comment: 'PostgreSQL 16' })
  add('db-02', '1:3', { accounts: ['postgres'] })
  add('jump-ops', '1')
  add('idrac-console', '1:2', {
    platformType: 'website',
    platformName: 'Website',
    address: 'https://10.12.9.10',
    protocols: [{ name: 'http', port: 443 }],
    accounts: ['@ANON']
  })
  add('int-partner-gateway01.example.com', '1:5:1', {
    platformType: 'windows',
    address: 'int-partner-gateway01.example.com'
  })
  add('int-partner-gateway02.example.com', '1:5:1', {
    platformType: 'windows',
    address: 'int-partner-gateway02.example.com'
  })
  add('dr-site-01', '1:5:1:1:1:1')
  for (let i = 1; i <= 250; i++) add(`node-${String(i).padStart(3, '0')}`, '1:4')

  const amount = (key) =>
    assets.filter((a) => a.nodeKeys.some((k) => k === key || k.startsWith(`${key}:`))).length
  for (const n of nodes) n.amount = amount(n.key)
  return { nodes, assets }
}

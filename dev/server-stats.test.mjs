// Sunucu durumu: kabuk betiğinin örneği (bash ve zsh, bu makinenin /proc'u) ve ayrıştırıcı.
// Kullanım: node dev/server-stats.test.mjs
import { buildSync } from 'esbuild'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const root = path.resolve(import.meta.dirname, '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-stats-'))
const entry = path.join(dir, 'entry.ts')
fs.writeFileSync(
  entry,
  `export { SHELL_SCRIPTS, buildSetupCommand } from ${JSON.stringify(path.join(root, 'src/renderer/src/features/terminal/shell-integration.ts'))}
export { parseSample, applySample, fullestDisk, usageLevel } from ${JSON.stringify(path.join(root, 'src/renderer/src/stores/server-stats.ts'))}`
)
const outfile = path.join(dir, 'stats.cjs')
buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  logLevel: 'error'
})
const { SHELL_SCRIPTS, buildSetupCommand, parseSample, applySample, fullestDisk, usageLevel } =
  createRequire(import.meta.url)(outfile)

let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// Betikte yalnız yardımcı işlevler (__jd_b64, __jd_osc) ve ölçüm işlevleri kullanılır.
const helpers = SHELL_SCRIPTS.integration.split('\n').slice(0, 2).join('\n')
const script = `${helpers}\n${SHELL_SCRIPTS.stats}\n__jd_sm 1; echo ---; sleep 1; __jd_sm 0`

for (const shell of ['bash', 'zsh']) {
  try {
    execFileSync('sh', ['-c', `command -v ${shell}`], { stdio: 'ignore' })
  } catch {
    console.log(`skip ${shell} (kurulu değil)`)
    continue
  }
  const out = execFileSync(shell, ['-c', script], { encoding: 'utf8' })
  const [first, second] = out.split('---\n')
  const a = parseSample(first)
  const b = parseSample(second)
  const s1 = applySample(null, null, a, 1000)
  const s2 = applySample(s1, a.cpu, b, 2000)
  check(`${shell}: cpu counters parsed`, a.cpu !== null && a.cpu.total > 0)
  check(
    `${shell}: cpu percent after two samples`,
    s2.cpu !== null && s2.cpu >= 0 && s2.cpu <= 100,
    `${s2.cpu?.toFixed(1)}%`
  )
  check(`${shell}: first sample has no cpu percent`, s1.cpu === null)
  check(
    `${shell}: memory`,
    s2.memTotal > 0 && s2.memUsed > 0 && s2.memUsed <= s2.memTotal,
    `${(s2.memUsed / 2 ** 30).toFixed(1)}/${(s2.memTotal / 2 ** 30).toFixed(1)} GB`
  )
  check(`${shell}: load`, Array.isArray(s2.load) && s2.load.length === 3, s2.load?.join(' '))
  check(`${shell}: uptime`, s2.uptimeSec > 0)
  check(
    `${shell}: cores and os from first sample kept`,
    s2.cores > 0 && Boolean(s2.os),
    `${s2.cores} · ${s2.os}`
  )
  check(
    `${shell}: disks from first sample kept`,
    s2.disks.length > 0 && s2.disks.every((d) => d.size > 0),
    s2.disks.map((d) => d.mount).join(', ')
  )
  check(
    `${shell}: pseudo filesystems skipped`,
    !s2.disks.some((d) => /^\/(dev|run|sys|proc)(\/|$)/.test(d.mount))
  )
  check(`${shell}: second sample has no disks`, b.disks === null)
}

// Kurulum komutu tek satır: satır düzenlemesi olmayan kabuklarda (kanonik kip) 4096 baytı aşan satır kesilir
const setupLength = Buffer.byteLength(buildSetupCommand({ statsIntervalSec: 30 }))
check('setup command fits a 4096-byte terminal line', setupLength < 4096, `${setupLength} bayt`)

// Eski çekirdek (MemAvailable yok), boşluklu bağlama noktası, bozuk satırlar
const legacy = parseSample(
  [
    'cpu  100 0 50 800 50 0 0 0 0 0',
    'MemTotal 1000',
    'MemFree 200',
    'Buffers 100',
    'Cached 300',
    'SwapTotal 0',
    'SwapFree 0',
    'load 0.50 0.40 0.30 1/100 200',
    'up 90061.12',
    'disk 1000 950 /mnt/my data',
    'disk x y /broken',
    'garbage line',
    ''
  ].join('\n')
)
const legacyStats = applySample(null, null, legacy, 0)
check(
  'legacy memory without MemAvailable',
  legacyStats.memUsed === 400 * 1024,
  `${legacyStats.memUsed}`
)
check(
  'mount point with spaces',
  legacyStats.disks.length === 1 && legacyStats.disks[0].mount === '/mnt/my data'
)
check(
  'cpu from counters',
  (() => {
    const next = parseSample('cpu  150 0 100 850 50 0 0 0 0 0')
    const s = applySample(legacyStats, legacy.cpu, next, 1)
    return Math.round(s.cpu) === 67
  })()
)
check(
  'fullest disk',
  fullestDisk([
    { mount: '/', size: 10, used: 5 },
    { mount: '/var', size: 10, used: 9 }
  ]).mount === '/var'
)
check(
  'usage levels',
  usageLevel(79) === 'ok' && usageLevel(80) === 'warn' && usageLevel(90) === 'critical'
)

process.exitCode = failed ? 1 : 0

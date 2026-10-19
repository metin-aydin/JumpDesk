// Sunucu durumu: kabuk betiğinin örneği (bash ve zsh, bu makinenin /proc'u) ve ayrıştırıcı.
// Kullanım: node dev/server-stats.test.mjs
import { buildSync } from 'esbuild'
import { execFileSync } from 'node:child_process'
import zlib from 'node:zlib'
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
export { parseSample, applySample, largestDisk, usageLevel } from ${JSON.stringify(path.join(root, 'src/renderer/src/stores/server-stats.ts'))}`
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
const { SHELL_SCRIPTS, buildSetupCommand, parseSample, applySample, largestDisk, usageLevel } =
  createRequire(import.meta.url)(outfile)

let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// Betikte yalnız yardımcı işlevler (__jd_b64, __jd_osc) ve ölçüm işlevleri kullanılır.
const helpers = SHELL_SCRIPTS.integration.split('\n').slice(0, 2).join('\n')
// İkinci örnekten önce bir çekirdeği meşgul eden işlem başlatılır; en çok CPU kullananlarda görünmeli.
const script = `${helpers}\n${SHELL_SCRIPTS.stats}
p=$(__jd_pr); __jd_sm 1; __jd_tp "" "$p"; echo ---
(timeout 3 sh -c 'while :; do :; done' &); sleep 1.5
c=$(__jd_pr); __jd_sm 0; __jd_tp "$p" "$c"; echo ---
{ __jd_sm 1; __jd_tp "$p" "$c"; } | gzip -c | __jd_b64`
const cpuCount = os.cpus().length
const pageSize = Number(execFileSync('getconf', ['PAGESIZE'], { encoding: 'utf8' }))

for (const shell of ['bash', 'zsh']) {
  try {
    execFileSync('sh', ['-c', `command -v ${shell}`], { stdio: 'ignore' })
  } catch {
    console.log(`skip ${shell} (kurulu değil)`)
    continue
  }
  const out = execFileSync(shell, ['-c', script], { encoding: 'utf8' })
  const [first, second, packed] = out.split('---\n')
  const a = parseSample(first)
  const b = parseSample(second)
  const s1 = applySample(null, null, a, 1000)
  const s2 = applySample(s1, { all: a.cpu, cores: a.coreCpu }, b, 2000)
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
  check(
    `${shell}: per-core counters for every core`,
    a.coreCpu?.length === cpuCount && a.coreCpu.every(Boolean),
    `${a.coreCpu?.length}/${cpuCount}`
  )
  check(
    `${shell}: per-core usage and history after two samples`,
    s2.coreUsage.length === cpuCount &&
      s2.coreUsage.every((v) => v >= 0 && v <= 100) &&
      s2.coreHistory.length === cpuCount &&
      s2.coreHistory.every((h) => h.length === 1) &&
      s1.coreUsage.length === 0,
    s2.coreUsage.map((v) => Math.round(v)).join(' ')
  )
  check(`${shell}: page size reported`, s1.pageSize === pageSize, `${s1.pageSize}`)
  check(`${shell}: first sample has no cpu processes`, a.procCpu === null && s1.topCpu.length === 0)
  check(
    `${shell}: top memory processes`,
    s1.topMem.length === 5 &&
      s1.topMem.every(
        (p, i, all) => p.pid > 0 && p.name && (i === 0 || all[i - 1].value >= p.value)
      ),
    s1.topMem.map((p) => `${p.name} ${Math.round(p.value / 2 ** 20)}M`).join(', ')
  )
  const busy = s2.topCpu.find((p) => p.name === 'sh')
  check(
    `${shell}: busy process leads top cpu`,
    s2.topCpu.length > 0 &&
      s2.topCpu.length <= 5 &&
      busy !== undefined &&
      busy.value > 50 / cpuCount &&
      s2.topCpu.every((p) => p.value > 0 && p.value <= 100),
    s2.topCpu.map((p) => `${p.name} ${p.value.toFixed(1)}%`).join(', ')
  )
  const fromGzip = parseSample(
    zlib.gunzipSync(Buffer.from(packed.trim(), 'base64')).toString('utf8')
  )
  check(
    `${shell}: compressed sample carries counters and processes`,
    fromGzip.cpu !== null &&
      fromGzip.coreCpu?.length === cpuCount &&
      fromGzip.procCpu?.length > 0 &&
      fromGzip.procMem?.length === 5
  )
}

// Kurulum komutu tek satır: satır düzenlemesi olmayan kabuklarda (kanonik kip) 4096 baytı aşan satır kesilir
const setup = await buildSetupCommand({ statsIntervalSec: 30 })
const setupLength = Buffer.byteLength(setup)
check('setup command fits a 4096-byte terminal line', setupLength < 4096, `${setupLength} bayt`)

// Sıkıştırılmış kurulum gerçek kabukta çalışır: I, sıkıştırılmış geçmiş (h) ve komut adları (k) gelir
const oscs = (text) =>
  [...text.matchAll(/\x1b\]6973;([A-Za-z]);([^\x07]*)\x07/g)].map((m) => ({
    type: m[1],
    data: m[2]
  }))
const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')
for (const shell of ['bash', 'zsh']) {
  try {
    execFileSync('sh', ['-c', `command -v ${shell}`], { stdio: 'ignore' })
  } catch {
    continue
  }
  const full = oscs(
    execFileSync(shell, ['-c', (await buildSetupCommand()).trim()], { encoding: 'utf8' })
  )
  const names = full.find((o) => o.type === 'k')
  check(
    `${shell}: compressed setup reports ip, history and command names`,
    ['I', 'h', 'k'].every((t) => full.some((o) => o.type === t)) &&
      gunzip(names.data).split('\n').includes('ls'),
    full.map((o) => o.type).join('')
  )
  const cached = oscs(
    execFileSync(shell, ['-c', (await buildSetupCommand({ commandNames: false })).trim()], {
      encoding: 'utf8'
    })
  )
  check(`${shell}: command names skipped when cached`, !cached.some((o) => o.type === 'k'))
}

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
    const s = applySample(legacyStats, { all: legacy.cpu, cores: null }, next, 1)
    return Math.round(s.cpu) === 67
  })()
)
check(
  'largest disk',
  largestDisk([
    { mount: '/', size: 10, used: 9 },
    { mount: '/data', size: 50, used: 5 },
    { mount: '/var', size: 20, used: 19 }
  ]).mount === '/data'
)

// İşlem payı toplam CPU tikine oranlanır; CPU harcamayan işlem listede yer almaz; bellek sayfa boyutuyla çarpılır
const before = parseSample(
  'cpu  100 0 100 800 0 0 0 0 0 0\ncpu0 50 0 50 400\ncpu1 50 0 50 400\npg 16384'
)
const after = parseSample(
  [
    'cpu  150 0 150 900 0 0 0 0 0 0',
    'cpu0 100 0 50 400',
    'cpu1 50 0 100 450',
    'pc 40 12 java',
    'pc 0 13 idle proc',
    'pm 1000 12 java',
    'pm 10 14 my worker'
  ].join('\n')
)
const base = applySample(null, null, before, 0)
const share = applySample(base, { all: before.cpu, cores: before.coreCpu }, after, 1)
check(
  'process cpu share of all ticks',
  share.topCpu.length === 1 && share.topCpu[0].name === 'java' && share.topCpu[0].value === 20,
  JSON.stringify(share.topCpu)
)
check(
  'process memory uses page size and keeps names with spaces',
  share.topMem[0].value === 1000 * 16384 && share.topMem[1].name === 'my worker'
)
check(
  'per-core usage from cpuN lines',
  share.coreUsage.length === 2 && share.coreUsage[0] === 100 && share.coreUsage[1] === 50,
  share.coreUsage.join(' ')
)
const resized = applySample(
  share,
  { all: after.cpu, cores: [after.coreCpu[0]] },
  parseSample('cpu  160 0 160 910 0 0 0 0 0 0\ncpu0 105 0 55 400'),
  2
)
check(
  'core history restarts when core count changes',
  resized.coreHistory.length === 1 && resized.coreHistory[0].length === 1
)
check(
  'usage levels',
  usageLevel(79) === 'ok' && usageLevel(80) === 'warn' && usageLevel(90) === 'critical'
)

process.exitCode = failed ? 1 : 0

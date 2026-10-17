// Sunucu grubu açıkken yeni sekme açmanın ("+") ve gruba geri dönmenin arayüzü ne kadar kilitlediğini ölçer.
// Kendi mock sunucusunu (MOCK_DATA=perf) ayrı bir portta açar. Her terminalin geri kaydırma arabelleği doldurulur ve
// sürekli log akar; vurgu ve alarm kuralları açıktır.
// Kullanım: npm run build && node dev/e2e/group-perf.mjs [sunucu-sayısı] [klasör]
//   PERF_VISIBLE=1  pencere ekranda açılır (gerçek GPU ile WebGL); yoksa ekran dışı çizimde WebGL SwiftShader ile açılır
//   PERF_PROFILE=1  ilk "+" tıklamasının CPU profili alınır, en çok süren işlevler yazılır
//   PERF_PROFILE=idle  etkileşimsiz akış sırasının CPU profili alınır
//   PERF_MAX_MS     geçiş başına izin verilen en uzun kilitlenme (varsayılan 250)
//   PERF_APP        açılacak ana süreç dosyası (varsayılan out/main/index.js; başka klasöre derlenmiş sürümü ölçmek için)
//   JUMPDESK_DISABLE_WEBGL=1  terminaller DOM çiziciyle çizilir (WebGL olmayan makineler)
import { _electron as electron } from 'playwright-core'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importFile, login, writeExportFile } from './helpers.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const servers = Number(process.argv[2] || 5)
const out = process.argv[3] || path.join(os.tmpdir(), 'jumpdesk-group-perf')
fs.mkdirSync(out, { recursive: true })
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-group-perf-'))
const visible = process.env.PERF_VISIBLE === '1'
const maxAllowed = Number(process.env.PERF_MAX_MS || 250)
const MOCK_PORT = 18095

const mock = spawn(process.execPath, [path.join(root, 'dev/mock-jms/server.mjs')], {
  env: {
    ...process.env,
    MOCK_PORT: String(MOCK_PORT),
    MOCK_DATA: 'perf',
    MOCK_PERF_SERVERS: String(servers),
    MOCK_ROOT: path.join(work, 'hosts')
  },
  stdio: ['ignore', 'pipe', 'inherit']
})
await new Promise((resolve, reject) => {
  mock.stdout.on('data', (d) => d.toString().includes('mock JumpServer') && resolve())
  mock.once('exit', (code) => reject(new Error(`mock server exited (${code})`)))
})

let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const app = await electron.launch({
  args: [
    '--ozone-platform=x11',
    ...(visible ? [] : ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']),
    process.env.PERF_APP || path.join(root, 'out/main/index.js')
  ],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: `http://127.0.0.1:${MOCK_PORT}`,
    ...(visible ? {} : { JUMPDESK_HIDE_WINDOW: '1', JUMPDESK_OFFSCREEN: '1' }),
    JUMPDESK_NO_NOTIFY: '1',
    JUMPDESK_ALARM_WARMUP_MS: '0',
    JUMPDESK_ALARM_SNIPPET_WAIT_MS: '0',
    JUMPDESK_USER_DATA: path.join(work, 'user-data')
  }
})
const page = await app.firstWindow()
page.on('console', (m) => m.type() === 'error' && console.log(`console.error: ${m.text()}`))
if (!visible)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1600, 1000))

/** Ana iş parçacığını izler: uzun görevler ve kareler arası en uzun boşluk. */
const startWatch = () =>
  page.evaluate(() => {
    const w = (window.__perf = { long: [], maxGap: 0, last: performance.now(), on: true })
    w.observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.long.push(Math.round(e.duration))
    })
    w.observer.observe({ type: 'longtask', buffered: false })
    const tick = () => {
      if (!w.on) return
      const now = performance.now()
      w.maxGap = Math.max(w.maxGap, now - w.last)
      w.last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
const stopWatch = () =>
  page.evaluate(() => {
    const w = window.__perf
    w.on = false
    w.observer.disconnect()
    return { long: w.long, maxGap: Math.round(w.maxGap) }
  })

/**
 * Seçicinin `index`. öğesine (eksiyse sondan) tıklayıp tıklamadan sonraki ilk karenin çizilmesine kadar geçen süreyi
 * ölçer.
 */
const timedClick = ({ selector, index = 0 }) =>
  page.evaluate(
    async ({ sel, i }) => {
      const el = [...document.querySelectorAll(sel)].at(i)
      if (!el) throw new Error(`not found: ${sel} [${i}]`)
      const t0 = performance.now()
      el.click()
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
      return Math.round(performance.now() - t0)
    },
    { sel: selector, i: index }
  )

const renderer = () =>
  page.evaluate(() => {
    const screens = [...document.querySelectorAll('.xterm-screen')]
    const webgl = screens.filter((s) => s.querySelector('canvas')).length
    return { terminals: screens.length, webgl }
  })

async function startProfile() {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
  await cdp.send('Profiler.start')
  return cdp
}

/** Profili dosyaya yazar ve en çok öz süre harcayan işlevleri listeler. */
async function printProfile(cdp, name) {
  const { profile } = await cdp.send('Profiler.stop')
  fs.writeFileSync(path.join(out, `${name}.cpuprofile`), JSON.stringify(profile))
  const self = new Map()
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const dt = profile.timeDeltas
  profile.samples.forEach((id, i) => {
    const n = byId.get(id)
    const key = `${n.callFrame.functionName || '(anonymous)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000)
  })
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
  console.log(`CPU profili — ${name} (öz süre, ms):`)
  for (const [k, v] of top) console.log(`  ${v.toFixed(1).padStart(8)}  ${k}`)
}

/** Geçiş ölçümü: tıklama → ilk kare, sonra 1,5 sn boyunca uzun görevler ve en uzun kare boşluğu. */
async function measure(label, target) {
  await startWatch()
  const firstFrame = await timedClick(target)
  await page.waitForTimeout(1500)
  const { long, maxGap } = await stopWatch()
  const blocked = long.reduce((a, b) => a + b, 0)
  console.log(
    `${label}: ilk kare ${firstFrame} ms, en uzun kare boşluğu ${maxGap} ms, uzun görevler [${long.join(', ')}] (toplam ${blocked} ms)`
  )
  return { firstFrame, maxGap, blocked }
}

try {
  await login(app, page)
  // Vurgu ve alarm kuralları (log satırlarındaki kelimeler boyanır ve alarm yakalanır)
  const rule = (id, pattern, extra = {}) => ({
    id,
    pattern,
    regex: false,
    caseSensitive: true,
    enabled: true,
    ...extra
  })
  await importFile(
    app,
    page,
    writeExportFile(work, {
      highlights: [
        rule('h1', 'ERROR', { fg: '#ffffff', bg: '#cf222e' }),
        rule('h2', 'WARN', { fg: '#ffffff', bg: '#9a6700' }),
        rule('h3', 'INFO', { fg: '#ffffff', bg: '#0969da' })
      ],
      alarms: [rule('a1', 'Exception')]
    })
  )
  await page.waitForTimeout(800)

  const tree = page.getByRole('tree')
  await tree.getByText('Cluster', { exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Klasördeki \d+ Sunucuya Farklı Bağlan…/ }).hover()
  await page.getByRole('menuitem', { name: 'Tümünü Izgara Şeklinde Açarak Bağlan' }).click()
  await page.waitForFunction(
    (n) => document.querySelectorAll('.xterm-helper-textarea').length >= n,
    servers,
    { timeout: 20000 }
  )
  await page.waitForTimeout(5000)
  const info = await renderer()
  console.log(`${info.terminals} terminal, ${info.webgl} tanesi WebGL ile çiziliyor`)
  check('all sessions open', info.terminals === servers, `${info.terminals}/${servers}`)

  // Geri kaydırma arabelleği dolar (5000 satır), ardından her terminalde saniyede ~50 satır log akar.
  const fill =
    'for i in $(seq 1 6000); do printf "%s INFO [w-%d] GET /api/orders/%d 200 WARN slow ERROR none\\n" "$EPOCHREALTIME" $i $RANDOM; done; ' +
    'while :; do for j in 1 2 3 4 5; do printf "%s INFO [w-%d] GET /api/orders 200 WARN slow ERROR timeout\\n" "$EPOCHREALTIME" $RANDOM; done; sleep 0.1; done\n'
  const inputs = page.locator('.xterm-helper-textarea')
  for (let i = 0; i < servers; i++) {
    await inputs.nth(i).focus()
    await page.keyboard.insertText(fill)
    await page.keyboard.press('Enter')
  }
  await page.waitForTimeout(6000)

  const idleCdp = process.env.PERF_PROFILE === 'idle' ? await startProfile() : null
  await startWatch()
  await page.waitForTimeout(2000)
  const idle = await stopWatch()
  if (idleCdp) await printProfile(idleCdp, 'idle')
  console.log(
    `akış sırasında (etkileşim yok): en uzun kare boşluğu ${idle.maxGap} ms, uzun görevler [${idle.long.join(', ')}]`
  )

  const plus = { selector: '[aria-label="Yeni Bağlantı"]' }
  const groupTab = { selector: '[data-tab-strip] [role=tab]', index: 0 }
  const results = []
  let cdp = process.env.PERF_PROFILE === '1' ? await startProfile() : null
  for (let round = 1; round <= 3; round++) {
    results.push(await measure(`tur ${round} — "+" (yeni sekme)`, plus))
    if (cdp && round === 1) {
      await printProfile(cdp, 'plus')
      cdp = null
    }
    results.push(await measure(`tur ${round} — gruba dönüş`, groupTab))
    // Yeni bağlantı sekmesi kapatılır (bir sonraki tur aynı koşulda başlasın)
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[data-tab-strip] [role=tab]')]
      tabs.at(-1)?.querySelector('[aria-label="Sekmeyi kapat"]')?.click()
    })
    await page.waitForTimeout(500)
  }
  const worst = Math.max(...results.map((r) => Math.max(r.maxGap, r.firstFrame)))
  check(`switching tabs stays responsive (< ${maxAllowed} ms)`, worst < maxAllowed, `${worst} ms`)
} catch (err) {
  failed = true
  console.log(`FAIL: ${err.message}`)
} finally {
  await app.close().catch(() => undefined)
  mock.kill()
  process.exitCode = failed ? 1 : 0
}

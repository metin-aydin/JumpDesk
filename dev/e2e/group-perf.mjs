// Sunucu grubu açıkken yeni sekme açmanın ("+") ve gruba geri dönmenin arayüzü ne kadar kilitlediğini ölçer.
// Kendi mock sunucusunu (MOCK_DATA=perf) ayrı bir portta açar. Her terminalin geri kaydırma arabelleği doldurulur ve
// sürekli log akar; vurgu ve alarm kuralları açıktır.
// Kullanım: npm run build && node dev/e2e/group-perf.mjs [sunucu-sayısı] [klasör]
//   PERF_VISIBLE=1  pencere ekranda ve üstte açılır; yoksa ekran dışı çizilir (WebGL ikisinde de gerçek GPU'yu, GPU yoksa
//                   SwiftShader'ı kullanır). Görünür ölçüm, pencere örtülürse XWayland saniyede bir kareye düştüğü için bozulur.
//   PERF_PROFILE=1  ilk "+" tıklamasının CPU profili alınır, en çok süren işlevler yazılır
//   PERF_PROFILE=idle  etkileşimsiz akış sırasının CPU profili alınır
//   PERF_PROFILE=switch  gruplar arası tüm geçişlerin CPU profili alınır (PERF_GROUPS > 1)
//   PERF_MAX_MS     geçiş başına izin verilen en uzun kilitlenme (varsayılan 250)
//   PERF_APP        açılacak ana süreç dosyası (varsayılan out/main/index.js; başka klasöre derlenmiş sürümü ölçmek için)
//   PERF_GROUPS     açılacak grup sayısı (varsayılan 1); 1'den fazlaysa gruplar arası geçiş ölçülür
//   PERF_STATUS=1   sunucu durum şeridi açılır (her oturumda ölçüm döngüsü)
//   PERF_ZOOM=0.85  arayüz yakınlaştırması (Ayarlar'daki arayüz yazı boyutuyla aynı etki)
//   PERF_STREAM=0   geçmiş doldurulur ama sürekli log akmaz (boşta terminaller; tarayıcının boşta görevleri çalışır)
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
const groups = Number(process.env.PERF_GROUPS || 1)
const sessions = servers * groups
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
// Görünür ölçümde pencere üstte tutulur: başka pencere örterse Chromium kareleri yavaşlatır ve ölçüm bozulur.
if (visible)
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setAlwaysOnTop(true)
    win.focus()
  })
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

/** Görünen terminallerde "En Alta Kaydır" bandı (kimse yukarı kaydırmadı; çıkmamalı). */
const visibleBands = () =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.bg-terminal')].filter(
        (pane) =>
          pane.getBoundingClientRect().width > 0 &&
          [...pane.querySelectorAll('button')].some((b) => b.textContent.includes('En Alta Kaydır'))
      ).length
  )
let bandsSeen = 0

/** Geçiş ölçümü: tıklama → ilk kare, sonra 1,5 sn boyunca uzun görevler ve en uzun kare boşluğu. */
async function measure(label, target) {
  await startWatch()
  const firstFrame = await timedClick(target)
  await page.waitForTimeout(300)
  bandsSeen += await visibleBands()
  await page.waitForTimeout(1200)
  bandsSeen += await visibleBands()
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
  if (process.env.PERF_ZOOM)
    await page.evaluate((z) => window.jumpdesk.ui.setZoom(z), Number(process.env.PERF_ZOOM))
  if (process.env.PERF_STATUS === '1') {
    await page.keyboard.press('Control+,')
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Sunucu Durumu', exact: true }).click()
    await dialog.getByRole('switch', { name: 'Sunucu Durum Şeridi' }).click()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
  }

  const tree = page.getByRole('tree')
  for (let g = 1; g <= groups; g++) {
    const openedAt = Date.now()
    await startWatch()
    await tree.getByText('Cluster', { exact: true }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: /Klasördeki \d+ Sunucuya Farklı Bağlan…/ }).hover()
    await page.getByRole('menuitem', { name: 'Tümünü Izgara Şeklinde Açarak Bağlan' }).click()
    await page.waitForFunction(
      (n) => document.querySelectorAll('.xterm-helper-textarea').length >= n,
      servers * g,
      { timeout: 60000 }
    )
    await page.waitForTimeout(groups > 1 ? 3000 : 5000)
    const opened = await stopWatch()
    const r = await renderer()
    console.log(
      `grup ${g} açıldı: ${Date.now() - openedAt} ms, en uzun kare boşluğu ${opened.maxGap} ms, uzun görevler [${opened.long.join(', ')}], ${r.webgl}/${r.terminals} WebGL`
    )
  }
  const info = await renderer()
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'yok'
  })
  console.log(`${info.terminals} terminal, ${info.webgl} tanesi WebGL ile çiziliyor (GPU: ${gpu})`)
  check('all sessions open', info.terminals === sessions, `${info.terminals}/${sessions}`)

  // Geri kaydırma arabelleği dolar (5000 satır), ardından her terminalde saniyede ~50 satır log akar.
  const fill =
    'for i in $(seq 1 6000); do printf "%s INFO [w-%d] GET /api/orders/%d 200 WARN slow ERROR none\\n" "$EPOCHREALTIME" $i $RANDOM; done; ' +
    (process.env.PERF_STREAM === '0'
      ? '\n'
      : 'while :; do for j in 1 2 3 4 5; do printf "%s INFO [w-%d] GET /api/orders 200 WARN slow ERROR timeout\\n" "$EPOCHREALTIME" $RANDOM; done; sleep 0.1; done\n')
  const groupTabs = '[data-tab-strip] [role=tab]'
  for (let g = 0; g < groups; g++) {
    // Her grubun terminalleri görünürken komutu alır (odak yalnız görünen terminalde çalışır)
    if (groups > 1) {
      await page.locator(groupTabs).nth(g).click()
      await page.waitForTimeout(800)
    }
    const inputs = page.locator('.xterm-helper-textarea:visible')
    for (let i = 0; i < servers; i++) {
      await inputs.nth(i).focus()
      await page.keyboard.insertText(fill)
      await page.keyboard.press('Enter')
    }
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
  const groupTab = { selector: groupTabs, index: 0 }
  const results = []
  let cdp = process.env.PERF_PROFILE === '1' ? await startProfile() : null
  const switchCdp = process.env.PERF_PROFILE === 'switch' ? await startProfile() : null
  // Birden çok grupta: gruplar arasında sırayla geçilir
  for (let round = 1; groups > 1 && round <= 3; round++) {
    for (let g = 0; g < groups; g++) {
      results.push(await measure(`tur ${round} — grup ${g + 1}`, { selector: groupTabs, index: g }))
      if (cdp) {
        await printProfile(cdp, 'group-switch')
        cdp = null
      }
    }
    const r = await renderer()
    console.log(`  ${r.terminals} terminal, ${r.webgl} WebGL`)
  }
  if (switchCdp) await printProfile(switchCdp, 'group-switches')
  for (let round = 1; groups === 1 && round <= 3; round++) {
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
  // WebGL bağlamı bırakılıp DOM çiziciye geçen gizli terminaller gizliyken çizilmemeli: gizli (display:none)
  // terminalde karakter genişlikleri ölçülemez, her çizim tüm satırları harf harf ölçer (gerçek ortamda saniyeler).
  const webgl = process.env.JUMPDESK_DISABLE_WEBGL !== '1'
  const hiddenDrawn = await page.evaluate(() =>
    [...document.querySelectorAll('.xterm-screen')]
      .filter((s) => s.getBoundingClientRect().width === 0 && !s.querySelector('canvas'))
      .map((s) => (s.querySelector('.xterm-rows')?.textContent ?? '').trim().length)
  )
  if (webgl)
    check(
      'hidden terminals without WebGL are not drawn while hidden',
      hiddenDrawn.every((n) => n === 0),
      `${hiddenDrawn.length} gizli DOM terminali, çizilmiş metin: [${hiddenDrawn.join(', ')}]`
    )
  if (groups > 1) {
    // Bağlamı bırakılmış bir grubu yeniden gösterip ekran görüntüsü alınır (içerik doğru çizilmeli)
    await page.locator(groupTabs).nth(0).click()
    await page.waitForTimeout(800)
    const b64 = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
    )
    fs.writeFileSync(path.join(out, 'group-1-after-switching.png'), Buffer.from(b64, 'base64'))
    const r = await renderer()
    const shown = await page.evaluate(
      () =>
        [...document.querySelectorAll('.xterm-screen')].filter(
          (s) => s.getBoundingClientRect().width > 0 && s.querySelector('canvas')
        ).length
    )
    if (webgl)
      check(
        'shown group draws with WebGL again',
        shown === servers,
        `${shown}/${servers} (${r.webgl} WebGL)`
      )
  }
  check('no scroll-to-bottom band after switching', bandsSeen === 0, `${bandsSeen} kez görüldü`)
  const worst = Math.max(...results.map((r) => Math.max(r.maxGap, r.firstFrame)))
  check(`switching tabs stays responsive (< ${maxAllowed} ms)`, worst < maxAllowed, `${worst} ms`)
} catch (err) {
  failed = true
  console.log(`FAIL: ${err.message.split('\n')[0]}`)
  const state = await page
    .evaluate(() => ({
      terminals: document.querySelectorAll('.xterm-helper-textarea').length,
      tabs: [...document.querySelectorAll('[data-tab-strip] [role=tab]')].map(
        (t) => t.innerText.split('\n')[0]
      ),
      text: document.body.innerText.slice(0, 300)
    }))
    .catch((e) => `değerlendirilemedi: ${e.message}`)
  console.log(JSON.stringify(state))
  const b64 = await app
    .evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
    )
    .catch(() => null)
  if (b64) fs.writeFileSync(path.join(out, 'failure.png'), Buffer.from(b64, 'base64'))
} finally {
  await app.close().catch(() => undefined)
  mock.kill()
  process.exitCode = failed ? 1 : 0
}

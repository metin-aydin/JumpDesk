// Chrome tarzı çok pencereli sekmeler: şeritte serbest sürükleme, şerit dışına çıkınca şeffaf pencere önizlemesi ve
// yeni pencere, sekmeyi başka pencerenin şeridine bırakıp pencereleri birleştirme, ayrı pencereden ana pencereye
// geri taşıma, pencerenin tek sekmesini sürükleyince pencerenin kendisinin taşınması. X11 (XWayland) gerekir; ayrı
// pencereler test sırasında ekranda görünür. Kullanım: node dev/e2e/multiwindow.mjs <çıktı-klasörü>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const outDir = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-multiwindow-shots')
fs.mkdirSync(outDir, { recursive: true })
const steps = []
let failed = false
const log = (s) => {
  steps.push(s)
  console.log(s)
}
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const PREVIEW_TITLE = 'jumpdesk-drag-preview'
/** Ayrı pencerenin başlığı etkin sekmeyle değişir; tek ayrı pencere başlığındaki ekle bulunur. */
const DETACHED = '— JumpDesk'
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: process.env.JUMPDESK_SERVER || 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_NO_NOTIFY: '1',
    JUMPDESK_SHOW_DETACHED: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-multiwindow-'))
  }
})
const page = await app.firstWindow()
page.on('pageerror', (e) => log(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && log(`console.error: ${m.text()}`))

const waitForDetached = () =>
  app.waitForEvent('window', { timeout: 10000, predicate: (w) => !w.url().startsWith('data:') })
const windowCount = () =>
  app.evaluate(
    ({ BrowserWindow }, title) =>
      BrowserWindow.getAllWindows().filter((w) => w.getTitle() !== title).length,
    PREVIEW_TITLE
  )
const previewVisible = () =>
  app.evaluate(
    ({ BrowserWindow }, title) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() === title)
        ?.isVisible() ?? false,
    PREVIEW_TITLE
  )
/** İçerik alanları: ana pencere ve başlığında verilen sözcük geçen ayrı pencere. */
const rectOf = (part) =>
  app.evaluate(
    ({ BrowserWindow }, p) =>
      BrowserWindow.getAllWindows()
        .find((w) => (p ? w.getTitle().includes(p) : w.getTitle() === 'JumpDesk'))
        ?.getContentBounds(),
    part
  )
const setRect = (part, rect) =>
  app.evaluate(
    ({ BrowserWindow }, { p, r }) =>
      BrowserWindow.getAllWindows()
        .find((w) => (p ? w.getTitle().includes(p) : w.getTitle() === 'JumpDesk'))
        ?.setContentBounds(r),
    { p: part, r: rect }
  )
const stripNames = async (pg) =>
  (await pg.locator('[data-tab-strip] [role=tab]').allInnerTexts()).map((t) => t.split('\n')[0])
const shot = async (name, part) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }, p) => {
    const w = BrowserWindow.getAllWindows().find((x) =>
      p ? x.getTitle().includes(p) : x.getTitle() === 'JumpDesk'
    )
    return w ? (await w.capturePage()).toPNG().toString('base64') : null
  }, part)
  if (b64) fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(b64, 'base64'))
  log(`screenshot: ${name}`)
}
/** Kaynak sayfada sekmeyi tutup verilen noktalardan geçirerek sürükler; `release` false ise bırakmaz. */
const drag = async (pg, tab, points, release = true) => {
  const box = await tab.boundingBox()
  await pg.mouse.move(box.x + 30, box.y + 15)
  await pg.mouse.down()
  await pg.mouse.move(box.x + 40, box.y + 18, { steps: 3 })
  for (const [x, y] of points) {
    await pg.mouse.move(x, y, { steps: 8 })
    await pg.waitForTimeout(150)
  }
  if (release) await pg.mouse.up()
}

try {
  await login(app, page)
  const tree = page.getByRole('tree')
  await tree.getByText('jump-ops', { exact: true }).waitFor({ timeout: 15000 })
  check('runs with window positions', await page.evaluate(() => window.jumpdesk.windowPositions))
  await tree.getByText('jump-ops', { exact: true }).dblclick()
  await tree.getByText('Linux', { exact: true }).click()
  await tree.getByText('Prod', { exact: true }).click()
  for (const name of ['web-01', 'app-01']) {
    await page
      .getByRole('treeitem', { name: new RegExp(name) })
      .first()
      .dblclick()
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(1500)
  // Pencereler birbirinin üstüne binmesin: ana pencere solda, ayrı pencereler sağda.
  await setRect(null, { x: 0, y: 0, width: 1000, height: 700 })
  await page.waitForTimeout(300)
  log(`main strip: ${(await stripNames(page)).join(' | ')}`)

  // 1) Şeritte serbest sürükleme: kopya imleci dikeyde de izler
  const webTab = page.locator('[data-tab-strip] [role=tab]', { hasText: 'web-01' })
  const wb = await webTab.boundingBox()
  await drag(page, webTab, [[wb.x + 80, wb.y + 34]], false)
  const ghostTop = await page.evaluate(() => {
    const g = [...document.body.children].find(
      (n) => n.getAttribute?.('aria-hidden') === 'true' && n.style.position === 'fixed'
    )
    return g ? Math.round(g.getBoundingClientRect().top) : null
  })
  check(
    'ghost follows pointer vertically in strip',
    ghostTop !== null && ghostTop > wb.y + 10,
    `${wb.y} → ${ghostTop}`
  )
  check('no preview while on strip', !(await previewVisible()))

  // 2) Şeridin dışına (pencerenin içinde, çalışma alanına) çıkınca şeffaf pencere önizlemesi; bırakınca yeni pencere
  const firstWindow = waitForDetached()
  await page.mouse.move(wb.x + 220, 380, { steps: 8 })
  await page.waitForTimeout(600)
  check('preview appears when leaving the strip', await previewVisible())
  check(
    'ghost hidden while preview shows',
    await page.evaluate(
      () =>
        ![...document.body.children].some(
          (n) =>
            n.getAttribute?.('aria-hidden') === 'true' &&
            n.style.position === 'fixed' &&
            n.style.display !== 'none'
        )
    )
  )
  await shot('mw-01-preview-inside', PREVIEW_TITLE)
  await page.mouse.up()
  const w1 = await firstWindow
  await w1.waitForSelector('[data-tab-strip] [role=tab]', { timeout: 8000 })
  await page.waitForTimeout(500)
  check('new window from drop inside app', (await windowCount()) === 2)
  check(
    'tab left main strip',
    !(await stripNames(page)).includes('web-01'),
    (await stripNames(page)).join(' | ')
  )
  check('new window has its own strip', (await stripNames(w1)).join('|') === 'web-01')
  await setRect(DETACHED, { x: 1060, y: 0, width: 760, height: 560 })
  await page.waitForTimeout(400)
  const main = await rectOf(null)
  const r1 = await rectOf(DETACHED)
  log(`rects main=${JSON.stringify(main)} w1=${JSON.stringify(r1)}`)

  // 3) Ana penceredeki sekmeyi ayrı pencerenin şeridine bırakınca pencereler birleşir
  const appTab = page.locator('[data-tab-strip] [role=tab]', { hasText: 'app-01' })
  const intoW1 = [r1.x - main.x + 260, r1.y - main.y + 20]
  await drag(page, appTab, [[intoW1[0] - 120, 20], intoW1], false)
  check(
    'insertion marker shown in target window',
    await w1.evaluate(() =>
      [...document.body.children].some((n) => n.className?.includes?.('w-0.5'))
    )
  )
  await shot('mw-02-merge-marker', 'web-01')
  await page.mouse.up()
  await page.waitForTimeout(800)
  check(
    'tab moved into other window',
    (await stripNames(w1)).join('|') === 'web-01|app-01',
    (await stripNames(w1)).join(' | ')
  )
  check(
    'tab left main window',
    !(await stripNames(page)).includes('app-01'),
    (await stripNames(page)).join(' | ')
  )
  check('no extra window created', (await windowCount()) === 2)
  await w1.waitForTimeout(500)
  await shot('mw-03-merged', 'JumpDesk')

  // 4) Ayrı penceredeki sekmeyi ana pencerenin şeridine geri taşıma
  // Pencere yöneticisi öne alınan pencereyi kaydırabilir; konum her sürüklemeden önce yeniden sabitlenip okunur.
  await setRect(DETACHED, { x: 1060, y: 0, width: 760, height: 560 })
  await page.waitForTimeout(400)
  const r1a = await rectOf(DETACHED)
  const w1App = w1.locator('[data-tab-strip] [role=tab]', { hasText: 'app-01' })
  const toMain = [main.x - r1a.x + 400, main.y - r1a.y + 20]
  await drag(w1, w1App, [[-40, 20], toMain])
  await page.waitForTimeout(800)
  check(
    'tab dragged back to main strip',
    (await stripNames(page)).includes('app-01'),
    (await stripNames(page)).join(' | ')
  )
  check('detached window keeps remaining tab', (await stripNames(w1)).join('|') === 'web-01')

  // 5) Pencerenin tek sekmesi şerit dışına bırakılınca yeni pencere açılmaz, pencerenin kendisi taşınır
  const w1Tab = w1.locator('[data-tab-strip] [role=tab]', { hasText: 'web-01' })
  await drag(w1, w1Tab, [[200, 300]])
  await page.waitForTimeout(800)
  check('dragging last tab moves the window instead of opening one', (await windowCount()) === 2)
  check('tab still in its window', (await stripNames(w1)).join('|') === 'web-01')

  // 6) Ayrı pencerenin şeridinde serbest sıralama: ana pencereden ikinci sekme gelir, sonra yer değiştirir
  await setRect(DETACHED, { x: 1060, y: 0, width: 760, height: 560 })
  await page.waitForTimeout(300)
  const r1b = await rectOf(DETACHED)
  const jumpTab = page.locator('[data-tab-strip] [role=tab]', { hasText: 'jump-ops' })
  await drag(page, jumpTab, [[r1b.x - main.x + 40, r1b.y - main.y + 20]])
  await page.waitForTimeout(800)
  log(`w1 after second merge: ${(await stripNames(w1)).join(' | ')}`)
  const order0 = (await stripNames(w1)).join('|')
  const w1Jump = w1.locator('[data-tab-strip] [role=tab]', { hasText: 'jump-ops' })
  const jb = await w1Jump.boundingBox()
  await drag(w1, w1Jump, [[jb.x + jb.width + 260, jb.y + 15]])
  await page.waitForTimeout(500)
  const order1 = (await stripNames(w1)).join('|')
  check('reorder inside detached window', order0 !== order1, `${order0} → ${order1}`)
  check('main fell back to new connection', (await stripNames(page)).length >= 1)
  await shot('mw-04-detached-two-tabs', 'JumpDesk')

  // 7) "Yeni Bağlantı" sekmesi pencere dışına çıkamaz: kopya çıktığı kenarda kalır, yeni pencere açılmaz
  await page.keyboard.press('Control+Shift+T')
  await page.waitForTimeout(500)
  const connectTab = page
    .locator('[data-tab-strip] [role=tab]', { hasText: 'Yeni Bağlantı' })
    .last()
  const before = await windowCount()
  const cb = await connectTab.boundingBox()
  await page.mouse.move(cb.x + 30, cb.y + 15)
  await page.mouse.down()
  for (let x = cb.x + 20; x > -200; x -= 25) await page.mouse.move(x, cb.y + 15)
  await page.waitForTimeout(200)
  const connectGhost = await page.evaluate(() => {
    const g = [...document.body.children].find(
      (n) => n.getAttribute?.('aria-hidden') === 'true' && n.style.position === 'fixed'
    )
    return g ? Math.round(g.getBoundingClientRect().left) : null
  })
  check(
    'connect tab ghost stays at the left edge',
    connectGhost !== null && connectGhost < 40,
    `${connectGhost}`
  )
  check('no preview for connect tab', !(await previewVisible()))
  await page.mouse.up()
  await page.waitForTimeout(500)
  check('connect tab stays in main window', (await windowCount()) === before)
} catch (err) {
  failed = true
  log(`FAIL: ${err.message}`)
} finally {
  fs.writeFileSync(path.join(outDir, 'steps.txt'), steps.join('\n'))
  await app.close()
  process.exitCode = failed ? 1 : 0
}

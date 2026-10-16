// Ayarlar (yazı boyutları), vurgular, aramadan Ctrl ile toplu bağlanma, başlık çubuğunda açık menü ve sekmeyi
// (menüden) ayrı pencereye taşıyıp geri alma. Kullanım: node dev/e2e/windows.mjs <çıktı-klasörü>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importFixtureSnippets, login } from './helpers.mjs'

const outDir = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-windows-shots')
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
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: process.env.JUMPDESK_SERVER || 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    // Alarm testleri bağlantıdan hemen sonra çalışır; gerçek bekleme süresi alarm-warmup.mjs'de denetlenir.
    JUMPDESK_ALARM_WARMUP_MS: '0',
    JUMPDESK_ALARM_SNIPPET_WAIT_MS: '0',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_NO_NOTIFY: '1',
    // Gizli pencerede çizim döngüsü durduğundan ayrı pencereler görünür açılır.
    JUMPDESK_SHOW_DETACHED: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-windows-'))
  }
})
const capture = async (name, titlePart) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }, part) => {
    const wins = BrowserWindow.getAllWindows()
    const win = part
      ? wins.find((w) => w.getTitle().includes(part))
      : wins.find((w) => w.getTitle() === 'JumpDesk')
    return win ? (await win.capturePage()).toPNG().toString('base64') : null
  }, titlePart)
  if (b64) fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(b64, 'base64'))
  log(`screenshot: ${name}${b64 ? '' : ' (pencere yok)'}`)
}
const page = await app.firstWindow()
page.on('console', (m) => m.type() === 'error' && log(`console.error: ${m.text()}`))
page.on('pageerror', (e) => log(`pageerror: ${e.message}`))
const tabNames = async () =>
  (await page.locator('[data-tab-strip] [role=tab]').allInnerTexts()).map((t) => t.split('\n')[0])
const PREVIEW_TITLE = 'jumpdesk-drag-preview'
/** Ayrı sekme penceresi (sürükleme önizlemesi de bir pencere olduğu için ayrılır). */
const waitForDetached = () =>
  app.waitForEvent('window', { timeout: 10000, predicate: (w) => !w.url().startsWith('data:') })
const windowCount = () =>
  app.evaluate(
    ({ BrowserWindow }, title) =>
      BrowserWindow.getAllWindows().filter((w) => w.getTitle() !== title).length,
    PREVIEW_TITLE
  )
const previewState = () =>
  app.evaluate(({ BrowserWindow }, title) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === title)
    return w ? { visible: w.isVisible(), ...w.getBounds() } : null
  }, PREVIEW_TITLE)
const waitFor = async (fn, timeout = 8000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await fn()) return true
    await page.waitForTimeout(100)
  }
  return false
}

try {
  await login(app, page)
  await importFixtureSnippets(
    app,
    page,
    fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-fixture-'))
  )
  await page.getByRole('tree').waitFor({ timeout: 15000 })
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).waitFor({ timeout: 15000 })

  // 1) Ayarlar: profil yanındaki düğme, sürüm profil menüsünde, yazı boyutları
  check(
    'sidebar has settings button',
    (await page.getByRole('button', { name: 'Ayarlar' }).count()) === 1
  )
  await page.locator('aside').last().getByText('demo').first().click()
  await page.waitForTimeout(300)
  check('version in profile menu', (await page.getByText(/^Sürüm \d/).count()) === 1)
  await page.keyboard.press('Escape')
  const rowBefore = (await page.getByRole('treeitem').first().boundingBox()).height
  await page.keyboard.press('Control+,')
  await page.getByRole('heading', { name: 'Yazı Boyutu' }).waitFor({ timeout: 5000 })
  await page.waitForTimeout(300)
  await capture('win-01-settings')
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Sunucu Ağacı Yazısını Büyüt' }).click()
  await page.getByRole('button', { name: 'Yazılım Geneli Yazısını Büyüt' }).click()
  await page.waitForTimeout(300)
  const zoom = await page.evaluate(() => window.jumpdesk.ui.getZoom())
  check('ui zoom follows ui size', Math.abs(zoom - 14 / 13) < 0.001, `zoom ${zoom.toFixed(3)}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const rowAfter = (await page.getByRole('treeitem').first().boundingBox()).height
  // Satır CSS pikseli: 28 * (16/13) / (14/13) = 32
  check(
    'tree rows grow with tree size',
    Math.abs(rowAfter - 32) < 0.6,
    `${rowBefore} → ${rowAfter}`
  )
  await page.keyboard.press('Control+,')
  await page.getByRole('button', { name: 'Tümünü Varsayılana Döndür' }).click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('reset restores zoom', (await page.evaluate(() => window.jumpdesk.ui.getZoom())) === 1)

  // 2) Başlık çubuğu: menü açıkken sürükleme bölgesi tıklamayı sayfaya bırakır
  const regionOf = () =>
    page.evaluate(() =>
      getComputedStyle(document.querySelector('header')).getPropertyValue('-webkit-app-region')
    )
  const idleRegion = await regionOf()
  await page.getByRole('button', { name: 'Tema' }).click()
  await page.waitForTimeout(200)
  const openRegion = await regionOf()
  check(
    'titlebar not draggable while menu open',
    idleRegion === 'drag' && openRegion === 'no-drag',
    `${idleRegion} → ${openRegion}`
  )
  const header = await page.locator('header').boundingBox()
  await page.mouse.click(header.x + header.width * 0.55, header.y + header.height / 2)
  await page.waitForTimeout(300)
  check(
    'click on empty titlebar closes menu',
    (await page.getByRole('menuitem', { name: 'Koyu' }).count()) === 0
  )

  // 3) Aramada Ctrl ile toplu bağlanma
  await page.keyboard.press('Control+Shift+F')
  await page.keyboard.type('web')
  await page.getByRole('option').nth(1).waitFor({ timeout: 8000 })
  const options = page.locator('aside [role=option]')
  const optCount = await options.count()
  const before = (await tabNames()).length
  await page.keyboard.down('Control')
  await options.nth(0).click()
  await options.nth(1).click()
  await page.waitForTimeout(150)
  check(
    'picked rows marked',
    (await page.locator('aside [role=option][aria-checked=true]').count()) === 2
  )
  check('pick hint shown', (await page.getByText(/2 Sunucu Seçildi/).count()) === 1)
  await capture('win-02-multi-pick')
  await page.keyboard.up('Control')
  await page.waitForTimeout(800)
  const afterNames = await tabNames()
  check(
    'ctrl release connects all picked',
    afterNames.length === before + 1 || afterNames.length === before + 2,
    `${optCount} sonuç, sekmeler: ${afterNames.join(' | ')}`
  )
  await page.getByRole('button', { name: 'Aramayı temizle' }).click()

  // 4) Vurgular: kural ekle, terminalde eşleşme süslenir
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-tab-strip] [role=tab][aria-selected=true]')].some((t) =>
        t.querySelector('.bg-success')
      ),
    null,
    { timeout: 20000 }
  )
  await page.waitForTimeout(1500)
  await page.keyboard.press('Control+Shift+B')
  await page.getByRole('button', { name: 'Vurgular' }).click()
  await page.getByLabel('Vurgulanacak Metin').fill('JUMPDESKHL')
  await page.getByRole('button', { name: 'Vurgu Ekle' }).click()
  check(
    'highlight rule listed',
    (await page.getByRole('switch', { name: 'JUMPDESKHL Vurgusunu Aç/Kapat' }).count()) === 1
  )
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.type('echo JUMPDESKHL ok JUMPDESKHL\n')
  await page.waitForTimeout(800)
  const decos = await page.locator('.xterm-decoration').count()
  check('matches decorated in terminal', decos >= 3, `${decos} süsleme`)
  await capture('win-03-highlight')

  // Satır sonunda bölünen eşleşme: alt satırda yalnız eşleşmenin kalan hücreleri boyanır
  await page.keyboard.type("clear; printf '%*s' $(($(tput cols)-5)) ''; echo JUMPDESKHL\n")
  await page.waitForTimeout(1000)
  const widths = await page
    .locator('.xterm-decoration')
    .evaluateAll((els) => els.map((e) => Math.round(parseFloat(e.style.width))))
  check(
    'wrapped match colors only its cells',
    widths.length === 2 && Math.abs(widths[0] - widths[1]) <= 2,
    widths.join(', ')
  )
  await page.keyboard.type('clear\n')

  // Terminal alta hizalı (artık alan üstte); geçmişte yukarıdayken "En Alta Kaydır" bandı görünür
  await page.keyboard.type('for i in $(seq 1 120); do echo satir $i; done\n')
  await page.waitForTimeout(1000)
  const gap = await page.evaluate(() => {
    const xterm = [...document.querySelectorAll('.xterm')].find((e) => e.offsetParent)
    return Math.round(
      xterm.parentElement.getBoundingClientRect().bottom - xterm.getBoundingClientRect().bottom
    )
  })
  check('no empty space below terminal rows', gap === 0, `${gap}px`)
  const band = page.getByRole('button', { name: 'En Alta Kaydır' })
  check('no scroll band at bottom', (await band.count()) === 0)
  const screenBox = await page.locator('.xterm-screen:visible').first().boundingBox()
  await page.mouse.move(screenBox.x + 100, screenBox.y + 100)
  await page.mouse.wheel(0, -600)
  await page.waitForTimeout(400)
  check('scroll band appears when scrolled up', (await band.count()) === 1)
  await capture('win-03c-scroll-band')
  await band.click()
  await page.waitForTimeout(300)
  check('band scrolls to bottom and hides', (await band.count()) === 0)
  // Hızlı çıktı sırasında komut satırının boyaması çıktının üstüne düşmez: komut metni tamponda bir kez geçer
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.press('Control+f')
  await page.getByPlaceholder('Terminalde ara').fill('seq 1 120')
  await page.waitForTimeout(500)
  const counter = await page
    .getByPlaceholder('Terminalde ara')
    .locator('xpath=..')
    .innerText()
    .catch(() => '')
  check(
    'command line painted only once',
    /(^|\D)1\/1(\D|$)/.test(counter),
    counter.replace(/\s+/g, ' ')
  )
  await page.keyboard.press('Escape')

  // Program çalışırken (komut satırı yok) Ctrl+Space öneri penceresini açmaz; istemde açar
  const suggestFooter = page.getByText('Tab / → kabul', { exact: false })
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.type('tail -f /dev/null\n')
  await page.waitForTimeout(800)
  await page.keyboard.press('Control+Space')
  await page.waitForTimeout(400)
  check('no suggestions while a program runs', (await suggestFooter.count()) === 0)
  await page.keyboard.press('Control+C')
  await page.waitForTimeout(800)
  await page.keyboard.press('Control+Space')
  await page.waitForTimeout(400)
  check('suggestions open at the prompt', (await suggestFooter.count()) === 1)
  await page.keyboard.press('Escape')
  await page.keyboard.type('clear\n')

  // 4b) İçinde "Exception" geçen uzun snippet komutunun (satıra sığmayıp kaydırılan) yankısı alarm sayılmaz
  // İkinci snippet, ilki (tail -f) hâlâ çalışırken gönderilir; yankısını tty verir.
  for (const name of ['App Server 1 Log', 'App Server 2 Log']) {
    await page.keyboard.press('Control+Shift+P')
    await page.keyboard.type(name)
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)
  }
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.press('Control+C')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Alarmlar' }).click()
  await page.waitForTimeout(400)
  const alarmRows = await page.locator('[title="Oturuma Git Ve Satırı Bul"]').allInnerTexts()
  check(
    'long snippet echo is not an alarm',
    alarmRows.length === 0,
    alarmRows.join(' / ').slice(0, 200)
  )
  await capture('win-03b-alarms-after-snippet')
  await page.keyboard.press('Control+Shift+B')

  // 5) Sağ tık → Yeni Pencerede Aç
  const popupPromise = waitForDetached()
  await page.locator('[data-tab-strip] [role=tab][aria-selected=true]').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Yeni Pencerede Aç' }).click()
  const popup = await popupPromise
  await popup.waitForSelector('[data-tab-host] .xterm', { timeout: 8000 })
  await page.waitForTimeout(800)
  check('window count after detach', (await windowCount()) === 2)
  check(
    'tab left main strip',
    !(await tabNames()).includes('jump-ops'),
    (await tabNames()).join(' | ')
  )
  check('popup shows tab chip', (await popup.getByRole('tab', { name: 'jump-ops' }).count()) === 1)
  const popupStyled = await popup.evaluate(
    () => getComputedStyle(document.querySelector('header')).height
  )
  check('popup has app styles', popupStyled === '40px', popupStyled)
  check(
    'session still connected in popup',
    (await popup.locator('[role=tab] .bg-success').count()) === 1
  )
  await popup.locator('.xterm-helper-textarea').focus()
  await popup.keyboard.type('echo JUMPDESKHL from-popup\n')
  await popup.waitForTimeout(800)
  check('decorations render in popup', (await popup.locator('.xterm-decoration').count()) >= 2)
  await capture('win-04-detached', 'jump-ops')

  // 6) Ana Pencereye Geri Al düğmesi
  await popup.getByRole('button', { name: 'Ana Pencereye Geri Al' }).click()
  check('popup closed after dock', await waitFor(async () => (await windowCount()) === 1))
  check(
    'tab back in main strip',
    (await tabNames()).includes('jump-ops'),
    (await tabNames()).join(' | ')
  )
  await page.waitForTimeout(600)
  check(
    'session survived round trip',
    (await page.locator('[data-tab-strip] [role=tab][aria-selected=true] .bg-success').count()) ===
      1
  )
  await capture('win-05-docked')

  // 7–8) Sürükleyerek pencere açma ve pencereler arası taşıma: dev/e2e/multiwindow.mjs

  // 9) Ayrı pencere sistemden kapatılınca oturum ana pencereye döner
  const popup3Promise = waitForDetached()
  await page
    .locator('[data-tab-strip] [role=tab]', { hasText: 'jump-ops' })
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Yeni Pencerede Aç' }).click()
  const popup3 = await popup3Promise
  await popup3.waitForSelector('[data-tab-host] .xterm', { timeout: 8000 })
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle().includes('jump-ops'))
      ?.close()
  })
  check('os close returns tab', await waitFor(async () => (await tabNames()).includes('jump-ops')))
  await page.waitForTimeout(500)
  check(
    'session alive after os close',
    (await page
      .locator('[data-tab-strip] [role=tab]', { hasText: 'jump-ops' })
      .locator('.bg-success')
      .count()) === 1
  )
  await capture('win-06-after-os-close')

  // 10) Grup paneli başlığında sunucu bilgi kartı; grubu ayrı pencereye taşıma ve geri alma
  await page
    .locator('[data-tab-strip] [role=tab]', { hasText: 'jump-ops' })
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Yan Yana Yerleştir' }).click()
  await page.waitForTimeout(800)
  const groupTab = page.locator('[data-tab-strip] [role=tab][aria-label^="Bölünmüş görünüm"]')
  check('group created', (await groupTab.count()) === 1, await groupTab.getAttribute('aria-label'))
  const members = ((await groupTab.getAttribute('aria-label')) ?? '')
    .split(':')[1]
    .split(',').length
  await page.locator('[data-pane-header]').first().locator('span.truncate').hover()
  await page.waitForTimeout(900)
  check(
    'pane header hover shows server card',
    (await page.getByText('Protokoller', { exact: true }).count()) === 1
  )
  await page.mouse.move(5, 500)
  await page.waitForTimeout(300)
  const firstHeader = page.locator('[data-pane-header]').first()
  const hb = await firstHeader.boundingBox()
  await page.mouse.move(hb.x + 8, hb.y + hb.height / 2)
  await page.mouse.move(hb.x + hb.width * 0.6, hb.y + hb.height / 2, { steps: 4 })
  await page.waitForTimeout(900)
  check(
    'card opens on empty part of header row',
    (await page.getByText('Protokoller', { exact: true }).count()) === 1
  )
  await firstHeader.getByRole('button', { name: 'Oturumu Kapat' }).hover()
  await page.waitForTimeout(900)
  check(
    'no card over header buttons',
    (await page.getByText('Protokoller', { exact: true }).count()) === 0
  )
  await capture('win-07-pane-hover-card')
  await page.mouse.move(600, 500)

  const groupPopupPromise = waitForDetached()
  await groupTab.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Grubu Yeni Pencerede Aç' }).click()
  const groupPopup = await groupPopupPromise
  await groupPopup.waitForSelector('[data-pane-header]', { timeout: 8000 })
  await page.waitForTimeout(800)
  check(
    'group window has all panes',
    (await groupPopup.locator('[data-pane-header]').count()) === members,
    `${members} panel`
  )
  check(
    'main strip left with new connection only',
    (await tabNames()).join('|') === 'Yeni Bağlantı',
    (await tabNames()).join(' | ')
  )
  await capture('win-08-group-window', 'JumpDesk')
  await groupPopup.locator('[data-pane-header]').nth(1).locator('span.truncate').hover()
  await groupPopup.waitForTimeout(900)
  check(
    'hover card opens inside group window',
    (await groupPopup.getByText('Protokoller', { exact: true }).count()) === 1
  )
  await groupPopup.mouse.move(5, 300)

  const lastPane = groupPopup.locator('[data-pane-header]').last()
  const lastName = (await lastPane.locator('span.truncate').innerText()).trim()
  await lastPane.click({ button: 'right' })
  await groupPopup.getByRole('menuitem', { name: 'Ana Pencereye Al' }).click()
  await page.waitForTimeout(800)
  check(
    'single pane moved to main',
    (await tabNames()).includes(lastName),
    (await tabNames()).join(' | ')
  )
  check(
    'group window keeps other panes',
    (await groupPopup.locator('[data-pane-header]').count()) === members - 1
  )

  await groupPopup.getByRole('button', { name: 'Ana Pencereye Geri Al' }).click()
  check('group window closed after dock', await waitFor(async () => (await windowCount()) === 1))
  check('group back in main strip', (await groupTab.count()) === 1, (await tabNames()).join(' | '))
  check(
    'panes visible in main after dock',
    (await page.locator('[data-pane-header]').count()) === members - 1
  )
} catch (err) {
  failed = true
  log(`FAIL: ${err.message}`)
  await capture('zz-failure').catch(() => undefined)
} finally {
  fs.writeFileSync(path.join(outDir, 'steps.txt'), steps.join('\n'))
  await app.close()
  process.exitCode = failed ? 1 : 0
}

// Sistem tepsisi: kaydedilen düzen tepsi menüsünde görünür; pencere kapatılınca uygulama tepside sürer ve oturumlar
// kapanır; tepsiden düzen seçilince pencere gösterilir ve düzen yeni sekmede açılır; macOS/Windows açılır penceresi
// (burada test kancasıyla açılır) arar, listeler ve seçileni açar; Çıkış uygulamayı kapatır. Simgeye gerçekten
// tıklanamadığı için menü ve açılır pencere `JUMPDESK_TEST_TRAY` kancasıyla sürülür (testte tepside kısa süre simge
// görünür). Kullanım: node dev/e2e/tray.mjs <klasör> (mock açıkken)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-tray')
fs.mkdirSync(out, { recursive: true })
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_NO_NOTIFY: '1',
    JUMPDESK_TEST_TRAY: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-tray-'))
  }
})
const page = await app.firstWindow()
let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const tray = (fn, arg) =>
  app.evaluate((_electron, [name, value]) => globalThis.__jumpdeskTray[name](value), [fn, arg])
const tabNames = async () =>
  (await page.locator('[data-tab-strip] [role=tab]').allInnerTexts()).map((t) => t.split('\n')[0])
const shot = async (target, name) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }, title) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      title === 'popup'
        ? w.webContents.getURL().includes('tray.html')
        : !w.webContents.getURL().includes('tray.html')
    )
    return (await win.capturePage()).toPNG().toString('base64')
  }, target)
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, 'base64'))
}

try {
  await login(app, page)
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForTimeout(2500)

  // 1. Kaydedilen düzen tepsi menüsünde
  await page.getByRole('tab', { name: 'jump-ops' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Düzeni Kaydet…' }).click()
  await page.getByPlaceholder('Düzen adı (ör. App Sunucuları)').fill('Tepsi & Düzeni')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const labels = await tray('labels')
  check(
    'saved layout appears in the tray menu',
    labels.includes('Kayıtlı Düzenler') &&
      labels.includes('Tepsi && Düzeni') &&
      labels.includes("JumpDesk'i Göster") &&
      labels.includes('Çıkış'),
    labels.join(' | ')
  )

  // 2. Pencereyi kapatmak uygulamayı kapatmaz: oturumlar kapanır, pencere gizlenir
  await page.evaluate(() => window.jumpdesk.win.close())
  await page.waitForTimeout(1200)
  const afterClose = await tabNames()
  check(
    'closing the window keeps the app in the tray and closes sessions',
    !(await tray('mainVisible')) && !afterClose.includes('jump-ops'),
    afterClose.join(' | ')
  )

  // 3. Tepsiden düzen seçilince pencere görünür ve düzen yeni sekmede açılır
  await tray('click', 'Tepsi && Düzeni')
  await page.getByRole('tab', { name: 'jump-ops' }).waitFor({ timeout: 10000 })
  check(
    'choosing a layout in the tray shows the window and opens it',
    (await tray('mainVisible')) && (await tabNames()).includes('jump-ops'),
    (await tabNames()).join(' | ')
  )

  // 4. Açılır pencere (macOS/Windows): listeler, arar, seçileni yeni sekmede açar
  await tray('openPopup')
  let shown = false
  for (let i = 0; i < 30 && !shown; i++) {
    await page.waitForTimeout(100)
    shown = await tray('popupVisible')
  }
  const popup = app.windows().find((w) => w.url().includes('tray.html'))
  check('tray popup opens', Boolean(popup) && shown)
  const row = popup.getByRole('option', { name: /Tepsi & Düzeni/ })
  check(
    'popup lists the layout with its server count',
    /Tepsi & Düzeni\s*1 sunucu/.test(await row.innerText()),
    (await row.innerText()).replace(/\s+/g, ' ')
  )
  await shot('popup', 'tray-01-popup')
  await popup.getByPlaceholder('Düzen ara').fill('yok-boyle')
  check('search with no match says so', (await popup.getByText('Eşleşen düzen yok').count()) === 1)
  await popup.getByPlaceholder('Düzen ara').fill('tepsi')
  await popup.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  const opened = (await tabNames()).filter((n) => n === 'jump-ops').length
  check(
    'choosing in the popup opens the layout in a new tab and hides the popup',
    opened === 2 && !(await tray('popupVisible')),
    `${opened} jump-ops sekmesi`
  )

  // 5. Çıkış uygulamayı kapatır
  const exited = new Promise((resolve) => app.process().once('exit', () => resolve(true)))
  await tray('click', 'Çıkış').catch(() => undefined)
  check(
    'Quit closes the app',
    await Promise.race([exited, new Promise((r) => setTimeout(() => r(false), 8000))])
  )
} catch (err) {
  failed = true
  console.log(`FAIL ${err.message.split('\n')[0]}`)
} finally {
  await app.close().catch(() => undefined)
  process.exitCode = failed ? 1 : 0
}

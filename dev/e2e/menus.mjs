// Sağ tık menüleri: simgesiz öğeler simgelilerle hizalı, "Düzeni Kaydet…" yalnız oturum sekmelerinde, klasör okunurken
// bağlanma seçenekleri gizli. Kullanım: node dev/e2e/menus.mjs <klasör>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'
const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-menu-shots')
fs.mkdirSync(out, { recursive: true })
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-menu-'))
  }
})
const shot = async (name) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, 'base64'))
}
const page = await app.firstWindow()
await login(app, page)
await page.getByRole('tree').waitFor({ timeout: 15000 })
await page.getByRole('tree').getByText('Linux', { exact: true }).click()
await page.getByRole('tree').getByText('Prod', { exact: true }).click()
await page
  .getByRole('treeitem', { name: /app-01/ })
  .first()
  .dblclick()
await page.waitForTimeout(1500)
await page.getByRole('tab', { name: 'app-01' }).click({ button: 'right' })
await page.waitForTimeout(400)
await shot('menu-tab')
const pads = await page.evaluate(() =>
  [...document.querySelectorAll('[role=menuitem]')].map(
    (m) =>
      `${m.textContent.trim()}|${getComputedStyle(m).paddingLeft}|${m.querySelector(':scope>svg') ? 'svg' : '-'}`
  )
)
console.log(pads.join('\n'))
const sessionSave = await page.getByRole('menuitem', { name: 'Düzeni Kaydet…' }).count()
await page.keyboard.press('Escape')
// Boş "Yeni Bağlantı" sekmesinde düzen kaydedilmez
await page.keyboard.press('Control+Shift+T')
await page.waitForTimeout(500)
await page
  .getByRole('tab', { name: /Yeni Bağlantı/ })
  .last()
  .click({ button: 'right' })
await page.getByRole('menu').waitFor()
const newTabSave = await page.getByRole('menuitem', { name: 'Düzeni Kaydet…' }).count()
const saveOk = sessionSave === 1 && newTabSave === 0
console.log(
  `${saveOk ? 'ok  ' : 'FAIL'} save layout only on session tabs (session ${sessionSave}, new tab ${newTabSave})`
)
if (!saveOk) process.exitCode = 1
await page.keyboard.press('Escape')

// Menü öğesinde metin simgeyle dikeyde hizalı: ekran görüntüsünde "K" harfinin ve simgenin mürekkep ortası en çok
// yarım cihaz pikseli farklı (kesirli yakınlaştırmalar dahil; 11 px arayüz yazısı = 11/13)
const inkCenters = async (name, zoom) => {
  const b = await page.getByRole('menuitem', { name }).boundingBox()
  const rect = {
    x: Math.floor(b.x * zoom),
    y: Math.floor(b.y * zoom),
    width: Math.ceil(b.width * zoom),
    height: Math.ceil(b.height * zoom)
  }
  const b64 = await app.evaluate(
    async ({ BrowserWindow }, r) =>
      (await BrowserWindow.getAllWindows()[0].capturePage(r)).toPNG().toString('base64'),
    rect
  )
  return page.evaluate(async (b64) => {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const g = new OffscreenCanvas(img.width, img.height).getContext('2d')
    g.drawImage(img, 0, 0)
    const { data, width: w, height: h } = g.getImageData(0, 0, img.width, img.height)
    const lum = (x, y) =>
      (data[(y * w + x) * 4] + data[(y * w + x) * 4 + 1] + data[(y * w + x) * 4 + 2]) / 3
    const bg = lum(1, 1)
    const ink = (x, y) => Math.max(0, bg - lum(x, y))
    const clusters = []
    let cur = null
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let y = 0; y < h; y++) sum += ink(x, y)
      if (sum <= 30) continue
      if (!cur || x - cur.e > 3) clusters.push((cur = { s: x, e: x }))
      else cur.e = x
    }
    const mid = (s, e) => {
      let top = h
      let bottom = 0
      for (let x = s; x <= e; x++)
        for (let y = 0; y < h; y++)
          if (ink(x, y) > 60) {
            top = Math.min(top, y)
            bottom = Math.max(bottom, y)
          }
      return (top + bottom) / 2
    }
    const [icon, text] = clusters
    return { icon: mid(icon.s, icon.e), text: mid(text.s, text.s + Math.round(h * 0.18)) }
  }, b64)
}
const offsets = []
for (const ui of [11, 13, 15]) {
  const zoom = ui / 13
  await page.evaluate((z) => window.jumpdesk.ui.setZoom(z), zoom)
  await page.waitForTimeout(300)
  await page.getByRole('tab', { name: 'app-01' }).click({ button: 'right' })
  await page.getByRole('menu').waitFor()
  await page.waitForTimeout(250)
  const c = await inkCenters(/^Kapat/, zoom)
  offsets.push(c.text - c.icon)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}
await page.evaluate(() => window.jumpdesk.ui.setZoom(1))
const centered = offsets.every((d) => Math.abs(d) <= 0.5)
console.log(
  `${centered ? 'ok  ' : 'FAIL'} menu text vertically centered on its icon (11/13/15 px UI: ${offsets.join(', ')} px)`
)
if (!centered) process.exitCode = 1

await page.getByRole('tree').getByText('Prod', { exact: true }).click({ button: 'right' })
await page.getByText('Klasördeki Sunucular Okunuyor…').waitFor({ timeout: 2000 })
const whileLoading = await page.getByRole('menuitem', { name: /Farklı Bağlan/ }).count()
console.log(
  `${whileLoading === 0 ? 'ok  ' : 'FAIL'} loading folder hides connect options (${whileLoading})`
)
if (whileLoading !== 0) process.exitCode = 1
await page.getByRole('menuitem', { name: /Klasördeki \d+ Sunucuya Farklı Bağlan…/ }).hover()
await page.waitForTimeout(500)
await shot('menu-folder')
await app.close()

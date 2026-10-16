// Uygulama içi güncelleme. Test kendi sahte güncelleme sunucusunu açar: latest-linux.yml + AppImage dosyası (kendini
// güncelleyebilen kurulum) ve GitHub'ın "son sürüm" yanıtı (kendini güncelleyemeyen kurulum). Kurulum adımı (dosya
// değiştirme, yeniden açma) çalıştırılmaz. Uygulama proje kökünden açılır ki sürümü package.json'dan okunsun.
// Kullanım: node dev/e2e/update.mjs <klasör> (mock açıkken)
import { _electron as electron } from 'playwright-core'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-update-shots')
fs.mkdirSync(out, { recursive: true })
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-update-'))

const NEW_VERSION = '9.9.9'
const payload = crypto.randomBytes(4 * 1024 * 1024)
const sha512 = crypto.createHash('sha512').update(payload).digest('base64')
const fileName = `JumpDesk-${NEW_VERSION}.AppImage`
const latestYml = [
  `version: ${NEW_VERSION}`,
  'files:',
  `  - url: ${fileName}`,
  `    sha512: ${sha512}`,
  `    size: ${payload.length}`,
  `path: ${fileName}`,
  `sha512: ${sha512}`,
  "releaseDate: '2026-10-16T12:00:00.000Z'",
  ''
].join('\n')

let latestTag = `v${NEW_VERSION}`
const requests = []
const server = http.createServer((req, res) => {
  requests.push(req.url)
  const url = new URL(req.url, 'http://localhost').pathname
  if (url === '/feed/latest-linux.yml') {
    res.writeHead(200, { 'content-type': 'text/yaml' })
    res.end(latestYml)
  } else if (url === `/feed/${fileName}`) {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': payload.length
    })
    res.end(payload)
  } else if (url === '/api/latest') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ tag_name: latestTag, html_url: 'https://example.com/release' }))
  } else {
    res.writeHead(404)
    res.end()
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const launch = (env) =>
  electron.launch({
    args: ['--ozone-platform=x11', '.'],
    env: {
      ...process.env,
      JUMPDESK_LANGUAGE: 'tr',
      JUMPDESK_SERVER: 'http://127.0.0.1:18080',
      JUMPDESK_HIDE_WINDOW: '1',
      JUMPDESK_OFFSCREEN: '1',
      JUMPDESK_NO_NOTIFY: '1',
      XDG_CACHE_HOME: path.join(work, 'cache'),
      ...env
    }
  })
const shotOf = (app) => async (name) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, 'base64'))
}

// 1. Kendini güncelleyebilen kurulum (AppImage): otomatik denetim, bildirim, indirme
{
  const appImage = path.join(work, 'JumpDesk-0.2.0.AppImage')
  fs.writeFileSync(appImage, 'old')
  const app = await launch({
    JUMPDESK_USER_DATA: path.join(work, 'user-a'),
    JUMPDESK_UPDATE_URL: `${base}/feed/`,
    APPIMAGE: appImage
  })
  const page = await app.firstWindow()
  const shot = shotOf(app)
  try {
    await login(app, page)
    const toast = page.getByText(`JumpDesk ${NEW_VERSION} yayımlandı`)
    await toast.waitFor({ timeout: 15000 })
    check('automatic check announces the new version', true)
    check(
      'feed was read',
      requests.some((u) => u.startsWith('/feed/latest-linux.yml'))
    )
    check(
      'settings button shows a dot',
      (await page
        .getByRole('button', { name: 'Ayarlar', exact: true })
        .locator('span.rounded-full')
        .count()) === 1
    )
    await shot('update-01-toast')
    await page.getByRole('button', { name: 'Güncelle', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('heading', { name: 'Güncellemeler' }).waitFor({ timeout: 5000 })
    check('update action opens the Updates section', true)
    await dialog.getByRole('button', { name: 'Yeniden Başlat ve Kur' }).waitFor({ timeout: 20000 })
    check(
      'download completes',
      requests.some((u) => u.startsWith(`/feed/${fileName}`))
    )
    const pending = path.join(work, 'cache', 'jumpdesk-updater', 'pending', fileName)
    check(
      'downloaded file matches',
      fs.existsSync(pending) &&
        crypto.createHash('sha512').update(fs.readFileSync(pending)).digest('base64') === sha512
    )
    check('installed file untouched', fs.readFileSync(appImage, 'utf8') === 'old')
    await shot('update-02-ready')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 5000 })
    await page.locator('button', { hasText: 'demo' }).last().click()
    await page.getByRole('menu').waitFor({ timeout: 5000 })
    check(
      'user menu offers the new version',
      (await page.getByRole('menuitem', { name: `Sürüm ${NEW_VERSION} Hazır` }).count()) === 1
    )
    await page.keyboard.press('Escape')
  } catch (err) {
    failed = true
    console.log(`FAIL: ${err.message}`)
    await shot('update-error-a').catch(() => undefined)
  } finally {
    await app.close()
  }
}

// 2. Kendini güncelleyemeyen kurulum (geliştirme sürümü): elle denetim, yayın sayfası
{
  const app = await launch({
    JUMPDESK_USER_DATA: path.join(work, 'user-b'),
    JUMPDESK_RELEASES_API: `${base}/api/latest`
  })
  const page = await app.firstWindow()
  const shot = shotOf(app)
  try {
    await login(app, page)
    await page.waitForTimeout(2000)
    check(
      'no automatic check in a development build',
      !requests.some((u) => u.startsWith('/api/latest'))
    )
    await page.keyboard.press('Control+,')
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Güncellemeler', exact: true }).click()
    check(
      'explains that this build cannot update itself',
      (await dialog.getByText(/kendini güncelleyemez/).count()) === 1
    )
    latestTag = 'v0.0.1'
    await dialog.getByRole('button', { name: 'Güncellemeleri Denetle' }).click()
    await dialog.getByText('JumpDesk güncel.').waitFor({ timeout: 10000 })
    check('older release reported as up to date', true)
    latestTag = `v${NEW_VERSION}`
    await dialog.getByRole('button', { name: 'Güncellemeleri Denetle' }).click()
    await dialog.getByText(`Yeni sürüm: ${NEW_VERSION}`).waitFor({ timeout: 10000 })
    check(
      'newer release offers the download page',
      (await dialog.getByRole('button', { name: 'İndirme Sayfasını Aç' }).count()) === 1
    )
    check(
      'release notes link points to the tag',
      (await dialog.getByRole('link', { name: 'Sürüm Notları' }).getAttribute('href')) ===
        `https://github.com/metin-aydin/JumpDesk/releases/tag/v${NEW_VERSION}`
    )
    await shot('update-03-manual')
    await dialog.getByRole('switch', { name: 'Otomatik Denetle' }).click()
    await page.waitForTimeout(500)
    const settings = JSON.parse(fs.readFileSync(path.join(work, 'user-b', 'jumpdesk.json'), 'utf8'))
    check('automatic check setting saved', settings.settings.autoUpdateCheck === false)
  } catch (err) {
    failed = true
    console.log(`FAIL: ${err.message}`)
    await shot('update-error-b').catch(() => undefined)
  } finally {
    await app.close()
  }
}

server.close()
process.exitCode = failed ? 1 : 0

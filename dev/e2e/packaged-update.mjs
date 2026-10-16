// Paketlenmiş AppImage'ın kendini güncellemesi: eski sürüm geçici klasöre kopyalanır, yeni sürümün klasörü
// (AppImage + latest-linux.yml) yerel HTTP sunucusundan verilir. Uygulama yeni sürümü bulur, indirir, kurar ve yeni
// sürümle yeniden açılır; yeniden açılan süreç sonda kapatılır.
// Kullanım: node dev/e2e/packaged-update.mjs <eski.AppImage> <yeni-sürüm-klasörü> [çıktı-klasörü] (mock açıkken)
// Örnek: npx electron-builder --linux AppImage -c.directories.output=/tmp/v2 -c.extraMetadata.version=0.2.1
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const [oldImage, newDir, outArg] = process.argv.slice(2)
if (!oldImage || !newDir) {
  console.log('Kullanım: node dev/e2e/packaged-update.mjs <eski.AppImage> <yeni-sürüm-klasörü>')
  process.exit(2)
}
const out = outArg || path.join(os.tmpdir(), 'jumpdesk-packaged-update-shots')
fs.mkdirSync(out, { recursive: true })
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-packaged-update-'))
const installed = path.join(work, path.basename(oldImage))
fs.copyFileSync(oldImage, installed)
fs.chmodSync(installed, 0o755)
const newVersion = /^version: (.+)$/m.exec(
  fs.readFileSync(path.join(newDir, 'latest-linux.yml'), 'utf8')
)[1]
const newName = `JumpDesk-${newVersion}.AppImage`

/** Yeni sürüm klasörünü verir; aralık (Range) istekleri desteklenmez, güncelleyici tam indirmeye düşer. */
const requests = []
const server = http.createServer((req, res) => {
  const name = path.basename(new URL(req.url, 'http://localhost').pathname)
  requests.push({ name, at: Date.now() })
  const file = path.join(newDir, name)
  if (!name || !fs.existsSync(file)) {
    res.writeHead(404)
    res.end()
    return
  }
  res.writeHead(200, { 'content-length': fs.statSync(file).size })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))

let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
/** Sürecin tüm alt süreçleri (yeniden açılan uygulamanın ana, GPU, ağ ve sayfa süreçleri). */
const descendants = (pid) => {
  try {
    return execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .flatMap((child) => [child, ...descendants(child)])
  } catch {
    return []
  }
}
const running = () => {
  try {
    return execFileSync('pgrep', ['-f', path.join(work, newName)], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

const app = await electron.launch({
  executablePath: installed,
  args: [],
  timeout: 60000,
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_NO_NOTIFY: '1',
    JUMPDESK_USER_DATA: path.join(work, 'user-data'),
    JUMPDESK_UPDATE_URL: `http://127.0.0.1:${server.address().port}/`,
    XDG_CACHE_HOME: path.join(work, 'cache')
  }
})
const page = await app.firstWindow()
const shot = async (name) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, 'base64'))
}
try {
  const before = await page.evaluate(() => window.jumpdesk.update.getState())
  check('old version runs as AppImage', before.installer === 'appimage', before.currentVersion)
  await login(app, page)
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Güncellemeler', exact: true }).click()
  await dialog.getByText(`Yeni sürüm: ${newVersion}`).waitFor({ timeout: 20000 })
  check('new version found', true)
  await dialog.getByRole('button', { name: 'İndir ve Kur' }).click()
  await dialog.getByRole('button', { name: 'Yeniden Başlat ve Kur' }).waitFor({ timeout: 120000 })
  check('new version downloaded', true)
  await shot('packaged-update-ready')
  const restartAt = Date.now()
  await dialog
    .getByRole('button', { name: 'Yeniden Başlat ve Kur' })
    .click()
    .catch(() => undefined)
  for (let i = 0; i < 60 && running().length === 0; i++)
    await new Promise((r) => setTimeout(r, 500))
  check(
    'old AppImage replaced',
    !fs.existsSync(installed) && fs.existsSync(path.join(work, newName))
  )
  check('new version started', running().length > 0)
  for (let i = 0; i < 60; i++) {
    if (requests.some((r) => r.name === 'latest-linux.yml' && r.at > restartAt)) break
    await new Promise((r) => setTimeout(r, 500))
  }
  check(
    'restarted app checks for updates again',
    requests.some((r) => r.name === 'latest-linux.yml' && r.at > restartAt)
  )
} catch (err) {
  failed = true
  console.log(`FAIL: ${err.message}`)
  await shot('packaged-update-error').catch(() => undefined)
} finally {
  // Yeniden açılan sürüm eski sürümün dosya tanıtıcılarını devraldığından eski AppImage kabuğu ancak yeni sürüm
  // kapanınca çıkar; bu yüzden önce yeni sürüm kapatılır.
  for (const pid of running())
    for (const p of [...descendants(pid), pid]) {
      try {
        process.kill(Number(p), 'SIGTERM')
      } catch {
        // süreç zaten kapandı
      }
    }
  await Promise.race([app.close(), new Promise((r) => setTimeout(r, 15000))]).catch(() => undefined)
  server.close()
  process.exitCode = failed ? 1 : 0
}

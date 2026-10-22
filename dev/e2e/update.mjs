// Uygulama içi güncelleme. Test kendi sahte güncelleme sunucusunu açar: latest-linux.yml + AppImage dosyası (kendini
// güncelleyebilen kurulum) ve GitHub'ın "son sürüm" yanıtı (kendini güncelleyemeyen kurulum). Kurulum adımı (dosya
// değiştirme, yeniden açma) çalıştırılmaz. Uygulama proje kökünden açılır ki sürümü package.json'dan okunsun. Ayrıca:
// no_new_privs taşıyan süreçte .deb kurulumu kullanıcının systemd yöneticisinden geçer (sahte systemd-run), kurum
// köküyle imzalı HTTPS sunucusu sistem deposundaki kökle (JUMPDESK_TEST_SYSTEM_CA) güvenilir olur, tepsiye gizlenen
// pencere yeniden açılınca güncelleme denetlenir. Kullanım: node dev/e2e/update.mjs <klasör> (mock açıkken)
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
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
const debName = `jumpdesk_${NEW_VERSION}_amd64.deb`
const debPayload = crypto.randomBytes(1024 * 1024)
const debSha512 = crypto.createHash('sha512').update(debPayload).digest('base64')
const latestYml = [
  `version: ${NEW_VERSION}`,
  'files:',
  `  - url: ${fileName}`,
  `    sha512: ${sha512}`,
  `    size: ${payload.length}`,
  `  - url: ${debName}`,
  `    sha512: ${debSha512}`,
  `    size: ${debPayload.length}`,
  `path: ${fileName}`,
  `sha512: ${sha512}`,
  "releaseDate: '2026-10-16T12:00:00.000Z'",
  ''
].join('\n')

let latestTag = `v${NEW_VERSION}`
const requests = []
const handler = (req, res) => {
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
  } else if (url === `/feed/${debName}`) {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': debPayload.length
    })
    res.end(debPayload)
  } else if (url === '/api/latest') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ tag_name: latestTag, html_url: 'https://example.com/release' }))
  } else {
    res.writeHead(404)
    res.end()
  }
}
const server = http.createServer(handler)
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

/** Kurum kökü → ara sertifika → 127.0.0.1 yaprağı (TLS denetimi yapan ağı taklit eder). */
function corporateCerts() {
  const dir = path.join(work, 'certs')
  fs.mkdirSync(dir, { recursive: true })
  const ssl = (...args) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' })
  fs.writeFileSync(
    path.join(dir, 'ca.ext'),
    'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n'
  )
  fs.writeFileSync(
    path.join(dir, 'leaf.ext'),
    'basicConstraints=CA:FALSE\nsubjectAltName=IP:127.0.0.1\n'
  )
  const make = (name, subject, ext, issuer) => {
    ssl(
      'req',
      '-new',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      `${name}.key`,
      '-subj',
      subject,
      '-out',
      `${name}.csr`
    )
    const sign = issuer
      ? ['-CA', `${issuer}.pem`, '-CAkey', `${issuer}.key`, '-CAcreateserial']
      : ['-signkey', `${name}.key`]
    ssl(
      'x509',
      '-req',
      '-in',
      `${name}.csr`,
      ...sign,
      '-days',
      '5',
      '-extfile',
      ext,
      '-out',
      `${name}.pem`
    )
  }
  make('root', '/CN=Test Corporate Root', 'ca.ext')
  make('inter', '/CN=Test Inspection CA', 'ca.ext', 'root')
  make('leaf', '/CN=127.0.0.1', 'leaf.ext', 'inter')
  const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8')
  return {
    root: path.join(dir, 'root.pem'),
    key: read('leaf.key'),
    cert: `${read('leaf.pem')}${read('inter.pem')}`
  }
}

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

// 3. .deb kurulumu: parola penceresi (sahte kurucu, 2 sn bekleyip iptal koduyla çıkar) açıkken uygulama yanıt verir;
// iptal edilince hata gösterilir ve yeniden denenebilir.
{
  const record = path.join(work, 'deb-installer.log')
  const installer = path.join(work, 'fake-pkexec.sh')
  fs.writeFileSync(installer, `#!/bin/sh\necho "$1" > "${record}"\nsleep 2\nexit 126\n`, {
    mode: 0o755
  })
  const app = await launch({
    JUMPDESK_USER_DATA: path.join(work, 'user-c'),
    JUMPDESK_UPDATE_URL: `${base}/feed/`,
    JUMPDESK_UPDATE_INSTALLER: 'deb',
    JUMPDESK_TEST_DEB_INSTALLER: installer
  })
  const page = await app.firstWindow()
  const shot = shotOf(app)
  try {
    await login(app, page)
    await page.getByText(`JumpDesk ${NEW_VERSION} yayımlandı`).waitFor({ timeout: 15000 })
    await page.getByRole('button', { name: 'Güncelle', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const install = dialog.getByRole('button', { name: 'Yeniden Başlat ve Kur' })
    await install.waitFor({ timeout: 20000 })
    check(
      'deb package downloaded',
      requests.some((u) => u.startsWith(`/feed/${debName}`))
    )
    await install.click()
    await dialog.getByText(/Kuruluyor…/).waitFor({ timeout: 3000 })
    const t0 = Date.now()
    await app.evaluate(() => 1)
    const mainLag = Date.now() - t0
    check('main process responds while the password dialog is open', mainLag < 300, `${mainLag} ms`)
    await shot('update-04-installing')
    await dialog.getByText(/Parola penceresi kapatıldı/).waitFor({ timeout: 8000 })
    check('cancelled install reports an error', true)
    check(
      'installer got the downloaded package',
      fs.existsSync(record) && fs.readFileSync(record, 'utf8').trim().endsWith('.deb')
    )
    check('install can be retried', (await install.count()) === 1)
  } catch (err) {
    failed = true
    console.log(`FAIL: ${err.message}`)
    await shot('update-error-c').catch(() => undefined)
  } finally {
    await app.close()
  }
}

// 4. no_new_privs taşıyan süreç (app.relaunch() ile açılmış): kurulum kullanıcının systemd yöneticisinden geçer ve
// pkexec'in hata nedeni gösterilir; kullanıcı yöneticisi yoksa uygulamayı yeniden açması söylenir.
{
  const runLog = path.join(work, 'systemd-run.log')
  const fakeRun = path.join(work, 'fake-systemd-run.sh')
  fs.writeFileSync(
    fakeRun,
    `#!/bin/sh\necho "$*" >> "${runLog}"\nwhile [ "$1" != "--" ]; do shift; done\nshift\nexec "$@"\n`,
    { mode: 0o755 }
  )
  const denied = path.join(work, 'fake-pkexec-denied.sh')
  fs.writeFileSync(
    denied,
    '#!/bin/sh\necho "Error executing command as another user: Not authorized" >&2\nexit 127\n',
    { mode: 0o755 }
  )
  const run = async (name, systemdRun, expected) => {
    const app = await launch({
      JUMPDESK_USER_DATA: path.join(work, `user-${name}`),
      JUMPDESK_UPDATE_URL: `${base}/feed/`,
      JUMPDESK_UPDATE_INSTALLER: 'deb',
      JUMPDESK_TEST_DEB_INSTALLER: denied,
      JUMPDESK_TEST_NO_NEW_PRIVS: '1',
      JUMPDESK_TEST_SYSTEMD_RUN: systemdRun
    })
    const page = await app.firstWindow()
    try {
      await login(app, page)
      await page.getByText(`JumpDesk ${NEW_VERSION} yayımlandı`).waitFor({ timeout: 15000 })
      await page.getByRole('button', { name: 'Güncelle', exact: true }).click()
      const dialog = page.getByRole('dialog')
      const install = dialog.getByRole('button', { name: 'Yeniden Başlat ve Kur' })
      await install.waitFor({ timeout: 20000 })
      await install.click()
      await dialog.getByText(expected).waitFor({ timeout: 10000 })
      return true
    } catch (err) {
      console.log(`FAIL: ${err.message}`)
      await shotOf(app)(`update-error-${name}`).catch(() => undefined)
      return false
    } finally {
      await app.close()
    }
  }
  const viaUser = await run(
    'nnp',
    fakeRun,
    /Yönetici yetkisi alınamadı; güncelleme kurulmadı\. \(Error executing command as another user: Not authorized\)/
  )
  check('no_new_privs install shows the reason from pkexec', viaUser)
  const logged = fs.existsSync(runLog) ? fs.readFileSync(runLog, 'utf8') : ''
  check(
    'no_new_privs install runs through the user service manager',
    /--user .*--wait --pipe .*-- .*fake-pkexec-denied\.sh .*\.deb/.test(logged),
    logged.split('\n').at(-2)
  )
  check(
    'no_new_privs without a user service manager asks to reopen the app',
    await run(
      'nnp-none',
      path.join(work, 'no-such-systemd-run'),
      /Tepsi simgesinden "Çıkış" ile kapatıp yeniden açın/
    )
  )
}

// 5. Kurum ağı (TLS denetimi): güncelleme sunucusu kurum köküyle imzalı. Kök sistem deposundaysa denetim çalışır,
// değilse Chromium'un hatası kalır.
{
  const certs = corporateCerts()
  const secure = https.createServer({ key: certs.key, cert: certs.cert }, handler)
  await new Promise((r) => secure.listen(0, '127.0.0.1', r))
  const secureBase = `https://127.0.0.1:${secure.address().port}`
  const appImage = path.join(work, 'JumpDesk-0.2.0-tls.AppImage')
  fs.writeFileSync(appImage, 'old')
  const stateAfterCheck = async (name, env) => {
    const app = await launch({
      JUMPDESK_USER_DATA: path.join(work, `user-${name}`),
      JUMPDESK_UPDATE_URL: `${secureBase}/feed/`,
      APPIMAGE: appImage,
      ...env
    })
    const page = await app.firstWindow()
    try {
      await login(app, page)
      for (let i = 0; i < 60; i++) {
        const state = await page.evaluate(() => window.jumpdesk.update.getState())
        if (state.status === 'available' || state.status === 'error') return state
        await page.waitForTimeout(250)
      }
      return null
    } finally {
      await app.close()
    }
  }
  const trusted = await stateAfterCheck('tls-trusted', { JUMPDESK_TEST_SYSTEM_CA: certs.root })
  check(
    'HTTPS feed signed by a root in the system store is trusted',
    trusted?.status === 'available' && trusted.version === NEW_VERSION,
    JSON.stringify(trusted)
  )
  const untrusted = await stateAfterCheck('tls-untrusted', {
    JUMPDESK_TEST_SYSTEM_CA: path.join(work, 'certs', 'leaf.ext')
  })
  check(
    'unknown root is still rejected',
    untrusted?.status === 'error' && /ERR_CERT_AUTHORITY_INVALID/.test(untrusted.error ?? ''),
    JSON.stringify(untrusted)
  )
  secure.close()
}

// 6. Tepsiye gizlenen pencere yeniden açılınca güncelleme yeniden denetlenir ve kurulmamış sürüm yeniden duyurulur.
{
  const appImage = path.join(work, 'JumpDesk-0.2.0-tray.AppImage')
  fs.writeFileSync(appImage, 'old')
  const app = await launch({
    JUMPDESK_USER_DATA: path.join(work, 'user-tray'),
    JUMPDESK_UPDATE_URL: `${base}/feed/`,
    APPIMAGE: appImage,
    JUMPDESK_TEST_TRAY: '1',
    JUMPDESK_TEST_REOPEN_GAP_MS: '1'
  })
  const page = await app.firstWindow()
  try {
    await login(app, page)
    const toast = page.getByText(`JumpDesk ${NEW_VERSION} yayımlandı`)
    await toast.waitFor({ timeout: 15000 })
    const feedReads = () => requests.filter((u) => u.startsWith('/feed/latest-linux.yml')).length
    const toasts = () => page.getByText(`JumpDesk ${NEW_VERSION} yayımlandı`).count()
    const before = feedReads()
    const shownBefore = await toasts()
    await page.evaluate(() => window.jumpdesk.win.close())
    await page.waitForTimeout(800)
    await app.evaluate(() => globalThis.__jumpdeskTray.click("JumpDesk'i Göster"))
    for (let i = 0; i < 40 && feedReads() === before; i++) await page.waitForTimeout(250)
    check(
      'reopening from the tray checks for updates',
      feedReads() > before,
      `${before} → ${feedReads()}`
    )
    let shownAfter = await toasts()
    for (let i = 0; i < 40 && shownAfter <= shownBefore; i++) {
      await page.waitForTimeout(250)
      shownAfter = await toasts()
    }
    check(
      'pending version is announced again after reopening',
      shownAfter > shownBefore,
      `${shownBefore} → ${shownAfter}`
    )
  } catch (err) {
    failed = true
    console.log(`FAIL: ${err.message}`)
    await shotOf(app)('update-error-tray').catch(() => undefined)
  } finally {
    await app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => undefined)
    await app.close().catch(() => undefined)
  }
}

server.close()
process.exitCode = failed ? 1 : 0

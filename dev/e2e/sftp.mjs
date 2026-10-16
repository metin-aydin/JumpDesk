// Mock koko SFTP'ye karşı dosya yöneticisini dener: sağ panel, terminali izleme, yükleme/indirme, yeniden adlandırma,
// klasör oluşturma, silme, ayrı sekme ve yetkisi kısıtlı hesap. Kullanım: node dev/e2e/sftp.mjs <çıktı-klasörü>
import { _electron as electron } from 'playwright-core'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const outDir = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-sftp-shots')
fs.mkdirSync(outDir, { recursive: true })
const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-dl-'))
const hostRoot = path.join(os.tmpdir(), 'jumpdesk-mock-hosts', 'web-01')
const steps = []
const log = (s) => {
  steps.push(s)
  console.log(s)
}

const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: process.env.JUMPDESK_SERVER || 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_DOWNLOADS: downloads,
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-sftp-'))
  }
})
const shot = async (name) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(b64, 'base64'))
  log(`screenshot: ${name}`)
}
const page = await app.firstWindow()
page.on('console', (m) => m.type() === 'error' && log(`console.error: ${m.text()}`))
const row = (name, scope = page) => scope.locator(`[role=row][data-name="${name}"]`).first()
const waitRow = (name, scope = page, timeout = 10000) => row(name, scope).waitFor({ timeout })

try {
  for (const f of ['upload-small.txt', 'upload-big.bin', 'renamed.txt', 'yeni-klasor'])
    fs.rmSync(path.join(hostRoot, 'logs', f), { recursive: true, force: true })

  await login(app, page)
  await page.getByRole('tree').waitFor({ timeout: 15000 })
  await page.getByRole('tree').getByText('Linux', { exact: true }).waitFor({ timeout: 15000 })
  await page.getByRole('tree').getByText('Linux', { exact: true }).click()
  await page.getByRole('tree').getByText('Prod', { exact: true }).waitFor({ timeout: 10000 })
  await page.getByRole('tree').getByText('Prod', { exact: true }).click()

  await page
    .getByRole('treeitem', { name: /web-01/ })
    .first()
    .dblclick()
  await page.getByRole('button', { name: /^root/ }).click()
  await page.waitForFunction(
    () => document.querySelector('[role=tab][aria-selected=true] .bg-success') !== null,
    null,
    { timeout: 15000 }
  )
  await page.waitForTimeout(1500)

  await page.keyboard.press('Control+Shift+B')
  await page.getByRole('button', { name: 'Dosyalar' }).click()
  const panel = page.locator('[data-files-variant=panel]')
  await waitRow('notes.txt', panel)
  log(
    `panel rows: ${await panel.locator('[role=row]').count()} (hidden filtered: ${(await panel.locator('[role=row][data-name=".bashrc"]').count()) === 0})`
  )
  await shot('sftp-01-panel')

  log(
    `no follow toggle: ${(await panel.getByRole('button', { name: 'Terminali İzle' }).count()) === 0}`
  )
  await row('logs', panel).dblclick()
  await waitRow('app.log', panel)
  log('open logs by double click: ok')

  const small = path.join(os.tmpdir(), 'upload-small.txt')
  fs.writeFileSync(small, 'merhaba sftp\n'.repeat(1000))
  const big = path.join(os.tmpdir(), 'upload-big.bin')
  fs.writeFileSync(big, crypto.randomBytes(12 * 1024 * 1024))
  await panel.locator('input[type=file]').setInputFiles([small, big])
  await waitRow('upload-big.bin', panel, 30000)
  await page.waitForTimeout(500)
  const sameSmall = fs
    .readFileSync(path.join(hostRoot, 'logs', 'upload-small.txt'))
    .equals(fs.readFileSync(small))
  const sameBig = fs
    .readFileSync(path.join(hostRoot, 'logs', 'upload-big.bin'))
    .equals(fs.readFileSync(big))
  log(`upload small identical: ${sameSmall}, big (multi-chunk) identical: ${sameBig}`)
  await shot('sftp-02-uploaded')

  await row('upload-big.bin', panel).dblclick()
  await page.getByText('upload-big.bin indirildi').waitFor({ timeout: 30000 })
  const dl = path.join(downloads, 'upload-big.bin')
  log(
    `download identical: ${fs.existsSync(dl) && fs.readFileSync(dl).equals(fs.readFileSync(big))}`
  )
  await shot('sftp-03-downloaded')

  await row('upload-small.txt', panel).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Yeniden Adlandır' }).click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('renamed.txt\n')
  await waitRow('renamed.txt', panel)
  log(`rename: ${fs.existsSync(path.join(hostRoot, 'logs', 'renamed.txt'))}`)

  await panel.getByRole('button', { name: 'Yeni Klasör' }).click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type('yeni-klasor\n')
  await waitRow('yeni-klasor', panel)
  log(`mkdir: ${fs.statSync(path.join(hostRoot, 'logs', 'yeni-klasor')).isDirectory()}`)

  await row('renamed.txt', panel).click()
  await row('upload-big.bin', panel).click({ modifiers: ['Control'] })
  await row('upload-big.bin', panel).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '2 Öğeyi Sil' }).click()
  await shot('sftp-04-confirm-delete')
  await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click()
  await row('renamed.txt', panel).waitFor({ state: 'detached', timeout: 10000 })
  log(
    `delete 2 items: ${!fs.existsSync(path.join(hostRoot, 'logs', 'renamed.txt')) && !fs.existsSync(path.join(hostRoot, 'logs', 'upload-big.bin'))}`
  )

  await row('yeni-klasor', panel).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Terminalde Bu Klasöre Geç' }).click()
  await page.waitForTimeout(1500)
  const history = fs.readFileSync(path.join(hostRoot, '.bash_history'), 'utf8')
  log(
    `terminal cd sent: ${history.includes("cd '" + path.join(hostRoot, 'logs', 'yeni-klasor') + "'")}`
  )
  await shot('sftp-05-cd')

  await panel.getByRole('button', { name: 'Ayrı Sekmede Aç' }).click()
  const main = page.locator('[data-files-variant=tab]').last()
  await main.getByText('Değiştirilme').waitFor({ timeout: 10000 })
  await main.getByRole('button', { name: 'Üst Klasör' }).click()
  await page.waitForTimeout(800)
  log(
    `files tab rows: ${await main.locator('[role=row]').count()}, tabs: ${(await page.getByRole('tab').allInnerTexts()).map((t) => t.split('\n')[0]).join(' | ')}`
  )
  await shot('sftp-06-tab')

  await page
    .getByRole('treeitem', { name: /web-02/ })
    .first()
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Dosya Yöneticisi' }).click()
  await page.getByText('Dosya yöneticisi için hesap seçin').waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: /^deploy/ }).click()
  const restricted = page.locator('[data-files-variant=tab]').last()
  await waitRow('notes.txt', restricted)
  log(
    `restricted upload disabled: ${await restricted.getByRole('button', { name: 'Dosya Yükleme Yetkiniz Yok' }).isDisabled()}`
  )
  await shot('sftp-07-restricted')
} catch (err) {
  log(`FAIL: ${err.message}`)
  await shot('zz-failure').catch(() => undefined)
  process.exitCode = 1
} finally {
  fs.writeFileSync(path.join(outDir, 'steps.txt'), steps.join('\n'))
  await app.close()
}

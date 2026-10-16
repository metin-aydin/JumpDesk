// Sunucu adresi ekranı, snippet düzenleyici, şifreli dışa/içe aktarma, kullanıcıya özel kayıtlar ve eski kayıtların
// ilk kullanıcıya taşınması. Kullanım: node dev/e2e/transfer.mjs <klasör> (mock açıkken)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  decodeExportFile,
  FIXTURE_SNIPPETS,
  login,
  runPalette,
  stubFileDialogs,
  writeExportFile
} from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-transfer-shots')
fs.mkdirSync(out, { recursive: true })
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-transfer-files-'))
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_NO_NOTIFY: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-transfer-'))
  }
})
const shot = async (name) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, 'base64'))
}
const page = await app.firstWindow()
let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const palette = (text) => runPalette(page, text)
const rightPanel = async (tab) => {
  if (
    !(await page
      .getByRole('button', { name: tab, exact: true })
      .isVisible()
      .catch(() => false))
  )
    await page.keyboard.press('Control+Shift+B')
  await page.getByRole('button', { name: tab, exact: true }).click()
  await page.waitForTimeout(250)
}
const logout = async (user) => {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: new RegExp(user) }).click()
  await page.getByText('Çıkış Yap').click()
  await page.getByLabel('Sunucu Adresi').waitFor({ timeout: 10000 })
}
const panelSnippetNames = () =>
  page
    .locator('[role=region][aria-label="Sağ Panel"] [role=button] .truncate.text-\\[13px\\]')
    .allInnerTexts()
const toastText = async () =>
  (await page.locator('[data-sonner-toast]').allInnerTexts()).join(' / ')
/** `action` sonrası metni içeren yeni bir bildirim (toast) belirene kadar bekler. */
const expectToast = async (text, action) => {
  const count = () =>
    page.evaluate(
      (t) =>
        [...document.querySelectorAll('[data-sonner-toast]')].filter((el) =>
          el.innerText.includes(t)
        ).length,
      text
    )
  const before = await count()
  await action()
  for (let i = 0; i < 50 && (await count()) <= before; i++) await page.waitForTimeout(100)
  return (await count()) > before
}

try {
  // Eski (kullanıcısız) kayıt: ilk giriş yapan kullanıcıya taşınır.
  await page.getByLabel('Sunucu Adresi').waitFor({ timeout: 15000 })
  await page.evaluate(() =>
    localStorage.setItem(
      'jumpdesk.highlightRules',
      JSON.stringify([
        {
          id: 'legacy',
          pattern: 'LEGACYHL',
          regex: false,
          caseSensitive: false,
          enabled: true,
          fg: '#ff0000',
          bg: null
        }
      ])
    )
  )

  // 1) Adres ekranı: iki logo, hatalı adreste ileti
  check(
    'server screen shows both logos',
    (await page.getByText('JumpDesk', { exact: true }).count()) === 1 &&
      (await page.getByText('JumpServer', { exact: true }).count()) === 1
  )
  check(
    'address prefilled from last server',
    (await page.getByLabel('Sunucu Adresi').inputValue()) === 'http://127.0.0.1:18080'
  )
  // Şema yazılmazsa https kabul edilir; mock http olduğundan ulaşılamaz.
  await page.getByLabel('Sunucu Adresi').fill('127.0.0.1:18080')
  await page.getByRole('button', { name: 'Devam' }).click()
  await page.getByText(/ulaşılamadı/).waitFor({ timeout: 12000 })
  const error = await page.getByText(/ulaşılamadı/).innerText()
  check(
    'unreachable server shows error (https assumed)',
    error.includes('https://127.0.0.1:18080'),
    error
  )
  await shot('transfer-01-server-error')
  await login(app, page, { server: 'http://127.0.0.1:18080' })
  check('login after host screen', true)

  // 2) Eski kayıt ilk kullanıcıya taşındı
  await rightPanel('Vurgular')
  check(
    'legacy highlight adopted by first user',
    (await page.getByRole('switch', { name: 'LEGACYHL Vurgusunu Aç/Kapat' }).count()) === 1
  )
  check(
    'legacy key removed',
    (await page.evaluate(() => localStorage.getItem('jumpdesk.highlightRules'))) === null
  )

  // 3) Snippet düzenleyici
  await rightPanel('Snippetler')
  check('snippets start empty', (await page.getByText('Henüz snippet yok').count()) === 1)
  await page.getByRole('button', { name: /^Snippetler\s*\d+ Snippet$/ }).click()
  const editor = page.getByRole('dialog', { name: 'Snippetler' })
  await editor.waitFor({ timeout: 5000 })
  await editor.getByLabel('Ad').fill('Disk Durumu')
  await editor.getByLabel('Grup').fill('Sistem')
  await editor.getByLabel('Komut').fill('df -h')
  await editor.getByRole('button', { name: 'Ekle' }).click()
  await page.waitForTimeout(200)
  await editor.getByLabel('Komut').fill('df -h /')
  await editor.getByRole('button', { name: 'Kaydet' }).click()
  await editor.getByRole('button', { name: 'Yeni Snippet' }).click()
  await editor.getByLabel('Ad').fill('Bellek')
  await editor.getByLabel('Komut').fill('free -m')
  await editor.getByRole('button', { name: 'Ekle' }).click()
  await page.waitForTimeout(200)
  await shot('transfer-02-editor')
  await editor.getByRole('button', { name: 'Sil' }).click()
  await page
    .getByRole('dialog', { name: /Silinsin Mi/ })
    .getByRole('button', { name: 'Sil' })
    .click()
  await page.waitForTimeout(200)
  check('editor footer counts', (await editor.getByText('1 snippet · 1 grup').count()) === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Sistem' }).click()
  const listed = await panelSnippetNames()
  check('panel lists edited snippet', listed.join('|') === 'Disk Durumu', listed.join('|'))
  check(
    'panel shows saved command',
    (await page.getByText('df -h /', { exact: true }).count()) >= 1
  )

  // 4) Snippet panelinde sağ tık → Dışa Aktar: yalnız Snippetler seçili
  const snippetFile = path.join(work, 'snippets-only.jumpdesk')
  await stubFileDialogs(app, { save: snippetFile })
  await page.getByText('Disk Durumu', { exact: true }).click({ button: 'right' })
  check(
    'row context menu offers editing',
    (await page.getByRole('menuitem', { name: '“Disk Durumu” Snippetini Düzenle' }).count()) === 1
  )
  await page.getByRole('menuitem', { name: 'Dışa Aktar…' }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Dışa Aktar' })
  await exportDialog.waitFor({ timeout: 5000 })
  const checkedCards = async (dlg) =>
    dlg
      .locator('[role=checkbox][aria-checked=true]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  check(
    'only snippets preselected',
    (await checkedCards(exportDialog)).join('|') === 'Snippetler',
    (await checkedCards(exportDialog)).join('|')
  )
  await shot('transfer-03-export-snippets')
  check(
    'export toast',
    await expectToast('Dışa aktarıldı', () =>
      exportDialog.getByRole('button', { name: /^Dışa Aktar \(1 Bölüm\)/ }).click()
    )
  )
  const suggested = await app.evaluate(() => globalThis.__jumpdeskSaveDefault)
  check(
    'default file name is user + timestamp',
    /[\\/]demo_\d{14}\.jumpdesk$/.test(suggested ?? ''),
    suggested
  )
  const decoded = decodeExportFile(snippetFile)
  check(
    'exported file decrypts with snippets only',
    decoded.ok &&
      Object.keys(decoded.payload.sections).join('|') === 'snippets' &&
      decoded.payload.sections.snippets[0].command === 'df -h /',
    JSON.stringify(decoded.ok ? Object.keys(decoded.payload.sections) : decoded.error)
  )
  check('exported file is not plain text', !fs.readFileSync(snippetFile).includes('df -h'))

  // 5) Tümünü dışa aktar (komut paleti): sayılar ve boş bölüm
  const allFile = path.join(work, 'all.jumpdesk')
  await stubFileDialogs(app, { save: allFile })
  await palette('Dışa Aktar')
  await exportDialog.waitFor({ timeout: 5000 })
  const cardText = async (dlg, label) => dlg.getByRole('checkbox', { name: label }).innerText()
  check(
    'snippet card counts',
    /1\s*snippet[\s\S]*1 grup/.test(await cardText(exportDialog, 'Snippetler')),
    await cardText(exportDialog, 'Snippetler')
  )
  check(
    'alarm card counts',
    /2\s*kural[\s\S]*2 aktif/.test(await cardText(exportDialog, 'Alarm Kuralları'))
  )
  check(
    'empty layouts card disabled',
    await exportDialog.getByRole('checkbox', { name: 'Düzen Kayıtları' }).isDisabled()
  )
  await shot('transfer-04-export-all')
  check(
    'export all toast',
    await expectToast('Dışa aktarıldı', () =>
      exportDialog.getByRole('button', { name: /^Dışa Aktar \(4 Bölüm\)/ }).click()
    )
  )
  const all = decodeExportFile(allFile)
  check(
    'full export has four sections',
    all.ok &&
      Object.keys(all.payload.sections).sort().join('|') === 'alarms|highlights|settings|snippets'
  )

  // 6) Geçersiz ve değiştirilmiş dosyalar reddedilir
  const junk = path.join(work, 'junk.jumpdesk')
  fs.writeFileSync(junk, 'merhaba dünya')
  await stubFileDialogs(app, { open: junk })
  check(
    'non-JumpDesk file rejected',
    await expectToast('JumpDesk dışa aktarım dosyası değil', () => palette('İçe Aktar'))
  )
  const tampered = path.join(work, 'tampered.jumpdesk')
  const bytes = fs.readFileSync(allFile)
  bytes[bytes.length - 30] ^= 0xff
  fs.writeFileSync(tampered, bytes)
  await stubFileDialogs(app, { open: tampered })
  check(
    'tampered file rejected',
    await expectToast('bozuk ya da değiştirilmiş', () => palette('İçe Aktar'))
  )

  // 7) Alarmlar panelinde sağ tık → İçe Aktar: yalnız Alarm Kuralları seçili gelir; uyarı ve mevcut sayılar görünür
  const importFile = writeExportFile(work, {
    snippets: FIXTURE_SNIPPETS,
    alarms: [
      { id: 'imp-1', pattern: 'IMPORTEDRULE', regex: false, caseSensitive: true, enabled: true }
    ],
    highlights: [],
    layouts: [
      {
        id: 'l1',
        name: 'Gece Nöbeti',
        createdAt: 1,
        items: [{ type: 'tab', asset: { id: 'x', name: 'jump-ops' } }]
      }
    ],
    settings: {
      fontSizes: { ui: 13, tree: 15, terminal: 14 },
      terminal: {
        autocomplete: true,
        commandHighlight: true,
        outputHighlight: true,
        dimInactivePanes: false
      },
      notifications: { alarmDesktop: false, connectWaitSec: 30, snippetWaitSec: 5 },
      theme: 'dark'
    }
  })
  await stubFileDialogs(app, { open: importFile })
  await rightPanel('Alarmlar')
  await page
    .locator('[role=region][aria-label="Sağ Panel"]')
    .getByText(/Henüz alarm yok/)
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'İçe Aktar…' }).click()
  const importDialog = page.getByRole('dialog', { name: 'İçe Aktar' })
  await importDialog.waitFor({ timeout: 5000 })
  check(
    'only alarms preselected',
    (await checkedCards(importDialog)).join('|') === 'Alarm Kuralları',
    (await checkedCards(importDialog)).join('|')
  )
  check('reset warning shown', (await importDialog.getByText(/mevcut kayıtlarınız/).count()) === 1)
  check(
    'existing count shown',
    (await importDialog.getByText('Mevcut 2 kural silinir').count()) === 1
  )
  await importDialog.getByRole('checkbox', { name: 'Snippetler' }).click()
  await importDialog.getByRole('checkbox', { name: 'Uygulama Ayarları' }).click()
  await importDialog.getByRole('checkbox', { name: 'Düzen Kayıtları' }).click()
  await shot('transfer-05-import')
  await importDialog.getByRole('button', { name: /^İçe Aktar \(4 Bölüm\)/ }).click()
  await importDialog.waitFor({ state: 'hidden', timeout: 5000 })
  check(
    'alarm rules replaced',
    (await page.getByRole('button', { name: /Kurallar/ }).innerText()).includes('1 Aktif')
  )
  await rightPanel('Snippetler')
  check(
    'snippets replaced',
    (await page.getByText(`${FIXTURE_SNIPPETS.length} Snippet`).count()) === 1
  )
  check('old snippet gone', (await page.getByText('Disk Durumu', { exact: true }).count()) === 0)
  check(
    'settings applied (dark theme)',
    await page.evaluate(() => document.documentElement.classList.contains('dark'))
  )
  await page.keyboard.press('Control+,')
  await page.getByRole('button', { name: 'Bildirimler' }).click()
  check(
    'settings nav marks Bildirimler',
    (await page.getByRole('button', { name: 'Bildirimler' }).getAttribute('aria-current')) ===
      'page' &&
      (await page.getByRole('button', { name: 'Yazı Boyutu' }).getAttribute('aria-current')) ===
        null
  )
  check(
    'notification settings imported',
    (await page.getByLabel('Bağlantıdan Sonra Bekleme (Saniye)').inputValue()) === '30' &&
      (await page
        .getByRole('switch', { name: 'Alarm Bildirimleri' })
        .getAttribute('aria-checked')) === 'false'
  )
  await shot('transfer-06-notifications')
  await page.keyboard.press('Escape')
  check('layouts imported', (await page.getByText('Gece Nöbeti').count()) >= 1)

  // 8) Kullanıcıya özel kayıtlar: başka kullanıcı görmez, geri gelen kullanıcı kendininkini bulur
  await logout('demo')
  await login(app, page, { user: 'ayse' })
  await rightPanel('Snippetler')
  check('other user sees no snippets', (await page.getByText('Henüz snippet yok').count()) === 1)
  check(
    'other user has default (system) theme',
    (await page.evaluate(() => window.jumpdesk.theme.get())).preference === 'system'
  )
  await rightPanel('Vurgular')
  check(
    'other user has no highlights',
    (await page.getByRole('switch', { name: /Vurgusunu Aç\/Kapat/ }).count()) === 0
  )
  await rightPanel('Alarmlar')
  check(
    'other user has default alarm rules',
    (await page.getByRole('button', { name: /Kurallar/ }).innerText()).includes('2 Aktif')
  )
  await logout('ayse')
  await login(app, page, { user: 'demo' })
  await rightPanel('Snippetler')
  check(
    'first user gets snippets back',
    (await page.getByText(`${FIXTURE_SNIPPETS.length} Snippet`).count()) === 1
  )
  check(
    'first user gets theme back',
    (await page.evaluate(() => window.jumpdesk.theme.get())).preference === 'dark'
  )
} catch (err) {
  failed = true
  console.log(`FAIL: ${err.message}`)
  await shot('transfer-error').catch(() => undefined)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

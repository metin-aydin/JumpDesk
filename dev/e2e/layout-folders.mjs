// Düzen klasörleri: kaydederken klasör seçme/oluşturma, "Yeni Klasör", sürükle-bırak ve sağ tıkla klasöre taşıma,
// klasörü yeniden adlandırma (aynı ad reddedilir), açma/kapama, silme (düzenler klasör dışına çıkar), komut paletinde
// "Klasör / Düzen" adı; sistem tepsisinde klasörler alt menü (GNOME) ve açılır pencerede açılır satır (macOS/Windows);
// sol ağaçtaki "Kayıtlı Düzenler" düğümü (sürükle-bırak, yeni klasör, çift tıkla açma); dışa ve içe aktarımda klasörler.
// Tepsi `JUMPDESK_TEST_TRAY` kancasıyla sürülür (testte tepside kısa süre simge görünür).
// Kullanım: node dev/e2e/layout-folders.mjs <klasör> (mock açıkken)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  decodeExportFile,
  importFile,
  login,
  runPalette,
  stubFileDialogs,
  writeExportFile
} from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-layout-folders')
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
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-layout-folders-'))
  }
})
const page = await app.firstWindow()
let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const shot = async (name, target = 'main') => {
  const b64 = await app.evaluate(async ({ BrowserWindow }, t) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      t === 'popup'
        ? w.webContents.getURL().includes('tray.html')
        : !w.webContents.getURL().includes('tray.html')
    )
    return (await win.capturePage()).toPNG().toString('base64')
  }, target)
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, 'base64'))
}
const tray = (fn, arg) =>
  app.evaluate((_electron, [name, value]) => globalThis.__jumpdeskTray[name](value), [fn, arg])
const tabNames = async () =>
  (await page.locator('[data-tab-strip] [role=tab]').allInnerTexts()).map((t) => t.split('\n')[0])
/** "Kayıtlı Düzenler" bölümü: klasör adı → içindeki düzen kartları ('' klasörsüz). */
const homeFolders = () =>
  page.evaluate(() => {
    const out = {}
    for (const el of document.querySelectorAll('[data-layout-folder]')) {
      if (el.getBoundingClientRect().width === 0) continue
      out[el.getAttribute('data-layout-folder')] = [
        ...el.querySelectorAll('[data-layout-card]')
      ].map((c) => c.querySelector('.font-medium').textContent)
    }
    return out
  })
const card = (name) =>
  page.locator('[data-layout-card]:visible').filter({ has: page.getByText(name, { exact: true }) })
const folderHeader = (name) =>
  page.locator(`[data-layout-folder="${name}"]:visible > button`).first()
const saveLayout = async (name, folder, newFolder) => {
  await page.getByRole('tab', { name: 'jump-ops' }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Düzeni Kaydet…' }).click()
  await page.getByPlaceholder('Düzen adı (ör. App Sunucuları)').fill(name)
  if (folder) {
    await page.getByRole('combobox', { name: 'Klasör' }).click()
    await page.getByRole('option', { name: folder, exact: true }).click()
    if (newFolder) await page.getByRole('textbox', { name: 'Yeni Klasörün Adı' }).fill(newFolder)
  }
  await page.getByRole('dialog').getByRole('button', { name: 'Kaydet' }).click()
  await page.waitForTimeout(400)
}
const openHome = async () => {
  await page.keyboard.press('Control+Shift+T')
  await page.waitForTimeout(500)
}

try {
  await login(app, page)
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForTimeout(2500)

  // 1. Kaydederken yeni klasör oluşturulur, düzen içine girer; ikinci düzen klasörsüz kaydedilir
  await saveLayout('Tek', 'Yeni Klasör…', 'Üretim')
  await saveLayout('İkinci')
  await openHome()
  let state = await homeFolders()
  check(
    'saving into a new folder files the layout there',
    JSON.stringify(state) === JSON.stringify({ Üretim: ['Tek'], '': ['İkinci'] }),
    JSON.stringify(state)
  )

  // 2. "Yeni Klasör" boş klasör oluşturur
  await page.getByRole('button', { name: 'Yeni Klasör' }).click()
  await page.getByPlaceholder('Klasör adı (ör. Üretim)').fill('Test')
  await page.getByRole('dialog').getByRole('button', { name: 'Oluştur' }).click()
  await page.waitForTimeout(300)
  state = await homeFolders()
  check(
    'New Folder creates an empty folder',
    JSON.stringify(state.Test) === '[]' &&
      (await page.getByText('Klasör boş.', { exact: false }).count()) === 1,
    JSON.stringify(state)
  )
  await shot('folders-01-home')

  // 3. Sürükle-bırak klasöre taşır
  await card('İkinci').dragTo(folderHeader('Test'))
  await page.waitForTimeout(300)
  state = await homeFolders()
  check(
    'dragging a card onto a folder moves it',
    JSON.stringify(state.Test) === '["İkinci"]',
    JSON.stringify(state)
  )

  // 4. Sağ tık → Klasöre Taşı
  await card('Tek').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Klasöre Taşı' }).click()
  await page.getByRole('menuitem', { name: 'Test', exact: true }).click()
  await page.waitForTimeout(300)
  state = await homeFolders()
  check(
    'Move to Folder submenu moves the layout',
    JSON.stringify(state.Test) === '["Tek","İkinci"]' && JSON.stringify(state.Üretim) === '[]',
    JSON.stringify(state)
  )

  // 5. Klasörü yeniden adlandır: var olan ad reddedilir, yeni ad düzenlere de geçer
  await folderHeader('Test').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Klasörü Yeniden Adlandır' }).click()
  const input = page.getByPlaceholder('Klasör adı (ör. Üretim)')
  await input.fill('üretim')
  await page.getByRole('dialog').getByRole('button', { name: 'Yeniden Adlandır' }).click()
  await page.waitForTimeout(200)
  check(
    'renaming to an existing folder name is refused',
    (await page.getByText('Bu adda bir klasör var.').count()) === 1
  )
  await input.fill('Hazırlık')
  await page.getByRole('dialog').getByRole('button', { name: 'Yeniden Adlandır' }).click()
  await page.waitForTimeout(300)
  state = await homeFolders()
  check(
    'renaming a folder keeps its layouts',
    JSON.stringify(state.Hazırlık) === '["Tek","İkinci"]' && !('Test' in state),
    JSON.stringify(state)
  )

  // 6. Klasör kapanır/açılır
  await folderHeader('Hazırlık').click()
  await page.waitForTimeout(200)
  const closedCount = await card('Tek').count()
  await folderHeader('Hazırlık').click()
  await page.waitForTimeout(200)
  check(
    'clicking a folder header collapses and expands it',
    closedCount === 0 && (await card('Tek').count()) === 1
  )

  // 7. Tepsi menüsü (GNOME): klasörler alt menü, boş klasör pasif satır, alt menüden düzen açılır
  const top = await tray('labels')
  const sub = await tray('labels', 'Hazırlık')
  const empty = await tray('labels', 'Üretim')
  check(
    'tray menu shows folders as submenus',
    top.includes('Üretim ▸') &&
      top.includes('Hazırlık ▸') &&
      !top.includes('Tek') &&
      JSON.stringify(sub) === '["Tek","İkinci"]' &&
      JSON.stringify(empty) === '["Klasörde düzen yok"]',
    `${top.join(' | ')} / ${sub.join(' | ')} / ${empty.join(' | ')}`
  )
  const before = (await tabNames()).filter((n) => n === 'jump-ops').length
  await tray('click', 'Hazırlık/Tek')
  await page.waitForTimeout(1500)
  check(
    'choosing a layout in a tray submenu opens it',
    (await tabNames()).filter((n) => n === 'jump-ops').length === before + 1
  )

  // 8. Tepsi açılır penceresi (macOS/Windows): klasör satırı açılır, aramada "Klasör › Düzen"
  await tray('openPopup')
  let shown = false
  for (let i = 0; i < 30 && !shown; i++) {
    await page.waitForTimeout(100)
    shown = await tray('popupVisible')
  }
  const popup = app.windows().find((w) => w.url().includes('tray.html'))
  const options = () => popup.getByRole('option').allInnerTexts()
  const collapsed = (await options()).map((o) => o.replace(/\s+/g, ' ').trim())
  check(
    'tray popup lists folders collapsed',
    JSON.stringify(collapsed) === '["Üretim 0","Hazırlık 2"]',
    JSON.stringify(collapsed)
  )
  await popup.getByRole('option', { name: /Hazırlık/ }).click()
  await page.waitForTimeout(200)
  const expanded = (await options()).map((o) => o.replace(/\s+/g, ' ').trim())
  check(
    'clicking a folder in the popup expands it',
    expanded.length === 4 && expanded[2].startsWith('Tek') && expanded[3].startsWith('İkinci'),
    JSON.stringify(expanded)
  )
  await shot('folders-02-popup', 'popup')
  await popup.getByPlaceholder('Düzen ara').fill('tek')
  await page.waitForTimeout(200)
  const found = (await options()).map((o) => o.replace(/\s+/g, ' ').trim())
  check(
    'popup search shows the folder with the layout',
    found.length === 1 && found[0].startsWith('Hazırlık › Tek'),
    JSON.stringify(found)
  )
  await popup.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // 9. Komut paletinde "Klasör / Düzen"
  const beforePalette = (await tabNames()).filter((n) => n === 'jump-ops').length
  await runPalette(page, 'Düzeni Aç: Hazırlık / İkinci')
  await page.waitForTimeout(1500)
  check(
    'command palette opens a layout by its folder path',
    (await tabNames()).filter((n) => n === 'jump-ops').length === beforePalette + 1
  )

  // 10. Klasörü silmek düzenleri klasör dışına çıkarır
  await openHome()
  await folderHeader('Hazırlık').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Klasörü Sil' }).click()
  await page.waitForTimeout(300)
  state = await homeFolders()
  check(
    'deleting a folder keeps its layouts outside any folder',
    JSON.stringify(state) === JSON.stringify({ Üretim: [], '': ['Tek', 'İkinci'] }),
    JSON.stringify(state)
  )

  // 11. Klasör başlıkları bölüm başlığı ve klasörsüz kartlarla aynı sol hizada
  const align = await page.evaluate(() => {
    const left = (el) => el?.getBoundingClientRect().left ?? null
    const section = [...document.querySelectorAll('section')].find((s) =>
      s.querySelector('[data-layout-folder]')
    )
    return {
      title: left(section.querySelector('h3 svg')),
      folder: left(section.querySelector('[data-layout-folder="Üretim"] > button svg')),
      card: left(section.querySelector('[data-layout-folder=""] [data-layout-card]'))
    }
  })
  check(
    'folder headers align with the section title and loose cards',
    Math.abs(align.title - align.folder) < 1 && Math.abs(align.card - align.folder) < 1,
    JSON.stringify(align)
  )

  // 12. Sol ağaçta "Kayıtlı Düzenler": klasöre sürükle, köke bırak, yeni klasör, çift tıkla aç
  const treeRoot = page.locator('[data-layout-tree] > div > [role=button]')
  await treeRoot.click()
  await page.waitForTimeout(200)
  const treeRow = (name) => page.locator(`[data-layout-tree] [data-layout-row]`, { hasText: name })
  const treeFolder = (name) => page.locator(`[data-layout-tree-folder="${name}"] > button`)
  check(
    'left tree lists folders and layouts',
    (await treeFolder('Üretim').count()) === 1 &&
      (await treeRow('Tek').count()) === 1 &&
      (await treeRow('İkinci').count()) === 1
  )
  await treeRow('Tek').dragTo(treeFolder('Üretim'))
  await page.waitForTimeout(300)
  state = await homeFolders()
  check(
    'dragging a tree row onto a tree folder moves the layout',
    JSON.stringify(state.Üretim) === '["Tek"]',
    JSON.stringify(state)
  )
  await treeFolder('Üretim').click()
  await page.waitForTimeout(200)
  const nested = await page.evaluate(() => {
    const row = [...document.querySelectorAll('[data-layout-tree] [data-layout-row]')].find((r) =>
      r.textContent.includes('Tek')
    )
    return row ? parseFloat(row.style.paddingLeft) : null
  })
  check('layouts inside a tree folder are indented', nested === 6 + 2 * 14, String(nested))
  await treeRow('Tek').dragTo(treeRoot)
  await page.waitForTimeout(300)
  state = await homeFolders()
  check(
    'dropping on the tree root takes the layout out of its folder',
    JSON.stringify(state.Üretim) === '[]' && state[''].includes('Tek'),
    JSON.stringify(state)
  )
  await treeRoot.hover()
  await page
    .locator('[data-layout-tree]')
    .getByRole('button', { name: 'Yeni Klasör', exact: true })
    .click()
  await page.getByPlaceholder('Klasör adı (ör. Üretim)').fill('Ağaç')
  await page.getByRole('dialog').getByRole('button', { name: 'Oluştur' }).click()
  await page.waitForTimeout(300)
  check(
    'tree root button creates a folder',
    (await treeFolder('Ağaç').count()) === 1 && 'Ağaç' in (await homeFolders())
  )
  await treeRow('İkinci').dragTo(treeFolder('Ağaç'))
  await page.waitForTimeout(300)
  await shot('folders-03-tree')
  const beforeTree = (await tabNames()).filter((n) => n === 'jump-ops').length
  await treeFolder('Ağaç').click()
  await page.waitForTimeout(200)
  await treeRow('İkinci').dblclick()
  await page.waitForTimeout(1500)
  check(
    'double-clicking a tree layout opens it',
    (await tabNames()).filter((n) => n === 'jump-ops').length === beforeTree + 1
  )

  // 13. Dışa aktarımda klasörler ve düzenlerin klasörü yer alır
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-layout-folders-files-'))
  const exported = path.join(work, 'layouts.jumpdesk')
  await stubFileDialogs(app, { save: exported })
  await runPalette(page, 'Dışa Aktar')
  const exportDialog = page.getByRole('dialog', { name: 'Dışa Aktar' })
  await exportDialog.waitFor({ timeout: 5000 })
  const layoutsCard = await exportDialog
    .getByRole('checkbox', { name: 'Düzen Kayıtları' })
    .innerText()
  check(
    'export card counts folders',
    /2 klasör/.test(layoutsCard),
    layoutsCard.replace(/\s+/g, ' ')
  )
  await exportDialog.getByRole('button', { name: /^Dışa Aktar \(/ }).click()
  await exportDialog.waitFor({ state: 'hidden', timeout: 5000 })
  const decoded = decodeExportFile(exported)
  const sections = decoded.ok ? decoded.payload.sections : {}
  check(
    'exported file carries layout folders',
    JSON.stringify(sections.layoutFolders) === '["Üretim","Ağaç"]' &&
      sections.layouts?.find((l) => l.name === 'İkinci')?.folder === 'Ağaç',
    JSON.stringify({
      folders: sections.layoutFolders,
      layouts: sections.layouts?.map((l) => [l.name, l.folder])
    })
  )

  // 14. İçe aktarım klasörleri (boş olanlar dahil) geri getirir
  const incoming = writeExportFile(work, {
    layouts: [
      {
        id: 'g1',
        name: 'Gece',
        folder: 'Nöbet',
        createdAt: 1,
        items: [{ type: 'tab', asset: { id: 'x', name: 'jump-ops' } }]
      }
    ],
    layoutFolders: ['Nöbet', 'Boş Klasör']
  })
  await importFile(app, page, incoming)
  await page.waitForTimeout(400)
  await openHome()
  state = await homeFolders()
  check(
    'import restores folders, including empty ones',
    JSON.stringify(state) === JSON.stringify({ Nöbet: ['Gece'], 'Boş Klasör': [] }),
    JSON.stringify(state)
  )
} catch (err) {
  failed = true
  console.log(`FAIL ${err.message.split('\n')[0]}`)
} finally {
  await app.close().catch(() => undefined)
  process.exitCode = failed ? 1 : 0
}

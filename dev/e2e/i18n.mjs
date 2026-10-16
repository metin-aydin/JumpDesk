// İngilizce arayüz taraması: ekranlar dolaşılır, görünen metinlerde ve title/aria-label/placeholder niteliklerinde
// Türkçe kalan (sözlükteki Türkçe anahtarla aynı ya da Türkçe harf içeren) metinler ve sözlükte karşılığı olmayan t()
// çağrıları raporlanır. Kullanım: node dev/e2e/i18n.mjs <klasör> (mock açıkken)
import { _electron as electron } from 'playwright-core'
import { buildSync } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { FIXTURE_SNIPPETS, stubFileDialogs, writeExportFile } from './helpers.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-i18n-shots')
fs.mkdirSync(out, { recursive: true })
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-i18n-files-'))

const enFile = path.join(work, 'en.cjs')
buildSync({
  entryPoints: [path.join(root, 'src/renderer/src/i18n/en/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: enFile,
  alias: { '@': path.join(root, 'src/renderer/src') },
  logLevel: 'error'
})
const { EN } = createRequire(import.meta.url)(enFile)
/** İngilizcesi kendisiyle aynı olanlar (ör. "Terminal") Türkçe kalıntı sayılmaz. */
const turkishKeys = Object.keys(EN).filter((k) => !k.includes('{') && EN[k] !== k)

/** Mock sunucunun verisi (klasör/sunucu adları) Türkçe olabilir; bunlar çevrilmez. */
const DATA = [
  /Büyük grup/,
  /Veritabanı/,
  /Entegrasyon/,
  /Bölge Ofisleri/,
  /Merkez Kampüs/,
  /Ana Veri Merkezi/,
  /Başka/,
  /Gruplanmamış/i,
  /Türkçe/,
  // Mock sunucunun kabuk geçmişinde önceki testlerin yazdığı komutlar (Geçmiş paneli)
  /JUMPDESK/
]

const env = {
  ...process.env,
  JUMPDESK_SERVER: 'http://127.0.0.1:18080',
  JUMPDESK_HIDE_WINDOW: '1',
  JUMPDESK_OFFSCREEN: '1',
  JUMPDESK_NO_NOTIFY: '1',
  JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-i18n-'))
}
delete env.JUMPDESK_LANGUAGE
const app = await electron.launch({ args: ['--ozone-platform=x11', 'out/main/index.js'], env })
const page = await app.firstWindow()
let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const shot = async (name) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, 'base64'))
}

const found = new Map()
/** Görünen metinleri ve nitelikleri tarar; terminal içeriği (sunucu çıktısı) hariç. */
const scan = async (where) => {
  await page.waitForTimeout(350)
  const items = await page.evaluate((keys) => {
    const keySet = new Set(keys)
    const res = []
    const visible = (el) => {
      if (!(el instanceof Element)) return false
      if (el.closest('.xterm')) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent.replace(/\s+/g, ' ').trim()
      if (text && visible(n.parentElement)) res.push(text)
    }
    for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) {
      if (el.closest('.xterm')) continue
      for (const a of ['title', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(a)
        if (v) res.push(v)
      }
    }
    return [...new Set(res)].filter((t) => keySet.has(t) || /[ğüşıöçİĞÜŞÖÇ]/.test(t))
  }, turkishKeys)
  for (const t of items) {
    if (DATA.some((re) => re.test(t))) continue
    if (!found.has(t)) found.set(t, where)
  }
}

try {
  // Adres ekranı (İngilizce varsayılan)
  const address = page.locator('#server-address')
  await address.waitFor({ timeout: 15000 })
  check(
    'default language is English',
    (await page.evaluate(() => document.documentElement.lang)) === 'en'
  )
  await scan('server screen')
  await shot('i18n-01-server')
  await address.fill('http://127.0.0.1:18080')
  await address.press('Enter')
  for (let i = 0; i < 100; i++) {
    const done = await app.evaluate(async ({ webContents }) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => w.getURL().includes('/core/auth/login/'))
      if (!wc || wc.isLoading()) return false
      await wc.executeJavaScript(
        "document.querySelector('[name=username]').value='demo';document.querySelector('[name=password]').value='demo';document.querySelector('form').submit()"
      )
      return true
    })
    if (done) break
    await page.waitForTimeout(150)
  }
  await page.getByRole('tree').waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)
  await scan('main window')
  await shot('i18n-02-main')

  // Snippet fixture'ı ve bir dosya (içe aktarım ekranı için)
  const fixture = writeExportFile(work, {
    snippets: FIXTURE_SNIPPETS,
    alarms: [{ id: 'a', pattern: 'Exception', regex: false, caseSensitive: true, enabled: true }],
    highlights: [
      {
        id: 'h',
        pattern: 'INFO',
        regex: false,
        caseSensitive: true,
        enabled: true,
        fg: '#ffffff',
        bg: '#0969da'
      }
    ]
  })
  await stubFileDialogs(app, { open: fixture, save: path.join(work, 'export.jumpdesk') })

  // Komut paleti: tüm komutlar listelenir
  await page.keyboard.press('Control+Shift+P')
  await page.getByRole('option').first().waitFor({ timeout: 5000 })
  await scan('command palette')
  await shot('i18n-03-palette')
  await page.keyboard.type('Import')
  await page.waitForTimeout(250)
  await page.keyboard.press('Enter')
  const importDialog = page.getByRole('dialog').filter({ has: page.locator('[role=checkbox]') })
  await importDialog.waitFor({ timeout: 5000 })
  await scan('import dialog')
  await shot('i18n-04-import')
  await importDialog.locator('[data-slot=dialog-footer] button').last().click()
  await page.waitForTimeout(500)
  await scan('import toast')

  // Kısayollar
  await page.keyboard.press('Control+Shift+K')
  await page.getByRole('dialog').waitFor({ timeout: 5000 })
  await scan('shortcuts dialog')
  await page.keyboard.press('Escape')

  // Ayarlar: tüm bölümler
  await page.keyboard.press('Control+,')
  const nav = page.getByRole('dialog').locator('nav button')
  await nav.first().waitFor({ timeout: 5000 })
  const sections = await nav.count()
  for (let i = 0; i < sections; i++) {
    await nav.nth(i).click()
    await scan(`settings section ${i + 1}`)
    await shot(`i18n-05-settings-${i + 1}`)
  }
  await page.keyboard.press('Escape')

  // Dışa aktarım ekranı
  await page.keyboard.press('Control+Shift+P')
  await page.keyboard.type('Export')
  await page.waitForTimeout(250)
  await page.keyboard.press('Enter')
  await page.getByRole('dialog').waitFor({ timeout: 5000 })
  await scan('export dialog')
  await shot('i18n-06-export')
  await page.keyboard.press('Escape')

  // Ağaç bağlam menüleri
  await page.getByRole('tree').getByText('Linux', { exact: true }).click({ button: 'right' })
  await page.getByRole('menu').waitFor({ timeout: 5000 })
  await scan('folder context menu')
  await page.keyboard.press('Escape')
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).click({ button: 'right' })
  await page.getByRole('menu').waitFor({ timeout: 5000 })
  await scan('server context menu')
  await page.keyboard.press('Escape')

  // Oturum: sekme, sağ panel sekmeleri, sekme menüsü
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForTimeout(4000)
  await scan('session')
  await page.keyboard.press('Control+Shift+B')
  const panelTabs = page.locator('aside').last().locator('> div').nth(1).getByRole('button')
  const tabCount = await panelTabs.count()
  for (let i = 0; i < tabCount; i++) {
    await panelTabs.nth(i).click()
    await page.waitForTimeout(600)
    await scan(`right panel tab ${i + 1}`)
    await shot(`i18n-07-panel-${i + 1}`)
    const footer = page.locator('aside').last().locator('.border-t button').first()
    if (await footer.count()) {
      await footer.click()
      await page.waitForTimeout(400)
      if (await page.getByRole('dialog').count()) {
        await scan(`right panel tab ${i + 1} dialog`)
        await shot(`i18n-07-panel-${i + 1}-dialog`)
        await page.keyboard.press('Escape')
      }
    }
  }
  await page.getByRole('tab').last().click({ button: 'right' })
  await page.getByRole('menu').waitFor({ timeout: 5000 })
  await scan('tab context menu')
  await page.keyboard.press('Escape')

  // İkinci oturum ve bölünmüş görünüm (panel başlıkları)
  await page.keyboard.press('Control+Shift+T')
  await page.waitForTimeout(500)
  await scan('new connection tab')
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForTimeout(3000)
  await page.keyboard.press('Control+Shift+P')
  await page.keyboard.type('Side by Side')
  await page.waitForTimeout(250)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  await scan('split view')
  await shot('i18n-08-split')
  await page.getByRole('tab').first().click({ button: 'right' })
  await page.getByRole('menu').waitFor({ timeout: 5000 })
  await scan('group tab context menu')
  await page.keyboard.press('Escape')

  // Terminal araması
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.press('Control+f')
  await page.waitForTimeout(300)
  await scan('terminal search')
  await page.keyboard.press('Escape')

  // Türkçeye geçiş ayarlardan çalışır
  await page.keyboard.press('Control+,')
  await page.getByRole('dialog').locator('nav button').first().click()
  await page.getByRole('button', { name: 'Türkçe' }).first().click()
  await page.waitForTimeout(300)
  check(
    'switching to Turkish updates the UI',
    (await page.evaluate(() => document.documentElement.lang)) === 'tr' &&
      (await page.getByText('Ayarlar', { exact: true }).count()) > 0
  )
  await page.getByRole('button', { name: 'English' }).first().click()
  await page.keyboard.press('Escape')

  const misses = await page.evaluate(() => [...(globalThis.__jumpdeskI18nMisses ?? [])])
  check('no t() call without English text', misses.length === 0, misses.slice(0, 30).join(' | '))
  const leftovers = [...found.entries()].map(([t, w]) => `${t}  [${w}]`)
  check(
    'no Turkish text on English screens',
    leftovers.length === 0,
    `\n    ${leftovers.join('\n    ')}`
  )
} catch (err) {
  failed = true
  console.log(`FAIL: ${err.message}`)
  await shot('i18n-error').catch(() => undefined)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

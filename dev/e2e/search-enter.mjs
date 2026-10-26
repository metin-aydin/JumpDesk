// Sunucu aramasında Enter: sonuçlar yazılan metne yetişmeden basılan Enter, o metnin araması bitince ilk sonuca
// bağlanır (eski metnin sonuçlarından seçmez); Enter'dan sonra yazmaya devam edilir ya da Esc'e basılırsa bağlanılmaz;
// sonuçlar güncelken oklarla seçilen sonuca bağlanılır. "Yeni Bağlantı" ekranı ve kenar çubuğu araması denenir.
// Kullanım: node dev/e2e/search-enter.mjs <klasör>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-search-enter')
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
    JUMPDESK_DISABLE_WEBGL: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-search-enter-'))
  }
})
const page = await app.firstWindow()
let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const tabLabels = () =>
  page
    .locator('[data-tab-strip] [role=tab]')
    .evaluateAll((tabs) => tabs.map((t) => t.innerText.split('\n')[0].trim()))
/** Yeni açılan sekmelerin adları (önceki listeye göre). */
const openedSince = async (before) => {
  const now = await tabLabels()
  const rest = [...before]
  return now.filter((l) => {
    const i = rest.indexOf(l)
    if (i < 0) return true
    rest.splice(i, 1)
    return false
  })
}
/** Mock'ta "10.12.0.1" ilk olarak db-01'i, "10.12.0.14" ise node-124'ü bulur. */
const PARTIAL = '10.12.0.1'
const FIRST_OF_PARTIAL = 'db-01'
const FIRST_OF_FULL = 'node-124'

try {
  await login(app, page)

  // "Yeni Bağlantı" ekranı: son karakterden hemen sonra Enter
  const quick = page.getByPlaceholder('Sunucu adı veya IP adresi yazın')
  await quick.waitFor({ timeout: 10000 })
  await quick.click()
  await quick.pressSequentially(PARTIAL)
  await page.getByRole('option').filter({ hasText: FIRST_OF_PARTIAL }).first().waitFor()
  let before = await tabLabels()
  await quick.press('4')
  await quick.press('Enter')
  await page.waitForTimeout(1500)
  let opened = await openedSince(before)
  check(
    'quick connect: fast Enter waits for the typed text and opens its first result',
    opened.length === 1 && opened[0] === FIRST_OF_FULL,
    opened.join(', ') || 'yeni sekme yok'
  )

  // Kenar çubuğu araması: aynı senaryo
  const side = page.getByPlaceholder('Sunucu, IP, etiket ara')
  await page.keyboard.press('Control+Shift+F')
  await side.fill('')
  await side.pressSequentially(PARTIAL)
  await page.getByRole('option').filter({ hasText: FIRST_OF_PARTIAL }).first().waitFor()
  before = await tabLabels()
  await side.press('4')
  await side.press('Enter')
  await page.waitForTimeout(1500)
  opened = await openedSince(before)
  check(
    'sidebar: fast Enter waits for the typed text and opens its first result',
    opened.length === 1 && opened[0] === FIRST_OF_FULL,
    opened.join(', ') || 'yeni sekme yok'
  )

  // Enter'dan sonra yazmaya devam: bekleyen seçim bırakılır
  await page.keyboard.press('Control+Shift+F')
  await side.fill('')
  await side.pressSequentially(PARTIAL)
  await page.getByRole('option').filter({ hasText: FIRST_OF_PARTIAL }).first().waitFor()
  before = await tabLabels()
  await side.press('4')
  await side.press('Enter')
  await side.press('5')
  await page.waitForTimeout(1500)
  opened = await openedSince(before)
  check('sidebar: typing after Enter cancels the pending pick', opened.length === 0, opened.join(', '))

  // Enter'dan hemen sonra Esc: bağlanılmaz
  await side.fill('')
  await side.pressSequentially(PARTIAL)
  await page.getByRole('option').filter({ hasText: FIRST_OF_PARTIAL }).first().waitFor()
  before = await tabLabels()
  await side.press('4')
  await side.press('Enter')
  await side.press('Escape')
  await page.waitForTimeout(1500)
  opened = await openedSince(before)
  check('sidebar: Escape after Enter cancels the pending pick', opened.length === 0, opened.join(', '))

  // Sonuçlar güncelken ↓ + Enter ikinci sonuca bağlanır
  await page.keyboard.press('Control+Shift+F')
  await side.fill('')
  await side.pressSequentially(PARTIAL)
  const options = page.getByRole('option')
  await options.filter({ hasText: FIRST_OF_PARTIAL }).first().waitFor()
  const second = (await options.nth(1).innerText()).split('\n')[0].trim()
  before = await tabLabels()
  await side.press('ArrowDown')
  await side.press('Enter')
  await page.waitForTimeout(1500)
  opened = await openedSince(before)
  check(
    'sidebar: ArrowDown + Enter on settled results opens the second result',
    opened.length === 1 && opened[0] === second,
    `${opened.join(', ') || 'yeni sekme yok'} (beklenen ${second})`
  )
} catch (e) {
  failed = true
  console.error(e)
} finally {
  await app.close()
}
process.exit(failed ? 1 : 0)

// "Yeni Bağlantı" ekranındaki klasör gezgini: klasör ızgarası, alt klasöre inme, sunucular, yol çubuğu ve taşan
// yolun "…" menüsüne toplanması. Kullanım: node dev/e2e/home.mjs <klasör>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-home-shots')
fs.mkdirSync(out, { recursive: true })
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-home-'))
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
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${detail}`)
}
const crumbs = () => page.locator('nav[aria-label="Klasör Yolu"] button').allInnerTexts()
const section = () => page.locator('section', { has: page.getByText('Klasörler', { exact: true }) })
const card = (name) =>
  section()
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .first()

try {
  await login(app, page)
  await page.getByRole('tree').waitFor({ timeout: 15000 })
  await card('Linux').waitFor({ timeout: 10000 })
  check(
    'starts inside single root',
    (await crumbs()).join(' › ') === 'Default',
    (await crumbs()).join(' › ')
  )
  check(
    'favorites folder not in grid',
    (await section()
      .getByRole('button', { name: /^Favoriler/ })
      .count()) === 0
  )
  await shot('home-01-root')

  await card('Linux').click()
  await page.waitForTimeout(300)
  check(
    'single click selects folder (no navigation)',
    (await card('Linux').getAttribute('aria-pressed')) === 'true' && (await crumbs()).length === 1
  )
  await card('Linux').click({ button: 'right' })
  await page
    .getByText('Klasörde Doğrudan Sunucu Yok')
    .waitFor({ timeout: 5000 })
    .catch(() => undefined)
  check(
    'folder menu',
    (await page.getByRole('menuitem', { name: 'Klasörü Aç' }).count()) === 1 &&
      (await page.getByText('Klasörde Doğrudan Sunucu Yok').count()) === 1
  )
  await page.keyboard.press('Escape')
  await card('Linux').dblclick()
  await card('Prod').waitFor({ timeout: 5000 })
  check('Linux subfolders', (await card('Test').count()) === 1, (await crumbs()).join(' › '))
  await card('Prod').dblclick()
  await card('app-01').waitFor({ timeout: 5000 })
  check(
    'servers listed in folder',
    (await section()
      .getByRole('button', { name: /^web-0/ })
      .count()) === 2
  )
  await card('app-01').click()
  await card('web-02').click({ modifiers: ['Control'] })
  await card('web-02').click({ button: 'right' })
  check(
    'multi-select menu',
    (await page.getByRole('menuitem', { name: '2 Sunucuya Bağlan', exact: true }).count()) === 1 &&
      (await page.getByText('2 Sunucuya Farklı Bağlan…').count()) === 1
  )
  await shot('home-02-prod')
  await page.keyboard.press('Escape')
  await card('app-02').click({ modifiers: ['Shift'] })
  const pressed = await section().locator('button[aria-pressed=true]').count()
  check('shift range select (web-02 → app-02)', pressed === 3, `${pressed} selected`)
  await page
    .locator('nav[aria-label="Klasör Yolu"]')
    .getByRole('button', { name: 'Default' })
    .click()
  await card('Linux').waitFor({ timeout: 5000 })
  check('breadcrumb navigates up', (await crumbs()).join(' › ') === 'Default')

  // Klavyeyle gezinme: oklar kart değiştirir, Enter klasörü açar, Backspace üst klasöre çıkar
  await card('Büyük grup').click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  const focused = () =>
    page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 20))
  check(
    'arrow keys move between folders',
    (await focused())?.startsWith('Linux') &&
      (await card('Linux').getAttribute('aria-pressed')) === 'true',
    await focused()
  )
  await page.keyboard.press('Enter')
  await card('Prod').waitFor({ timeout: 5000 })
  await page.waitForTimeout(200)
  check(
    'Enter opens folder and focuses first card',
    (await crumbs()).at(-1) === 'Linux' && (await focused())?.startsWith('Prod'),
    await focused()
  )
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await card('test-01').waitFor({ timeout: 5000 })
  check('Enter on second folder', (await crumbs()).at(-1) === 'Test')
  await page.waitForTimeout(200)
  await page.keyboard.press('Backspace')
  await card('Prod').waitFor({ timeout: 5000 })
  check('Backspace goes up', (await crumbs()).at(-1) === 'Linux')
  await page
    .locator('nav[aria-label="Klasör Yolu"]')
    .getByRole('button', { name: 'Default' })
    .click()
  await card('Linux').waitFor({ timeout: 5000 })

  for (const name of ['Entegrasyon', 'Partner A', 'Bölge', 'Merkez', 'Ana Veri']) {
    await card(name).dblclick()
    await page.waitForTimeout(250)
  }
  await card('dr-site-01').waitFor({ timeout: 5000 })
  const fit = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Klasör Yolu"]')
    return { scroll: nav.scrollWidth, client: nav.clientWidth }
  })
  check(
    'deep path collapsed with …',
    (await page.getByRole('button', { name: 'Gizli Klasörler' }).count()) === 1,
    (await crumbs()).join(' › ')
  )
  check('breadcrumb fits without overflow', fit.scroll <= fit.client + 1, JSON.stringify(fit))
  await shot('home-03-deep')
  await page.getByRole('button', { name: 'Gizli Klasörler' }).click()
  await page.getByRole('menuitem', { name: 'Partner A', exact: true }).click()
  await card('Bölge').waitFor({ timeout: 5000 })
  check(
    'hidden crumb navigates',
    (await crumbs()).at(-1) === 'Partner A',
    (await crumbs()).join(' › ')
  )

  await page
    .locator('nav[aria-label="Klasör Yolu"]')
    .getByRole('button', { name: 'Default' })
    .click()
  await card('Linux').dblclick()
  await card('Prod').dblclick()
  await card('web-01').waitFor({ timeout: 5000 })
  await card('web-01').click()
  await card('web-02').click({ modifiers: ['Control'] })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  const tabs = (await page.getByRole('tab').allInnerTexts()).map((t) => t.split('\n')[0])
  check(
    'Enter connects all selected',
    tabs.includes('web-01') && tabs.includes('web-02') && !tabs.includes('Yeni Bağlantı'),
    tabs.join(' | ')
  )
} catch (err) {
  failed = true
  console.log(`FAIL ${err.message}`)
  await shot('zz-failure').catch(() => undefined)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

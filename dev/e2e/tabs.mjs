// Sekme şeridi ve gruplar: klasördeki sunuculara toplu bağlanma, ikinci grup, sekme arama, tümünü kapatma,
// Chrome tarzı küçülme/kaydırma ve şeridin ötesine sürükleme. Kullanım: node dev/e2e/tabs.mjs <çıktı-klasörü>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const outDir = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-tabs-shots')
fs.mkdirSync(outDir, { recursive: true })
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
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-tabs-'))
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
const groupTabs = () => page.getByRole('tab', { name: /^Bölünmüş görünüm/ })
const tabOrder = async () =>
  (await page.getByRole('tab').allInnerTexts()).map((t) => t.split('\n')[0]).join(' | ')

try {
  await login(app, page)
  await page.getByRole('tree').waitFor({ timeout: 15000 })
  await page.getByRole('tree').getByText('Linux', { exact: true }).waitFor({ timeout: 15000 })
  await page.getByRole('tree').getByText('Linux', { exact: true }).click()
  await page.getByRole('tree').getByText('Prod', { exact: true }).waitFor({ timeout: 10000 })

  await page.getByRole('tree').getByText('Prod', { exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Klasördeki \d+ Sunucuya Farklı Bağlan…/ }).hover()
  await page.getByRole('menuitem', { name: 'Tümünü Izgara Şeklinde Açarak Bağlan' }).click()
  await groupTabs().first().waitFor({ timeout: 10000 })
  const first = await groupTabs().first().getAttribute('aria-label')
  log(`folder group members: ${first.replace('Bölünmüş görünüm: ', '')}`)
  log(`panes in grid: ${await page.locator('[data-pane-header]').count()}`)
  await page.waitForTimeout(1500)
  await shot('tabs-01-folder-grid')

  await page.getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForTimeout(800)
  await page.getByRole('tree').getByText('Test', { exact: true }).click()
  await page
    .getByRole('treeitem', { name: /test-01/ })
    .first()
    .dblclick()
  await page.waitForTimeout(800)
  log(`tabs before second group: ${await tabOrder()}`)
  await page.getByRole('tab', { name: 'jump-ops' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Yan Yana Yerleştir' }).click()
  await page.waitForTimeout(600)
  log(`group tabs after second arrange: ${await groupTabs().count()}`)
  log(
    `second group: ${(await groupTabs().nth(1).getAttribute('aria-label'))?.replace('Bölünmüş görünüm: ', '')}`
  )
  await shot('tabs-02-two-groups')

  await page.keyboard.press('Control+Shift+A')
  await page.getByPlaceholder('Sekmelerde ara').waitFor({ timeout: 5000 })
  log(`tab search lists: ${await page.getByRole('option').count()}`)
  await page.keyboard.type('app-02')
  await page.waitForTimeout(400)
  await shot('tabs-03-search')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  log(
    `active after search: ${(await page.locator('[role=tab][aria-selected=true]').getAttribute('aria-label'))?.includes('app-02')}`
  )

  await groupTabs().first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Tüm Sekmeleri Kapat' }).click()
  await page.waitForTimeout(500)
  log(`after close all: ${await tabOrder()}`)

  for (let i = 0; i < 39; i++) await page.keyboard.press('Control+Shift+T')
  await page.waitForTimeout(500)
  const strip = await page.evaluate(() => {
    const el = document.querySelector('[data-tab-strip]')
    const tab = el.querySelector('[role=tab]')
    return {
      tabs: el.querySelectorAll('[role=tab]').length,
      width: Math.round(tab.getBoundingClientRect().width),
      scrollable: el.scrollWidth > el.clientWidth
    }
  })
  log(`overflow: ${JSON.stringify(strip)}`)
  await shot('tabs-04-overflow')

  await page.getByRole('tab').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Tüm Sekmeleri Kapat' }).click()
  await page.getByRole('tree').getByText('Prod', { exact: true }).click()
  await page.waitForTimeout(300)
  for (const name of ['web-02', 'app-01', 'jump-ops']) {
    await page
      .getByRole('treeitem', { name: new RegExp(name) })
      .first()
      .dblclick()
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(500)
  log(`before far drag: ${await tabOrder()}`)
  const t0 = await page.getByRole('tab', { name: 'web-02' }).boundingBox()
  const win = await page.evaluate(() => window.innerWidth)
  await page.mouse.move(t0.x + 30, t0.y + 15)
  await page.mouse.down()
  await page.mouse.move(t0.x + 80, t0.y + 15, { steps: 4 })
  await page.mouse.move(win - 260, t0.y + 15, { steps: 16 })
  await shot('tabs-05-far-drag')
  await page.mouse.up()
  await page.waitForTimeout(400)
  log(`after far drag: ${await tabOrder()}`)

  await page
    .getByRole('treeitem', { name: /app-02/ })
    .first()
    .click()
  await page
    .getByRole('treeitem', { name: /test-02/ })
    .first()
    .click({ modifiers: ['Control'] })
  await page
    .getByRole('treeitem', { name: /test-02/ })
    .first()
    .click({ button: 'right' })
  await page.waitForTimeout(300)
  const hidden = ['Adresi Kopyala', 'Adı Kopyala']
  const visibleSingles = []
  for (const name of hidden)
    if (await page.getByRole('menuitem', { name }).count()) visibleSingles.push(name)
  log(`multi menu hides single items: ${visibleSingles.length === 0}`)
  await page.getByText('2 Sunucuya Farklı Bağlan…').hover()
  log(
    `multi submenu has no count: ${(await page.getByRole('menuitem', { name: '2 Sunucuya Farklı Bağlan…', exact: true }).count()) === 1}`
  )
  await shot('tabs-06-multi-menu')
  await page.getByRole('menuitem', { name: 'Tümünü Alt Alta Açarak Bağlan' }).click()
  await page.waitForTimeout(800)
  log(
    `multi-select group: ${(await groupTabs().last().getAttribute('aria-label'))?.replace('Bölünmüş görünüm: ', '')}`
  )

  await groupTabs().last().click({ button: 'right' })
  log(
    `group close items like a tab: ${(await page.getByRole('menuitem', { name: 'Kapat', exact: true }).count()) === 1 && (await page.getByRole('menuitem', { name: 'Diğerlerini Kapat' }).count()) === 1 && (await page.getByRole('menuitem', { name: 'Tüm Sekmeleri Kapat' }).count()) === 1}`
  )
  await page.keyboard.press('Escape')
  log(`before group drag: ${await tabOrder()}`)
  const g = await groupTabs().last().boundingBox()
  await page.mouse.move(g.x + 40, g.y + 15)
  await page.mouse.down()
  await page.mouse.move(g.x - 20, g.y + 15, { steps: 4 })
  await page.mouse.move(5, g.y + 15, { steps: 16 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  log(`after group drag (group first): ${await tabOrder()}`)
  log(
    `group still intact: ${(await groupTabs().first().getAttribute('aria-label'))?.replace('Bölünmüş görünüm: ', '')}`
  )
  await shot('tabs-07-group-dragged')
  log(`group count badge: ${await groupTabs().first().locator('[title="2 Sunucu"]').innerText()}`)

  await groupTabs().first().click()
  await page.waitForTimeout(300)
  const jt = await page.getByRole('tab', { name: 'jump-ops' }).boundingBox()
  const area = await page.locator('[data-workspace]').boundingBox()
  await page.mouse.move(jt.x + 30, jt.y + 15)
  await page.mouse.down()
  await page.mouse.move(jt.x + 40, jt.y + 40, { steps: 4 })
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2, { steps: 12 })
  log(
    `drop zone visible while over group: ${await page.getByText('Gruba Ekle', { exact: true }).count()}`
  )
  await shot('tabs-08-drop-into-group')
  await page.mouse.up()
  await page.waitForTimeout(600)
  log(
    `group after drop: ${(await groupTabs().first().getAttribute('aria-label'))?.replace('Bölünmüş görünüm: ', '')}`
  )
  log(`panes now: ${await page.locator('[data-pane-header]').count()}, tabs: ${await tabOrder()}`)

  await page.keyboard.press('Control+Shift+A')
  await page.getByPlaceholder('Sekmelerde ara').waitFor({ timeout: 5000 })
  await page.waitForTimeout(300)
  const option = page.getByRole('option').nth(1)
  await option.hover()
  await page.waitForTimeout(400)
  const card = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => d.className.includes('z-[60]'))
    const row = document.querySelectorAll('[role=option]')[1]
    return el
      ? {
          left: Math.round(el.getBoundingClientRect().right),
          rowLeft: Math.round(row.getBoundingClientRect().left)
        }
      : null
  })
  log(`search hover preview left of row: ${card ? card.left <= card.rowLeft : false}`)
  await shot('tabs-09-search-preview')
  await page.keyboard.press('Escape')

  // Orta tık grup sekmesini (gruptaki tüm oturumları) kapatır
  const groupsBefore = await groupTabs().count()
  const tabsBefore = await page.getByRole('tab').count()
  const members = ((await groupTabs().first().getAttribute('aria-label')) ?? '').split(',').length
  await groupTabs().first().click({ button: 'middle' })
  await page.waitForTimeout(500)
  log(
    `middle click closes group: ${(await groupTabs().count()) === groupsBefore - 1} (members ${members}, tabs ${tabsBefore} → ${await page.getByRole('tab').count()})`
  )
} catch (err) {
  log(`FAIL: ${err.message}`)
  await shot('zz-failure').catch(() => undefined)
  process.exitCode = 1
} finally {
  fs.writeFileSync(path.join(outDir, 'steps.txt'), steps.join('\n'))
  await app.close()
}

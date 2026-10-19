// Mock JumpServer'a karşı uçtan uca duman testi: giriş, ağaç, SSH terminali, tema; ekran görüntüleri alır.
// Kullanım: npm run mock (ayrı terminalde) && npm run build && node dev/e2e/smoke.mjs <çıktı-klasörü>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importFixtureSnippets, login } from './helpers.mjs'

const outDir = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-shots')
fs.mkdirSync(outDir, { recursive: true })
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-e2e-'))
const steps = []
const log = (msg) => {
  steps.push(msg)
  console.log(msg)
}

const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: process.env.JUMPDESK_SERVER || 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_USER_DATA: userData
  }
})

async function shot(name) {
  const b64 = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    const img = await win.capturePage()
    return img.toPNG().toString('base64')
  })
  const file = path.join(outDir, `${name}.png`)
  fs.writeFileSync(file, Buffer.from(b64, 'base64'))
  log(`screenshot: ${file}`)
}

const page = await app.firstWindow()

async function run() {
  page.on('console', (m) => m.type() === 'error' && log(`console.error: ${m.text()}`))
  page.on('pageerror', (err) => log(`pageerror: ${err.message}`))

  await page.getByLabel('Sunucu Adresi').waitFor({ timeout: 15000 })
  await page.waitForTimeout(400)
  await shot('01-server')
  await login(app, page)
  log('login form submitted: true')
  await importFixtureSnippets(app, page, userData)
  log('fixture snippets imported')

  await page.getByRole('tree').waitFor({ timeout: 15000 })
  await page.getByRole('tree').getByText('Linux', { exact: true }).waitFor({ timeout: 15000 })
  log('tree visible')

  await page.getByRole('tree').getByText('Linux', { exact: true }).click()
  await page.getByRole('tree').getByText('Prod', { exact: true }).waitFor({ timeout: 10000 })
  await page.getByRole('tree').getByText('Prod', { exact: true }).click()
  await page
    .getByRole('treeitem', { name: /web-01/ })
    .first()
    .waitFor({ timeout: 10000 })
  await page.getByText('Entegrasyon', { exact: false }).first().click()
  await page.getByText('Partner A', { exact: true }).click()
  await page
    .getByRole('treeitem', { name: /partner-gateway01/ })
    .first()
    .waitFor({ timeout: 10000 })
  await shot('02-tree')
  const overflow = await page.evaluate(() => {
    const row = [...document.querySelectorAll('[role=treeitem]')].find((r) =>
      r.textContent?.includes('partner-gateway01')
    )
    return row ? row.scrollWidth - row.clientWidth : -1
  })
  log(`tree row overflow px: ${overflow}`)
  await page.getByRole('tree').getByText('Linux', { exact: true }).click({ button: 'right' })
  await page.getByText('Yenile', { exact: true }).click()
  await page.waitForTimeout(1200)
  log(
    `tree after folder refresh shows web-01: ${await page.getByRole('treeitem', { name: /web-01/ }).count()}`
  )

  await page
    .getByRole('treeitem', { name: /web-01/ })
    .first()
    .click({ button: 'right' })
  await page.getByText('Etiketleri Düzenle').click()
  await page.keyboard.type('nginx')
  await page.keyboard.press('Enter')
  await page.keyboard.type('prod')
  await shot('02d-tag-dialog')
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await page.waitForTimeout(400)
  await page.keyboard.press('Control+Shift+F')
  await page.keyboard.type('nginx')
  await page.waitForTimeout(1200)
  await shot('02e-tag-search')
  log(
    `tag search results: ${await page.getByRole('option').count()}, prod chip: ${await page.getByRole('option').getByText('prod', { exact: true }).count()}`
  )
  await page.keyboard.press('Escape')
  log(
    `dns resolve localhost: ${await page.evaluate(() => window.jumpdesk.net.resolve('localhost'))}`
  )

  await page.getByRole('button', { name: /demo/ }).click()
  await page.waitForTimeout(400)
  await shot('02c-profile-menu')
  log(`profile menu open: ${await page.getByText('Çıkış Yap').count()}`)
  log(
    `profile avatar loaded: ${await page.locator('[role=menu] img[src^="data:image/png"]').count()}`
  )
  await page.keyboard.press('Escape')

  await page
    .getByRole('treeitem', { name: /web-01/ })
    .first()
    .dblclick()
  await page.getByRole('button', { name: /^root/ }).waitFor({ timeout: 10000 })
  log(`tabs after dblclick: ${await page.getByRole('tab').count()}`)
  await shot('02b-account-picker')
  await page.getByRole('button', { name: /^root/ }).click()
  await page.locator('.xterm').waitFor({ timeout: 15000 })
  await page.waitForFunction(
    () => document.querySelector('[role=tab][aria-selected=true] .bg-success') !== null,
    null,
    { timeout: 15000 }
  )
  log('terminal connected')
  await page.waitForTimeout(800)
  log(
    `font loaded: ${await page.evaluate(() => document.fonts.check('13px "JetBrains Mono Variable"'))}`
  )
  log(
    `font faces: ${await page.evaluate(() =>
      [...document.fonts]
        .filter((f) => f.status === 'loaded')
        .map((f) => f.family + ':' + f.unicodeRange.slice(0, 12))
        .join(', ')
    )}`
  )
  await page.locator('.xterm').first().click()
  await page.waitForTimeout(2500)
  await page.keyboard.type('ls -la && echo "ERROR test WARN 10.1.2.3 OK" && cd logs\n')
  await page.waitForTimeout(1200)
  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = 'dark'
  })
  await page.waitForTimeout(800)
  await shot('03-terminal-dark')

  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = 'light'
  })
  await page.waitForTimeout(800)
  await shot('04-terminal-light')

  await app.evaluate(({ nativeTheme }) => {
    nativeTheme.themeSource = 'dark'
  })
  await page.keyboard.press('Control+Shift+B')
  await page.getByRole('button', { name: 'Geçmiş' }).click()
  await page.waitForTimeout(600)
  await shot('04b-history-panel')
  log(`history has 'cd logs': ${await page.getByText('cd logs', { exact: true }).count()}`)
  log(`tree shows local ip: ${await page.getByText('192.168.10.2').count()}`)
  await page.getByRole('button', { name: 'Snippetler' }).click()
  await page.getByText('Queue Server', { exact: true }).click()
  await page.waitForTimeout(500)
  await shot('04c-snippet-run')
  const uptimeRow = page.getByRole('button', { name: /Queue Server 1 Log/ })
  await uptimeRow.hover()
  await uptimeRow.getByRole('button', { name: 'Bağlanınca Çalıştır' }).click()
  await page.waitForTimeout(300)
  log(`autorun hint: ${await page.getByText(/bağlanınca 1 snippet çalışır/).count()}`)
  await page.keyboard.press('Control+Shift+B')

  await page.locator('.xterm').first().click()
  await page.keyboard.type('cd ..')
  await page.waitForTimeout(150)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(700)
  await page.keyboard.type('sys')
  await page.waitForTimeout(900)
  await shot('04d-autocomplete-command')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+U')
  await page.waitForTimeout(300)
  await page.keyboard.type('cat no')
  await page.waitForTimeout(900)
  await shot('04e-autocomplete-file')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(700)
  await page.keyboard.type('| grep -i not "x" && fakecmd $HOME')
  await page.waitForTimeout(900)
  await shot('04f-command-highlight')
  await page.keyboard.press('Control+U')
  await page.waitForTimeout(300)
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(700)
  log(`popup after history ArrowUp: ${await page.getByText('Tab / → kabul').count()}`)
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+U')
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+Space')
  await page.waitForTimeout(600)
  log(`popup after Ctrl+Space: ${await page.getByText('Tab / → kabul').count()}`)
  await shot('04g-ctrl-space')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  await page.getByRole('tab', { name: /web-01/ }).click({ button: 'right' })
  await page.waitForTimeout(400)
  await shot('05-tab-context-menu')
  await page.keyboard.press('Escape')

  const tabsBefore = await page.getByRole('tab').count()
  await page
    .getByRole('treeitem', { name: /app-01/ })
    .first()
    .click()
  await page
    .getByRole('treeitem', { name: /jump-ops/ })
    .first()
    .click({ modifiers: ['Control'] })
  await page
    .getByRole('treeitem', { name: /jump-ops/ })
    .first()
    .click({ button: 'right' })
  await page.getByText('2 Sunucuya Bağlan', { exact: true }).click()
  await page.waitForTimeout(3500)
  log(`tabs opened by multi-connect: ${(await page.getByRole('tab').count()) - tabsBefore}`)

  await page.getByRole('tab', { name: /app-01/ }).click()
  await page.waitForTimeout(400)
  await page.locator('.xterm:visible').first().click()
  await page.keyboard.type('sleep 2; echo arka-plan-ciktisi\n')
  await page.waitForTimeout(200)
  await page.getByRole('tab', { name: /jump-ops/ }).click()
  await page.waitForTimeout(3500)
  log(
    `activity badge on app-01: ${await page
      .getByRole('tab', { name: /app-01/ })
      .getByLabel('Yeni çıktı')
      .count()}`
  )
  await shot('05b-activity-badge')

  await page.getByRole('tab', { name: /app-01/ }).click({ button: 'right' })
  await page.getByText('Klasörde Göster').click()
  await page.waitForTimeout(1500)
  log(
    `revealed app-01 selected: ${await page.locator('[role=treeitem][aria-selected=true]', { hasText: 'app-01' }).count()}`
  )

  await page.getByRole('tab', { name: /jump-ops/ }).click({ button: 'right' })
  await page.getByText('Izgara Olarak Yerleştir').click()
  await page.waitForTimeout(1500)
  await shot('06a-grid')
  await page.getByRole('tab', { name: /Bölünmüş görünüm/ }).click({ button: 'right' })
  await page.getByText('Yan Yana Yerleştir').click()
  await page.waitForTimeout(800)
  const paneOrder = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-pane-header]')]
        .map((h) => ({ x: h.getBoundingClientRect().x, t: h.textContent }))
        .sort((a, b) => a.x - b.x)
        .map((h) => h.t?.replace(/\d+\.\d+\.\d+\.\d+/, '').trim())
        .join(' | ')
    )
  log(`pane order before drag: ${await paneOrder()}`)
  const headers = page.locator('[data-pane-header]')
  const h0 = await headers.nth(0).boundingBox()
  const h2 = await headers.nth(2).boundingBox()
  await page.mouse.move(h0.x + 40, h0.y + 10)
  await page.mouse.down()
  await page.mouse.move(h0.x + 120, h0.y + 120, { steps: 5 })
  await page.mouse.move(h2.x + 60, h2.y + 200, { steps: 10 })
  await shot('06g-pane-drag')
  await page.mouse.up()
  await page.waitForTimeout(800)
  log(`pane order after drag: ${await paneOrder()}`)
  await headers.nth(1).click({ button: 'right' })
  await page.waitForTimeout(300)
  log(
    `pane header menu has reveal: ${await page.getByRole('menuitem', { name: /Klasörde Göster/ }).count()}`
  )
  await shot('06h-pane-menu')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: /Bölünmüş görünüm/ }).click({ button: 'right' })
  await page.getByText('Girdiyi Tüm Panellere Gönder').click()
  await page.waitForTimeout(300)
  await page.locator('.xterm:visible').first().click()
  await page.keyboard.type('echo yayin-testi\n')
  await page.waitForTimeout(1200)
  await shot('06-arranged')
  await page.keyboard.press('Control+Shift+Enter')
  await page.waitForTimeout(800)
  await shot('06b-zoomed')
  await page.keyboard.press('Control+Shift+Enter')
  await page.waitForTimeout(500)
  await page.locator('[data-tab-strip] [role=tab]').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Grubu Ayır' }).click()
  await page.waitForTimeout(500)
  log(`tabs after ungroup: ${await page.getByRole('tab').count()}`)
  const tabOrder = async () =>
    (await page.getByRole('tab').allInnerTexts()).map((t) => t.split('\n')[0]).join(' | ')
  log(`tab order before drag: ${await tabOrder()}`)
  const t1 = await page.getByRole('tab').nth(0).boundingBox()
  const t3 = await page.getByRole('tab').nth(2).boundingBox()
  await page.mouse.move(t1.x + 30, t1.y + 15)
  await page.mouse.down()
  await page.mouse.move(t1.x + 80, t1.y + 15, { steps: 4 })
  await page.mouse.move(t3.x + t3.width - 10, t3.y + 15, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  log(`tab order after drag: ${await tabOrder()}`)
  await page.getByRole('tab', { name: /app-01/ }).hover()
  await page.waitForTimeout(900)
  await shot('06c-tab-preview')
  await page.mouse.move(700, 500)
  await page.getByRole('button', { name: 'Yeni Bağlantı' }).click()
  await page.waitForTimeout(600)
  await shot('06d-new-connection')

  const tabsWithBlank = await page.getByRole('tab').count()
  await page
    .getByRole('treeitem', { name: /web-01/ })
    .first()
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^Bağlan$/ }).click()
  await page.waitForTimeout(1500)
  log(`context connect shows account picker: ${await page.getByText('Hesap seçin').count()}`)
  log(`blank tab reused: ${(await page.getByRole('tab').count()) === tabsWithBlank}`)
  await page.keyboard.press('Control+Shift+W')
  await page.waitForTimeout(300)

  await page
    .getByRole('treeitem', { name: /web-02/ })
    .first()
    .hover()
  await page.waitForTimeout(1200)
  await shot('06e-tree-hover-card')
  log(`tree hover card: ${await page.getByText('Protokoller').count()}`)

  await page.getByRole('tree').getByText('Windows', { exact: true }).click()
  await page
    .getByRole('treeitem', { name: /idrac-console/ })
    .first()
    .dblclick()
  await page.waitForTimeout(2500)
  await shot('06f-web-console')

  await page
    .getByRole('treeitem', { name: /web-01/ })
    .first()
    .dblclick()
  await page.waitForTimeout(4500)
  await shot('07-autorun-uptime')

  for (let i = 0; i < 30 && !(await tabOrder()).match(/^Yeni Bağlantı$/); i++) {
    await page.keyboard.press('Control+Shift+W')
    await page.waitForTimeout(120)
  }
  log(`tabs after closing all: ${await tabOrder()}`)
  await shot('07b-all-closed')

  await page.getByRole('button', { name: /demo/ }).click()
  await page.getByText('Çıkış Yap').click()
  await login(app, page)
  await page.waitForTimeout(1500)
  log(`tabs after re-login: ${await page.getByRole('tab').count()}`)
}

try {
  await run()
} catch (err) {
  console.error(err.message)
  await shot('zz-failure').catch(() => undefined)
  process.exitCode = 1
} finally {
  fs.writeFileSync(path.join(outDir, 'steps.txt'), steps.join('\n'))
  await app.close()
}

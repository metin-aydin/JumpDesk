// Sağ tık menülerinde simgesiz öğelerin simgeli öğelerle hizalı olduğunu denetler: node dev/e2e/menus.mjs <klasör>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'
const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-menu-shots')
fs.mkdirSync(out, { recursive: true })
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-menu-'))
  }
})
const shot = async (name) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, 'base64'))
}
const page = await app.firstWindow()
await login(app, page)
await page.getByRole('tree').waitFor({ timeout: 15000 })
await page.getByRole('tree').getByText('Linux', { exact: true }).click()
await page.getByRole('tree').getByText('Prod', { exact: true }).click()
await page
  .getByRole('treeitem', { name: /app-01/ })
  .first()
  .dblclick()
await page.waitForTimeout(1500)
await page.getByRole('tab', { name: 'app-01' }).click({ button: 'right' })
await page.waitForTimeout(400)
await shot('menu-tab')
const pads = await page.evaluate(() =>
  [...document.querySelectorAll('[role=menuitem]')].map(
    (m) =>
      `${m.textContent.trim()}|${getComputedStyle(m).paddingLeft}|${m.querySelector(':scope>svg') ? 'svg' : '-'}`
  )
)
console.log(pads.join('\n'))
await page.keyboard.press('Escape')
await page.getByRole('tree').getByText('Prod', { exact: true }).click({ button: 'right' })
await page.getByText('Klasördeki Sunucular Okunuyor…').waitFor({ timeout: 2000 })
const whileLoading = await page.getByRole('menuitem', { name: /Farklı Bağlan/ }).count()
console.log(
  `${whileLoading === 0 ? 'ok  ' : 'FAIL'} loading folder hides connect options (${whileLoading})`
)
if (whileLoading !== 0) process.exitCode = 1
await page.getByRole('menuitem', { name: /Klasördeki \d+ Sunucuya Farklı Bağlan…/ }).hover()
await page.waitForTimeout(500)
await shot('menu-folder')
await app.close()

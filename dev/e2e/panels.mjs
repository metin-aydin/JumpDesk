// Sol sunucu ağacı ve sağ panelin kayarak açılıp kapanmasını denetler: node dev/e2e/panels.mjs <klasör>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-panel-shots')
fs.mkdirSync(out, { recursive: true })
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-panels-'))
  }
})
const shot = async (name) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, 'base64'))
}
const page = await app.firstWindow()
const width = (label) =>
  page.evaluate(
    (l) =>
      Math.round(
        document.querySelector(`[role=region][aria-label="${l}"]`).getBoundingClientRect().width
      ),
    label
  )
let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${detail}`)
}
try {
  await login(app, page)
  await page.getByRole('tree').waitFor({ timeout: 15000 })
  const full = await width('Sunucu Ağacı')
  check('left open at start', full > 200, `${full}px`)

  await page.getByRole('button', { name: 'Sunucu Ağacını Aç/Kapat' }).click()
  await page.waitForTimeout(90)
  const mid = await width('Sunucu Ağacı')
  await shot('panels-01-left-closing')
  check('left animates (mid width)', mid > 0 && mid < full, `${mid}px`)
  await page.waitForTimeout(400)
  check('left closed', (await width('Sunucu Ağacı')) === 0)
  check(
    'tree inert when closed',
    await page.evaluate(() => document.querySelector('[aria-label="Sunucu Ağacı"]').inert)
  )

  await page.keyboard.press('Control+Shift+F')
  await page.waitForTimeout(400)
  check('Ctrl+Shift+F reopens tree', (await width('Sunucu Ağacı')) === full)
  check(
    'search focused',
    await page.evaluate(() =>
      document.activeElement?.getAttribute('placeholder')?.startsWith('Sunucu')
    )
  )

  await page.keyboard.press('Escape')
  await page.locator('[data-workspace]').click()
  await page.keyboard.press('Control+Shift+E')
  await page.waitForTimeout(400)
  check('Ctrl+Shift+E closes tree', (await width('Sunucu Ağacı')) === 0)
  await page.keyboard.press('Control+Shift+E')
  await page.waitForTimeout(400)

  await page.keyboard.press('Control+Shift+B')
  await page.waitForTimeout(90)
  const rmid = await width('Sağ Panel')
  await shot('panels-02-right-opening')
  check('right animates (mid width)', rmid > 0 && rmid < 320, `${rmid}px`)
  await page.waitForTimeout(400)
  check('right open', (await width('Sağ Panel')) === 320)
  const handle = await page
    .getByRole('separator', { name: 'Sağ Panelin Genişliğini Ayarla' })
    .boundingBox()
  await page.mouse.move(handle.x + 2, handle.y + 200)
  await page.mouse.down()
  await page.mouse.move(handle.x - 118, handle.y + 200, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(100)
  check(
    'right panel resized by dragging',
    (await width('Sağ Panel')) === 440,
    `${await width('Sağ Panel')}px`
  )
  check(
    'right width saved',
    (await page.evaluate(() =>
      localStorage.getItem('jumpdesk.user/127.0.0.1:18080/demo/rightPanelWidth')
    )) === '440'
  )
  await shot('panels-04-right-resized')
  await page.keyboard.press('Control+Shift+B')
  await page.waitForTimeout(500)
  check('right closed', (await width('Sağ Panel')) === 0)
  check(
    'right content unmounted',
    (await page.getByRole('button', { name: 'Snippetler' }).count()) === 0
  )
  await shot('panels-03-both')
} catch (err) {
  failed = true
  console.log(`FAIL ${err.message}`)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

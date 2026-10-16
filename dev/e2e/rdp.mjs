// Sahte lion'a karşı RDP ve web konsolu (applet) ekranlarını dener; ekran görüntüsü alır.
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const outDir = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-rdp-shots')
fs.mkdirSync(outDir, { recursive: true })
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: process.env.JUMPDESK_SERVER || 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-rdp-'))
  }
})
const shot = async (name) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(b64, 'base64'))
  console.log(`screenshot: ${name}`)
}
const page = await app.firstWindow()
page.on('console', (m) => m.type() === 'error' && console.log(`console.error: ${m.text()}`))
try {
  await login(app, page)
  await page.getByRole('tree').waitFor({ timeout: 15000 })
  await page.getByRole('tree').getByText('Windows', { exact: true }).click()
  await page.getByRole('treeitem', { name: /dc-01/ }).first().dblclick()
  await page.waitForTimeout(3000)
  await shot('rdp-dc01')
  const info = await page.evaluate(() => {
    const el = document.querySelector('[data-rdp-display]')
    const r = el?.getBoundingClientRect()
    const canvases = [...(el?.querySelectorAll('canvas') ?? [])]
    const describe = (c) => {
      const cs = getComputedStyle(c)
      const parent = c.parentElement
      const pcs = parent ? getComputedStyle(parent) : null
      let px = null
      try {
        px = [...c.getContext('2d').getImageData(50, 50, 1, 1).data]
      } catch (e) {
        px = String(e)
      }
      const cr = c.getBoundingClientRect()
      return {
        w: c.width,
        h: c.height,
        rect: [cr.x, cr.y, cr.width, cr.height],
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        z: cs.zIndex,
        parentOpacity: pcs?.opacity,
        parentDisplay: pcs?.display,
        parentRect: parent && [...Object.values(parent.getBoundingClientRect().toJSON())],
        px
      }
    }
    return {
      display: r && { w: r.width, h: r.height, x: r.x, y: r.y },
      html: el?.innerHTML.slice(0, 600),
      canvases: canvases.map(describe)
    }
  })
  console.log('rdp display', JSON.stringify(info))
  await page
    .getByRole('treeitem', { name: /idrac-console/ })
    .first()
    .dblclick()
  await page.waitForTimeout(3000)
  await shot('web-idrac')
} catch (err) {
  console.error(err.message)
  await shot('rdp-failure')
} finally {
  await app.close()
}

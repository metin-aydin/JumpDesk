// Terminal içi pencereler (öneri listesi) dar panelde kırpılmaz: sayfaya çizilir, uygulama penceresinin içinde kalır.
// Kullanım: node dev/e2e/popups.mjs <klasör> (mock açıkken)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login, runPalette } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-popups')
fs.mkdirSync(out, { recursive: true })
const WIDTH = 1400
const HEIGHT = 900

const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_NO_NOTIFY: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-popups-'))
  }
})
const page = await app.firstWindow()
await app.evaluate(
  ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size.w, size.h),
  { w: WIDTH, h: HEIGHT }
)
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

try {
  await login(app, page)
  for (let i = 0; i < 4; i++) {
    if (i > 0) await page.keyboard.press('Control+Shift+T')
    await page.waitForTimeout(300)
    await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
    await page.waitForTimeout(3000)
  }
  await runPalette(page, 'Yan Yana Yerleştir')
  await page.waitForTimeout(1200)

  const panes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-workspace] > [data-pane]')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 50)
      .map((r) => ({ left: r.left, right: r.right }))
      .sort((a, b) => a.left - b.left)
  )
  for (const [index, label] of [
    [3, 'rightmost'],
    [1, 'middle']
  ]) {
    // Panele tıklanınca etkinleşir; öneri listesi etkin panelde açılır.
    await page.locator('.xterm-screen:visible').nth(index).click()
    await page.keyboard.type('l')
    await page.keyboard.press('Control+Space')
    const popup = page.locator('[data-cursor-popup]')
    await popup.waitFor({ timeout: 5000 })
    await page.waitForTimeout(200)
    const box = await popup.boundingBox()
    const pane = panes[index]
    check(
      `${label} pane: suggestion list stays inside the window`,
      box.x >= 0 && box.x + box.width <= WIDTH && box.y >= 0 && box.y + box.height <= HEIGHT,
      `${Math.round(box.x)}+${Math.round(box.width)}`
    )
    const placement = await popup.evaluate((el) => ({
      inPane: Boolean(el.closest('[data-workspace]')),
      maxWidth: parseFloat(getComputedStyle(el).maxWidth)
    }))
    check(
      `${label} pane: list is drawn outside the pane and limited by the window, not the pane`,
      !placement.inPane && placement.maxWidth >= 500 && placement.maxWidth > pane.right - pane.left,
      `max ${placement.maxWidth} px, pane ${Math.round(pane.right - pane.left)} px`
    )
    await shot(`popups-${label}`)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)
  }
} catch (err) {
  failed = true
  console.log(`FAIL: ${err.message}`)
  await shot('popups-error').catch(() => undefined)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

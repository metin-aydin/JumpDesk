// Paketlenmiş uygulamayı (AppImage ya da kurulu ikili) mock sunucuya karşı dener: açılış, giriş, ağaç, terminal.
// Kullanım: node dev/e2e/packaged.mjs <çalıştırılabilir> <çıktı-klasörü>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const exe = process.argv[2]
const out = process.argv[3] || path.join(os.tmpdir(), 'jumpdesk-packaged-shots')
fs.mkdirSync(out, { recursive: true })
let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${detail}`)
}
const app = await electron.launch({
  executablePath: exe,
  args: [],
  timeout: 60000,
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_DISABLE_WEBGL: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-packaged-'))
  }
})
const page = await app.firstWindow()
try {
  check(
    'packaged app starts',
    true,
    await app.evaluate(
      ({ app }) => `${app.getName()} ${app.getVersion()} packaged=${app.isPackaged}`
    )
  )
  await login(app, page)
  await page.getByRole('tree').waitFor({ timeout: 20000 })
  check('login and server tree', true)
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForFunction(
    () => [...document.querySelectorAll('[role=tab]')].some((t) => t.querySelector('.bg-success')),
    null,
    { timeout: 20000 }
  )
  check('terminal connects', true)
  await page.waitForTimeout(1500)
  // Kabuk kısayolları (Ctrl+R geçmiş araması, Ctrl+_ geri alma) pencere düzeyinde yutulmadan terminale ulaşır.
  // Tuşlar sendInputEvent ile gerçek klavye yolundan (before-input-event) basılır; Playwright'ın tuşları o yolu atlar.
  const sendKey = (keyCode, modifiers) =>
    app.evaluate(
      ({ BrowserWindow }, [keyCode, modifiers]) => {
        const wc = BrowserWindow.getAllWindows()[0].webContents
        wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
        wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
      },
      [keyCode, modifiers]
    )
  const rows = () => page.locator('.xterm-rows').first().innerText()
  await page.locator('.xterm-helper-textarea').first().focus()
  await sendKey('R', ['control'])
  await page.waitForTimeout(800)
  check(
    'Ctrl+R reaches the terminal',
    (await page.locator('[data-history-search]').getAttribute('data-history-search')) ===
      'bck-i-search: _'
  )
  await page.keyboard.press('Control+g')
  await page.keyboard.type('echo undo-check')
  await sendKey('-', ['control', 'shift'])
  await page.waitForTimeout(800)
  check('Ctrl+_ reaches the shell', !(await rows()).includes('echo undo-check'))
  await page.keyboard.press('Control+c')
  const b64 = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  fs.writeFileSync(path.join(out, 'packaged.png'), Buffer.from(b64, 'base64'))
} catch (err) {
  failed = true
  console.log(`FAIL ${err.message}`)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

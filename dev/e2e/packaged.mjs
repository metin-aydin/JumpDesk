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

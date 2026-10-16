// Alarm bekletme: varsayılanlar (bağlantıdan sonra 20 sn, otomatik snippetlerden sonra 10 sn) ve sunucuya bağlanınca
// çalışan snippet varken alarmların snippet gönderildikten 10 sn sonra başlaması. Bağlantı bekleme süresi ayarlardan
// 2 sn yapılır ki snippet bekletmesi ayrıca görülebilsin. Kullanım: node dev/e2e/alarm-warmup.mjs
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importFile, login, writeExportFile } from './helpers.mjs'

let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-warmup-'))
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: process.env.JUMPDESK_SERVER || 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_NO_NOTIFY: '1',
    JUMPDESK_USER_DATA: userData
  }
})
const page = await app.firstWindow()
const alarmRows = () => page.locator('[title="Oturuma Git Ve Satırı Bul"]').allInnerTexts()
const connectedTab = () =>
  page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-tab-strip] [role=tab]')].some((t) =>
        t.querySelector('.bg-success')
      ),
    null,
    { timeout: 20000 }
  )
const type = async (text) => {
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.type(text)
}
try {
  await login(app, page)
  check(
    'no environment override',
    (
      await page.evaluate(() => [window.jumpdesk.alarmWarmupMs, window.jumpdesk.alarmSnippetWaitMs])
    ).every((v) => v === null)
  )

  // Varsayılan süreler Ayarlar → Bildirimler'de; bağlantı bekleme süresi testte 2 sn yapılır.
  await page.keyboard.press('Control+,')
  await page.getByRole('button', { name: 'Bildirimler' }).click()
  const connectWait = page.getByLabel('Bağlantıdan Sonra Bekleme (Saniye)')
  const snippetWait = page.getByLabel('Snippetlerden Sonra Bekleme (Saniye)')
  check(
    'defaults are 20 s and 10 s',
    (await connectWait.inputValue()) === '20' && (await snippetWait.inputValue()) === '10'
  )
  await connectWait.fill('2')
  await page.keyboard.press('Escape')

  await importFile(
    app,
    page,
    writeExportFile(userData, {
      snippets: [{ id: 'warm', name: 'Warm Snip', group: 'Test', command: 'echo WARMSNIP' }]
    })
  )

  // jump-ops için snippeti "bağlanınca çalıştır" yap, oturumu kapat
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick({ timeout: 15000 })
  await connectedTab()
  await page.keyboard.press('Control+Shift+B')
  await page.getByRole('button', { name: 'Snippetler', exact: true }).click()
  await page.getByRole('button', { name: 'Test' }).click()
  const row = page.getByRole('button', { name: /Warm Snip/ })
  await row.hover()
  await row.getByRole('button', { name: 'Bağlanınca Çalıştır' }).click()
  check('auto-run hint', (await page.getByText(/bağlanınca 1 snippet çalışır/).count()) === 1)
  await page.keyboard.press('Control+Shift+W')
  await page.waitForTimeout(500)

  // Yeniden bağlan: snippet gönderilene kadar ve sonrasında 10 sn alarm yok
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
  await connectedTab()
  const connectedAt = Date.now()
  await page.waitForTimeout(5000)
  await type('echo "GateException early"\n')
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Alarmlar', exact: true }).click()
  await page.waitForTimeout(300)
  check(
    'no alarm within 10 s after auto-run snippets (connect wait already over)',
    (await alarmRows()).length === 0,
    (await alarmRows()).join(' / ')
  )
  await page.waitForTimeout(Math.max(0, connectedAt + 16_500 - Date.now()))
  await type('echo "GateException late"\n')
  await page.waitForTimeout(1500)
  const rows = await alarmRows()
  check(
    'alarm after snippets + 10 s',
    rows.length === 1 && rows[0].includes('GateException late'),
    rows.join(' / ')
  )
} catch (err) {
  failed = true
  console.log(`FAIL: ${err.message}`)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

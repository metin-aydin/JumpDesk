// Sekme şeridinde numarayla geçiş: Ctrl+1…9 ve (Windows/Linux) Alt+1…9 şeritteki n. öğeyi seçer, grup tek öğe sayılır,
// 9 son öğedir; Alt+rakam terminale gitmez (bash'te "(arg: n)" görünmez). Kullanım: node dev/e2e/tab-keys.mjs <klasör>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-tab-keys')
fs.mkdirSync(out, { recursive: true })
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_NO_NOTIFY: '1',
    JUMPDESK_DISABLE_WEBGL: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-tab-keys-'))
  }
})
const page = await app.firstWindow()
let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const stripTabs = () => page.locator('[data-tab-strip] [role=tab]')
const selected = async () => {
  const labels = await stripTabs().evaluateAll((tabs) =>
    tabs.map((t) =>
      t.getAttribute('aria-selected') === 'true' ? t.innerText.split('\n')[0] : null
    )
  )
  return labels.findIndex((l) => l !== null)
}
const terminalText = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.xterm-rows')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => e.innerText)
      .join('\n')
  )

try {
  await login(app, page)
  const tree = page.getByRole('tree')
  await tree.getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForTimeout(2500)
  await tree.getByText('Linux', { exact: true }).click()
  await tree.getByText('Prod', { exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Klasördeki \d+ Sunucuya Farklı Bağlan…/ }).hover()
  await page.getByRole('menuitem', { name: 'Tümünü Izgara Şeklinde Açarak Bağlan' }).click()
  await page.waitForTimeout(3000)
  await tree.getByText('Test', { exact: true }).click()
  await tree.getByText('test-01', { exact: true }).dblclick()
  await page.waitForTimeout(2500)

  const count = await stripTabs().count()
  const groups = await page.getByRole('tab', { name: /^Bölünmüş görünüm/ }).count()
  check(
    'strip has single tabs and a group',
    count >= 3 && groups === 1,
    `${count} öğe, ${groups} grup`
  )

  for (const [mod, label] of [
    ['Control', 'Ctrl'],
    ['Alt', 'Alt']
  ]) {
    const order = []
    for (let n = 1; n <= Math.min(count, 8); n++) {
      await page.keyboard.press(`${mod}+Digit${n}`)
      await page.waitForTimeout(250)
      order.push(await selected())
    }
    check(
      `${label}+1…${Math.min(count, 8)} selects strip items in order (group counts once)`,
      order.every((i, k) => i === k),
      order.join(', ')
    )
    await page.keyboard.press(`${mod}+Digit1`)
    await page.waitForTimeout(250)
    await page.keyboard.press(`${mod}+Digit9`)
    await page.waitForTimeout(250)
    check(`${label}+9 selects the last item`, (await selected()) === count - 1)
  }

  // Alt+rakam kabuğa ulaşmaz (bash'te Alt+1 sayısal argüman başlatır: "(arg: 1)")
  await page.keyboard.press('Alt+Digit1')
  await page.waitForTimeout(300)
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.press('Alt+Digit1')
  await page.waitForTimeout(600)
  check('Alt+digit does not reach the terminal', !/\(arg: \d\)/.test(await terminalText()))
} catch (err) {
  failed = true
  console.log(`FAIL ${err.message.split('\n')[0]}`)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

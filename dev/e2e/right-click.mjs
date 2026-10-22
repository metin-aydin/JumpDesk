// Terminalde sağ tık: seçim yoksa panodakini yapıştırır (çalıştırmaz), seçim varsa kopyalar ve seçimi kaldırır; fare
// izleme kipindeki programlar sağ tıkı kendisi alır, Shift+sağ tık yine yapıştırır. Ctrl+Shift+V metni bir kez yapıştırır.
// Oturum kapanınca "Yeniden bağlan" çubuğu terminalin altında yer alır (komut satırının üstüne binmez) ve tıklanabilir.
// Kullanım: node dev/e2e/right-click.mjs <klasör> (mock açıkken)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-right-click')
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
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-right-click-'))
  }
})
const page = await app.firstWindow()
let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const rows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.xterm-rows')]
      .find((e) => e.getBoundingClientRect().width > 0)
      .innerText.split('\n')
      .map((l) => l.replace(/\u00a0/g, ' ').trimEnd())
  )
const promptLine = async () => (await rows()).filter((l) => l.trim()).at(-1) ?? ''
const setClipboard = (text) => app.evaluate(({ clipboard }, t) => clipboard.writeText(t), text)
const getClipboard = () => app.evaluate(({ clipboard }) => clipboard.readText())

try {
  await login(app, page)
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForTimeout(3000)
  const screen = page.locator('.xterm-screen:visible').first()
  const box = await screen.boundingBox()
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

  // 1. Seçim yokken sağ tık yapıştırır, komutu çalıştırmaz
  await setClipboard('echo SAG_TIK_OK')
  await page.mouse.click(center.x, center.y, { button: 'right' })
  await page.waitForTimeout(600)
  const afterPaste = await promptLine()
  check(
    'right-click pastes the clipboard without running it',
    afterPaste.endsWith('echo SAG_TIK_OK') && !(await rows()).includes('SAG_TIK_OK'),
    afterPaste
  )
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  check('pasted command runs after Enter', (await rows()).includes('SAG_TIK_OK'))

  // 2. Seçim varken sağ tık kopyalar, seçimi kaldırır ve yapıştırmaz
  const word = await page.evaluate(() => {
    const container = [...document.querySelectorAll('.xterm-rows')].find(
      (e) => e.getBoundingClientRect().width > 0
    )
    const row = [...container.children].find((r) => r.textContent.trim() === 'SAG_TIK_OK')
    const r = row.getBoundingClientRect()
    return { x: r.left + 20, y: r.top + r.height / 2 }
  })
  await page.mouse.dblclick(word.x, word.y)
  await page.waitForTimeout(300)
  await setClipboard('ESKI_PANO')
  const before = await promptLine()
  await page.mouse.click(center.x, center.y, { button: 'right' })
  await page.waitForTimeout(600)
  const copied = await getClipboard()
  const selectionLeft = await page.evaluate(
    () => document.querySelectorAll('.xterm-selection div').length
  )
  check(
    'right-click with a selection copies it and clears the selection',
    copied === 'SAG_TIK_OK' && selectionLeft === 0,
    `${copied} / ${selectionLeft} seçim öğesi`
  )
  check('copying does not paste', (await promptLine()) === before, await promptLine())

  // 3. Fare izleme kipinde (vim, mc, htop) sağ tık programa kalır; Shift+sağ tık yapıştırır
  await page.keyboard.type("printf '\\e[?1000h'\n")
  await page.waitForTimeout(500)
  await setClipboard('echo FARE_MODU')
  await page.mouse.click(center.x, center.y, { button: 'right' })
  await page.waitForTimeout(500)
  check('mouse-tracking programs keep the right-click', !(await promptLine()).includes('FARE_MODU'))
  await page.keyboard.down('Shift')
  await page.mouse.click(center.x, center.y, { button: 'right' })
  await page.keyboard.up('Shift')
  await page.waitForTimeout(500)
  check('Shift+right-click still pastes', (await promptLine()).includes('echo FARE_MODU'))
  await page.keyboard.press('Control+C')
  await page.keyboard.type("printf '\\e[?1000l'\n")
  await page.waitForTimeout(300)

  // 4. Ctrl+Shift+V panodakini bir kez yapıştırır
  await setClipboard('echo TEK_YAPISTIR')
  await page.keyboard.press('Control+Shift+V')
  await page.waitForTimeout(600)
  const pasted = await promptLine()
  check(
    'Ctrl+Shift+V pastes the clipboard once',
    pasted.endsWith('echo TEK_YAPISTIR') && pasted.split('TEK_YAPISTIR').length === 2,
    pasted
  )
  await page.keyboard.press('Control+U')

  // 5. Oturum kapanınca çubuk terminalin altında durur, terminal yukarı daralır ve düğme tıklanabilir
  await page.keyboard.type('exit\n')
  const bar = page.getByRole('button', { name: 'Yeniden bağlan' })
  await bar.waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
  const layout = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Yeniden bağlan'
    )
    const strip = button.parentElement.getBoundingClientRect()
    const screen = [...document.querySelectorAll('.xterm-screen')]
      .find((e) => e.getBoundingClientRect().width > 0)
      .getBoundingClientRect()
    const b = button.getBoundingClientRect()
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    return { stripTop: strip.top, screenBottom: screen.bottom, clickable: button.contains(hit) }
  })
  check(
    'closed-session bar sits below the terminal and is clickable',
    layout.screenBottom <= layout.stripTop + 0.5 && layout.clickable,
    JSON.stringify(layout)
  )
  await bar.click()
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('button')].some(
        (b) => b.textContent.trim() === 'Yeniden bağlan'
      ),
    null,
    { timeout: 10000 }
  )
  check('reconnect button reconnects', true)
} catch (err) {
  failed = true
  console.log(`FAIL ${err.message.split('\n')[0]}`)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

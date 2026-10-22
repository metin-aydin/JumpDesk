// Autocomplete'in satır içi önizlemesi: seçili önerinin devamı komut satırında imleçten başlayarak soluk görünür, ok
// tuşlarıyla seçim değişince önizleme de değişir, Tab kabul eder; önizleme terminal tamponuna yazılmaz.
// Kullanım: node dev/e2e/autocomplete.mjs <klasör> (mock açıkken)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-autocomplete')
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
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-autocomplete-'))
  }
})
const page = await app.firstWindow()
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
const rows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.xterm-rows')]
      .find((e) => e.getBoundingClientRect().width > 0)
      .innerText.split('\n')
      .map((l) => l.replace(/ /g, ' ').trimEnd())
  )
const promptLine = async () => (await rows()).filter((l) => l.trim()).at(-1) ?? ''
/** Önizleme metni, ilk karakterinin konumu, imlecin konumu ve seçili önerinin etiketi. */
const state = () =>
  page.evaluate(() => {
    const ghost = document.querySelector('[data-ghost-text]')
    const first = ghost?.querySelector('span')?.getBoundingClientRect()
    const cursor = document.querySelector('.xterm-rows .xterm-cursor')?.getBoundingClientRect()
    const selected = document.querySelector('[role=listbox] [role=option][aria-selected=true]')
    return {
      ghost: ghost?.getAttribute('data-ghost-text') ?? null,
      ghostAt: first ? { x: first.left, y: first.top } : null,
      cursorAt: cursor ? { x: cursor.left, y: cursor.top } : null,
      selected: selected?.querySelector('.font-mono')?.textContent ?? null
    }
  })

try {
  await login(app, page)
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForTimeout(3500)
  await page.locator('.xterm').first().click()

  // 1. Öneri açılınca ilk seçeneğin devamı imleçten başlayarak soluk görünür
  await page.keyboard.type('sys')
  await page.waitForTimeout(900)
  const first = await state()
  check(
    'selected suggestion previews its remainder inline',
    Boolean(first.ghost) && first.selected === `sys${first.ghost}`,
    JSON.stringify(first)
  )
  check(
    'preview starts at the cursor cell',
    first.ghostAt &&
      first.cursorAt &&
      Math.abs(first.ghostAt.x - first.cursorAt.x) < 1 &&
      Math.abs(first.ghostAt.y - first.cursorAt.y) < 1,
    JSON.stringify({ ghost: first.ghostAt, cursor: first.cursorAt })
  )
  check('preview is not written to the terminal', (await promptLine()).endsWith('sys'))
  await shot('autocomplete-01-preview')

  // 2. Aşağı ok seçimi değiştirir, önizleme de değişir
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  const second = await state()
  check(
    'arrow keys move the preview with the selection',
    second.ghost !== first.ghost && second.selected === `sys${second.ghost}`,
    JSON.stringify(second)
  )
  await shot('autocomplete-02-arrow')

  // 3. Tab önizlenen metni yazar, önizleme kalkar
  await page.keyboard.press('Tab')
  await page.waitForTimeout(700)
  const accepted = await promptLine()
  check('Tab writes the previewed text', accepted.endsWith(`sys${second.ghost}`), accepted)

  // 4. Esc önizlemeyi kaldırır; satır silinince önizleme kalmaz
  await page.keyboard.press('Control+U')
  await page.waitForTimeout(300)
  await page.keyboard.type('sys')
  await page.waitForTimeout(900)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Escape removes the preview', (await state()).ghost === null)
  await page.keyboard.press('Control+U')
  await page.waitForTimeout(600)
  check('cleared line has no preview', (await state()).ghost === null)
} catch (err) {
  failed = true
  console.log(`FAIL ${err.message.split('\n')[0]}`)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

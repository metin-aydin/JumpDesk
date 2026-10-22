// Autocomplete'in satır içi önizlemesi: seçili önerinin devamı komut satırında imleçten başlayarak soluk görünür, ok
// tuşlarıyla seçim değişince önizleme de değişir; Tab kabuğa gider, → kabul eder, Ctrl+→ bir sonraki / işaretine kadar
// kabul eder (liste açık ve aynı öneri seçili kalır); önizleme terminal tamponuna yazılmaz. Çift Tab dosya kipini açar:
// bulunulan klasörün girdileri listelenir, klasör kabul edilince içi (kabuktan istenerek) listelenir, Esc kapatır.
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
    const listbox = document.querySelector('[role=listbox]')
    return {
      folder: listbox?.previousElementSibling?.querySelector('.font-mono')?.textContent ?? null,
      options: [...document.querySelectorAll('[role=listbox] [role=option] .font-mono')].map(
        (e) => e.textContent
      ),
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

  // 3. Tab öneriyi kabul etmez (kabuğa gider); → önizlenen metni yazar
  await page.keyboard.press('Tab')
  await page.waitForTimeout(700)
  const afterTab = await promptLine()
  check(
    'Tab does not accept the suggestion',
    afterTab.endsWith('sys') && (await state()).ghost === second.ghost,
    afterTab
  )
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(700)
  const accepted = await promptLine()
  check('→ writes the previewed text', accepted.endsWith(`sys${second.ghost}`), accepted)

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

  // 5. Ctrl+→ bir sonraki / işaretine kadar kabul eder; aynı öneri seçili kalır, son parça tamamını yazar
  await page.keyboard.type('echo /tmp/abc/123\n')
  await page.waitForTimeout(900)
  await page.keyboard.type('echo /t')
  await page.waitForTimeout(900)
  const steps = []
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Control+ArrowRight')
    await page.waitForTimeout(800)
    steps.push({ line: await promptLine(), ...(await state()) })
  }
  check(
    'Ctrl+→ accepts up to the next /',
    steps[0].line.endsWith('echo /tmp/') &&
      steps[0].ghost === 'abc/123' &&
      steps[0].selected === 'echo /tmp/abc/123',
    JSON.stringify(steps[0])
  )
  check(
    'Ctrl+→ again accepts the next part',
    steps[1].line.endsWith('echo /tmp/abc/') && steps[1].ghost === '123',
    JSON.stringify(steps[1])
  )
  check(
    'last part is accepted whole and the list closes',
    steps[2].line.endsWith('echo /tmp/abc/123') && steps[2].ghost === null,
    JSON.stringify(steps[2])
  )
  await page.keyboard.press('Control+U')
  await page.waitForTimeout(400)

  // 6. Çift Tab: bulunulan klasörün girdileri (önce klasörler, gizliler yok); kabuğun kendi listesi basılmaz
  await page.keyboard.type('cat ')
  await page.waitForTimeout(500)
  const rowsBefore = (await rows()).filter((l) => l.trim()).length
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(800)
  const files = await state()
  check(
    'double Tab lists the current folder',
    files.folder === './' &&
      files.options.includes('logs/') &&
      files.options.includes('notes.txt') &&
      files.options.indexOf('logs/') < files.options.indexOf('notes.txt') &&
      !files.options.some((o) => o.startsWith('.')),
    JSON.stringify(files.options)
  )
  check(
    'second Tab is not sent to the shell',
    (await rows()).filter((l) => l.trim()).length === rowsBefore &&
      (await promptLine()).endsWith('cat'),
    await promptLine()
  )
  await shot('autocomplete-03-files')

  // 7. Klasör kabul edilince içi listelenir, yazdıkça süzülür
  while ((await state()).selected !== 'logs/') {
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(100)
  }
  await page.keyboard.press('ArrowRight')
  let inside = await state()
  for (let i = 0; i < 20 && !inside.options.includes('logs/app.log'); i++) {
    await page.waitForTimeout(200)
    inside = await state()
  }
  check(
    'accepting a folder lists what is inside',
    (await promptLine()).endsWith('cat logs/') &&
      inside.folder === 'logs/' &&
      inside.options.includes('logs/app.log'),
    JSON.stringify(inside)
  )
  await shot('autocomplete-04-subfolder')
  await page.keyboard.type('a')
  await page.waitForTimeout(600)
  const filtered = await state()
  check(
    'typing filters the folder entries',
    filtered.options.length > 0 && filtered.options.every((o) => o.startsWith('logs/a')),
    JSON.stringify(filtered.options)
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Escape leaves the file mode', (await state()).folder === null)
  await page.keyboard.press('Control+U')
} catch (err) {
  failed = true
  console.log(`FAIL ${err.message.split('\n')[0]}`)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

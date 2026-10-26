// Ctrl+R geçmiş araması (bash'te zsh'deki gibi): arama satırı komut satırının altında, imleç komut satırında eşleşmenin
// başında; geri silme bir adım döner, tümü silinince başarısız sayılmaz; Ctrl+G geri alır, Enter çalıştırır, oklar
// aramayı bitirip satırda çalışır; komut satırı ekranın altındaysa ekran bir satır kayar; boş Ctrl+R son aramayı
// yineler. Kullanım: node dev/e2e/history-search.mjs <klasör> (mock açıkken)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-history-search')
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
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-history-search-'))
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
/** Ekrandaki satırlar, imlecin satırı/sütunu, arama satırı (metin, satır) ve altı çizili hücrelerin sütunları. */
const state = () =>
  page.evaluate(() => {
    const rowsEl = [...document.querySelectorAll('.xterm-rows')].find(
      (e) => e.getBoundingClientRect().width > 0
    )
    const rowEls = [...rowsEl.children]
    const rows = rowEls.map((r) => r.textContent.replace(/ /g, ' ').trimEnd())
    const cursor = rowsEl.querySelector('.xterm-cursor')
    const cursorRow = rowEls.findIndex((r) => r.contains(cursor))
    const box = rowsEl.getBoundingClientRect()
    const line = document.querySelector('[data-history-search]')
    const cell =
      line?.querySelector('span')?.getBoundingClientRect().width ||
      cursor?.getBoundingClientRect().width ||
      1
    const col = (el) => Math.round((el.getBoundingClientRect().left - box.left) / cell)
    return {
      rows,
      rowCount: rowEls.length,
      cursorRow,
      cursorCol: cursor ? col(cursor) : -1,
      search: line?.getAttribute('data-history-search') ?? null,
      searchRow: line ? Number(line.getAttribute('data-row')) : -1,
      marks: [...document.querySelectorAll('[data-history-search-mark]')]
        .map(col)
        .sort((a, b) => a - b),
      popup: document.querySelectorAll('[role=listbox]').length
    }
  })
const commandLine = (s) => s.rows[s.cursorRow] ?? ''
const waitFor = async (fn, ms = 4000) => {
  const end = Date.now() + ms
  let s = await state()
  while (!fn(s) && Date.now() < end) {
    await page.waitForTimeout(100)
    s = await state()
  }
  return s
}
const run = async (command) => {
  await page.keyboard.type(command)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
}

try {
  await login(app, page)
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForTimeout(3500)
  await page.locator('.xterm').first().click()
  await run('echo alpha-one')
  await run('echo beta-two')
  await run('echo alpha-three')
  await run('clear')
  const before = await state()
  const prompt = commandLine(before)

  // 1. Ctrl+R: arama satırı altta, imleç komut satırında
  await page.keyboard.press('Control+r')
  let s = await waitFor((x) => x.search !== null)
  check('Ctrl+R shows the search line', s.search === 'bck-i-search: _', s.search)
  check(
    'search line is below the command line, cursor stays on the command line',
    s.searchRow === s.cursorRow + 1 && s.cursorRow === before.cursorRow,
    `arama ${s.searchRow}, imleç ${s.cursorRow} (önce ${before.cursorRow})`
  )
  check('search line is not written to the terminal', !s.rows.some((r) => r.includes('i-search')))

  // 2. Yazınca en yeni eşleşme komut satırında, imleç eşleşmenin başında, eşleşme altı çizili
  await page.keyboard.type('alpha')
  s = await waitFor((x) => commandLine(x).endsWith('echo alpha-three') && x.marks.length === 5)
  check(
    'typing shows the newest match on the command line',
    commandLine(s).endsWith('echo alpha-three'),
    commandLine(s)
  )
  check('status shows the search text', s.search === 'bck-i-search: alpha_', s.search)
  check(
    'match is underlined and the cursor is at its start',
    s.marks.length === 5 && s.cursorCol === s.marks[0],
    JSON.stringify({ marks: s.marks, cursor: s.cursorCol })
  )
  check('no suggestion list while searching', s.popup === 0)
  await shot('01-search')

  // 3. Ctrl+R daha eski eşleşme; geri silme bir adım geri döner
  await page.keyboard.press('Control+r')
  s = await waitFor((x) => commandLine(x).endsWith('echo alpha-one'))
  check('Ctrl+R moves to an older match', commandLine(s).endsWith('echo alpha-one'), commandLine(s))
  await page.keyboard.press('Backspace')
  s = await waitFor((x) => commandLine(x).endsWith('echo alpha-three'))
  check(
    'backspace steps back to the previous match',
    commandLine(s).endsWith('echo alpha-three') && s.search === 'bck-i-search: alpha_',
    `${commandLine(s)} | ${s.search}`
  )

  // 4. Hepsi silinince başlangıçtaki satıra dönülür, başarısız sayılmaz
  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace')
  s = await waitFor((x) => x.search === 'bck-i-search: _' && commandLine(x) === prompt)
  check(
    'deleting the whole search returns to the original line, not failing',
    s.search === 'bck-i-search: _' && commandLine(s) === prompt,
    `${JSON.stringify(commandLine(s))} | ${s.search}`
  )

  // 5. Eşleşme yoksa "failing", silince düzelir
  await page.keyboard.type('zzz')
  s = await waitFor((x) => x.search?.startsWith('failing'))
  check('no match shows failing', s.search === 'failing bck-i-search: zzz_', s.search)
  for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace')
  s = await waitFor((x) => x.search === 'bck-i-search: _')
  check('deleting a failing search clears it', s.search === 'bck-i-search: _', s.search)

  // 6. Enter eşleşen komutu çalıştırır
  await page.keyboard.type('beta')
  await waitFor((x) => commandLine(x).endsWith('echo beta-two'))
  await page.keyboard.press('Enter')
  s = await waitFor((x) => x.search === null && x.rows.some((r) => r === 'beta-two'))
  check(
    'Enter runs the match and closes the search',
    s.search === null && s.rows.some((r) => r === 'beta-two')
  )
  await page.waitForTimeout(400)

  // 7. Ctrl+G aramayı bırakır, satır eski hâline döner
  await page.keyboard.press('Control+r')
  await page.keyboard.type('alpha')
  await waitFor((x) => commandLine(x).endsWith('echo alpha-three'))
  await page.keyboard.press('Control+g')
  s = await waitFor((x) => x.search === null && commandLine(x) === prompt)
  check(
    'Ctrl+G restores the original line',
    s.search === null && commandLine(s) === prompt,
    JSON.stringify(commandLine(s))
  )

  // 8. Ok tuşu aramayı bitirir ve satırda çalışır
  await page.keyboard.press('Control+r')
  await page.keyboard.type('three')
  s = await waitFor((x) => commandLine(x).endsWith('echo alpha-three') && x.marks.length === 5)
  const matchCol = s.marks[0]
  await page.keyboard.press('ArrowLeft')
  s = await waitFor((x) => x.search === null)
  await page.waitForTimeout(300)
  s = await state()
  check(
    'arrow key ends the search and moves the cursor on the kept line',
    s.search === null &&
      commandLine(s).endsWith('echo alpha-three') &&
      s.cursorCol === matchCol - 1,
    JSON.stringify({ line: commandLine(s), cursor: s.cursorCol, matchCol })
  )
  await page.keyboard.press('Control+c')
  await page.waitForTimeout(400)

  // 9. Boş aramada Ctrl+R son aramayı yineler
  await page.keyboard.press('Control+r')
  await page.keyboard.press('Control+r')
  s = await waitFor((x) => x.search === 'bck-i-search: three_')
  check('empty Ctrl+R repeats the last search', s.search === 'bck-i-search: three_', s.search)
  await page.keyboard.press('Control+g')
  await waitFor((x) => x.search === null)

  // 10. Komut satırı ekranın altındayken arama satırına yer açılır
  await run('seq 1 200')
  const bottom = await state()
  await page.keyboard.press('Control+r')
  s = await waitFor((x) => x.search !== null && x.searchRow === x.cursorRow + 1)
  check(
    'at the bottom the screen scrolls one line for the search line',
    bottom.cursorRow === bottom.rowCount - 1 &&
      s.searchRow === s.rowCount - 1 &&
      s.cursorRow === s.rowCount - 2 &&
      commandLine(s) === prompt,
    JSON.stringify({
      before: bottom.cursorRow,
      rows: s.rowCount,
      cursor: s.cursorRow,
      search: s.searchRow
    })
  )
  await shot('02-bottom')
  await page.keyboard.press('Escape')
  s = await waitFor((x) => x.search === null)
  check('Esc ends the search', s.search === null && commandLine(s) === prompt)
} catch (err) {
  failed = true
  console.log(`FAIL ${err.stack}`)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

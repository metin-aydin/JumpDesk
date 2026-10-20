// Numarayla geçiş: Ctrl+1…9 şeritteki n. sekmeyi seçer (grup tek öğe, 9 son sekme); Alt+1…9 etkin gruptaki n. paneli
// seçer (9 son panel, büyütülmüş grupta büyütme taşınır) ve terminale gitmez; tek sekmede Alt+rakam terminale gider
// (bash: "(arg: n)"). Kullanım: node dev/e2e/tab-keys.mjs <klasör>
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

  // Ctrl+rakam: şeritteki sekmeler (grup tek öğe), 9 son sekme
  const order = []
  for (let n = 1; n <= Math.min(count, 8); n++) {
    await page.keyboard.press(`Control+Digit${n}`)
    await page.waitForTimeout(250)
    order.push(await selected())
  }
  check(
    `Ctrl+1…${Math.min(count, 8)} selects strip items in order (group counts once)`,
    order.every((i, k) => i === k),
    order.join(', ')
  )
  await page.keyboard.press('Control+Digit1')
  await page.waitForTimeout(250)
  await page.keyboard.press('Control+Digit9')
  await page.waitForTimeout(250)
  check('Ctrl+9 selects the last item', (await selected()) === count - 1)

  // Alt+rakam: etkin gruptaki paneller (soldan sağa, yukarıdan aşağı), 9 son panel; tuş terminale gitmez
  const groupIndex = (
    await stripTabs().evaluateAll((tabs) => tabs.map((t) => t.getAttribute('aria-label') ?? ''))
  ).findIndex((l) => l.startsWith('Bölünmüş görünüm'))
  await page.keyboard.press(`Control+Digit${groupIndex + 1}`)
  await page.waitForTimeout(400)
  const panes = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-workspace] > [data-pane]')]
        .map((p) => ({ id: p.dataset.pane, r: p.getBoundingClientRect() }))
        .filter((p) => p.r.width > 0)
        .sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left)
        .map((p) => p.id)
    )
  const focusedPane = () =>
    page.evaluate(
      () => document.querySelector('[data-focus-frame]')?.parentElement.dataset.paneFrame
    )
  const paneOrder = await panes()
  const reached = []
  for (let n = 1; n <= Math.min(paneOrder.length, 8); n++) {
    await page.keyboard.press(`Alt+Digit${n}`)
    await page.waitForTimeout(250)
    reached.push(paneOrder.indexOf(await focusedPane()))
  }
  check(
    `Alt+1…${reached.length} focuses the group's panes in order`,
    paneOrder.length >= 2 && reached.every((i, k) => i === k) && (await selected()) === groupIndex,
    reached.join(', ')
  )
  await page.keyboard.press('Alt+Digit1')
  await page.waitForTimeout(250)
  await page.keyboard.press('Alt+Digit9')
  await page.waitForTimeout(250)
  check('Alt+9 focuses the last pane', (await focusedPane()) === paneOrder[paneOrder.length - 1])
  check(
    'Alt+digit in a group does not reach the terminal',
    !/\(arg: \d\)/.test(await terminalText())
  )

  // Büyütülmüş grupta Alt+rakam büyütmeyi hedef panele taşır
  await page.keyboard.press('Alt+Digit1')
  await page.waitForTimeout(250)
  await page.keyboard.press('Control+Shift+Enter')
  await page.waitForTimeout(400)
  await page.keyboard.press('Alt+Digit2')
  await page.waitForTimeout(400)
  const zoomed = await panes()
  check(
    'Alt+digit in a zoomed group zooms the target pane',
    zoomed.length === 1 && zoomed[0] === paneOrder[1],
    `${zoomed.length} panel`
  )
  await page.keyboard.press('Control+Shift+Enter')
  await page.waitForTimeout(300)

  // Tek sekmede Alt+rakam kısayol değildir, terminale gider (bash: "(arg: 1)")
  const single = (
    await stripTabs().evaluateAll((tabs) => tabs.map((t) => t.getAttribute('aria-label') ?? ''))
  ).findIndex((l) => !l.startsWith('Bölünmüş görünüm'))
  await page.keyboard.press(`Control+Digit${single + 1}`)
  await page.waitForTimeout(400)
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.press('Alt+Digit1')
  await page.waitForTimeout(600)
  check(
    'Alt+digit outside a group goes to the terminal',
    (await selected()) === single && /\(arg: 1\)/.test(await terminalText())
  )
} catch (err) {
  failed = true
  console.log(`FAIL ${err.message.split('\n')[0]}`)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

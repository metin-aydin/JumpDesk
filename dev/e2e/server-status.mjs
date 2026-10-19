// Sunucu durumu şeridi: varsayılan kapalı, ayardan açılır; açık oturumda tam genişlikteki düğme onayla yeniden bağlanarak
// başlatır, yeni oturumda kendiliğinden gelir; şeritle terminal arasında boşluk kalmaz; dar panelde çipler kayar
// (tekerlek, yalnız fare üzerindeyken görünen ince gösterge), açık kalma süresi sabit kalır; her çip kendi kartını açar
// (CPU/bellek geçmişi ve en çok kullanan işlemler, en büyük disk, çekirdek başına kullanım); kart sabit genişlikte ve
// pencerenin içinde açılır; tam ekran program (less) öndeyken ölçüm durur. Terminal metni okunabilsin diye DOM
// çizicide çalışır. Kullanım: node dev/e2e/server-status.mjs <klasör> (mock açıkken)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login, runPalette } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-server-status')
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
    JUMPDESK_DISABLE_WEBGL: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-status-'))
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
const strips = () => page.locator('[data-server-status]:visible')
const terminalText = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.xterm-rows')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => e.innerText)
      .join('\n')
  )
const openJumpOps = async () => {
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForTimeout(3500)
}
const setEnabled = async (on) => {
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Sunucu Durumu', exact: true }).click()
  const toggle = dialog.getByRole('switch', { name: 'Sunucu Durum Şeridi' })
  if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click()
  await page.waitForTimeout(200)
  if (on) await shot('status-00-settings')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden', timeout: 5000 })
}

try {
  await login(app, page)

  // 1. Varsayılan kapalı: şerit yok, sunucuda ölçüm başlatılmaz
  await openJumpOps()
  check('strip hidden by default', (await page.locator('[data-server-status]').count()) === 0)
  check(
    'no start button while disabled',
    (await page.getByRole('button', { name: 'Durumu Göster' }).count()) === 0
  )

  // 2. Ayar açılınca açık oturumda tam genişlikteki düğme yeniden bağlanmayı sorar; Evet yeniden bağlar ve ölçüm başlar
  await setEnabled(true)
  const startButton = page.getByRole('button', { name: 'Durumu Göster' })
  await startButton.waitFor({ timeout: 5000 })
  const startWidth = await startButton.evaluate((el) => ({
    button: Math.round(el.getBoundingClientRect().width),
    pane: Math.round(el.parentElement.getBoundingClientRect().width)
  }))
  check(
    'start button spans the session width',
    startWidth.button === startWidth.pane,
    JSON.stringify(startWidth)
  )
  const reconnectText = page.getByText('Sunucu durumu yeni bağlantıyla başlar.', { exact: false })
  await startButton.click()
  await reconnectText.waitFor({ timeout: 3000 })
  await page.waitForTimeout(300)
  await shot('status-00b-confirm')
  await page.getByRole('button', { name: 'Hayır' }).click()
  await page.waitForTimeout(500)
  check(
    'answering no keeps the session',
    (await startButton.count()) === 1 &&
      (await page.locator('[data-server-status]').count()) === 0 &&
      /root@jump-ops/.test(await terminalText())
  )
  await startButton.click()
  await reconnectText.waitFor({ timeout: 3000 })
  await page.getByRole('button', { name: 'Evet' }).click()
  await strips().first().waitFor({ timeout: 15000 })
  check('answering yes reconnects and starts the strip', true)
  await page.waitForFunction(
    () => /CPU\s*\d+%/.test(document.querySelector('[data-server-status]')?.textContent ?? ''),
    null,
    { timeout: 10000 }
  )
  const stripText = await strips().first().innerText()
  check(
    'chips show cpu, ram, disk, load',
    /CPU\s*\d+%/.test(stripText) &&
      /RAM\s*\d+%/.test(stripText) &&
      /Disk/.test(stripText) &&
      /Load/.test(stripText),
    stripText.replace(/\s+/g, ' ')
  )
  check('uptime shown on the right', /\d+ (gün|sa|dk)/.test(stripText))
  // Çip değeri sabit genişlikte: tek, çift ve üç haneli değerlerde çip boyu aynı kalır
  const chipWidths = await strips()
    .first()
    .evaluate((strip) =>
      [...strip.querySelectorAll('[data-chip-value]')].map((value) => {
        const chip = value.closest('button')
        const original = value.textContent
        const widths = ['8%', '88%', '100%', '…', '1,56', '12,34'].map((text) => {
          value.textContent = text
          return chip.getBoundingClientRect().width
        })
        value.textContent = original
        return widths
      })
    )
  check(
    'chip widths do not change with the number of digits',
    chipWidths.length === 4 && chipWidths.every((w) => w.every((x) => x === w[0])),
    JSON.stringify(chipWidths)
  )
  const gap = await page.evaluate(() => {
    const strip = document.querySelector('[data-server-status]').getBoundingClientRect()
    const screen = [...document.querySelectorAll('.xterm-screen')]
      .find((e) => e.getBoundingClientRect().width > 0)
      .getBoundingClientRect()
    return Math.round(screen.top - strip.bottom)
  })
  check('terminal starts right below the strip', gap >= 0 && gap <= 3, `${gap}px`)
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.type('jobs; echo JOBS-END\n')
  await page.waitForTimeout(800)
  const afterJobs = await terminalText()
  check(
    'reporter not in job table and no job messages',
    !/\[\d+\]\s+\d+/.test(afterJobs) && /JOBS-END/.test(afterJobs) && !/Running/.test(afterJobs)
  )
  await shot('status-01-single')

  // 3. Yeni oturumlar kendiliğinden başlar; dört oturum yan yana dar panellerde
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Control+Shift+T')
    await page.waitForTimeout(300)
    await openJumpOps()
  }
  await runPalette(page, 'Yan Yana Yerleştir')
  await page.waitForTimeout(1500)
  await page.waitForFunction(
    () => document.querySelectorAll('[data-server-status]').length >= 4,
    null,
    { timeout: 15000 }
  )
  check(
    'new sessions start automatically',
    (await strips().count()) === 4,
    `${await strips().count()} şerit`
  )

  // 4. Dar panel: çipler kayar, gösterge ince ve yer kaplamaz, açık kalma süresi sabit
  const scroll = page.locator('[data-status-scroll]:visible').first()
  const metrics = await scroll.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    stripHeight: el.closest('[data-server-status]').getBoundingClientRect().height
  }))
  check(
    'chips overflow in a narrow pane',
    metrics.scrollWidth > metrics.clientWidth,
    JSON.stringify(metrics)
  )
  check(
    'strip keeps its height (scrollbar takes no space)',
    Math.round(metrics.stripHeight) === 24,
    `${metrics.stripHeight}`
  )
  const thumb = await scroll.evaluate((el) => {
    const t = el.parentElement.querySelector('[aria-hidden]')
    return t ? Math.round(t.getBoundingClientRect().height) : null
  })
  check('thin scroll indicator', thumb !== null && thumb <= 3, `${thumb}`)
  const thumbOpacity = () =>
    scroll.evaluate(
      (el) => getComputedStyle(el.parentElement.querySelector('[aria-hidden]')).opacity
    )
  await page.mouse.move(5, HEIGHT - 5)
  await page.waitForTimeout(300)
  const hiddenOpacity = await thumbOpacity()
  const box = await scroll.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(300)
  const hoverOpacity = await thumbOpacity()
  check(
    'scroll indicator shows only on hover',
    hiddenOpacity === '0' && hoverOpacity === '1',
    `${hiddenOpacity} → ${hoverOpacity}`
  )
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(300)
  const scrolled = await scroll.evaluate((el) => el.scrollLeft)
  check('mouse wheel scrolls the chips sideways', scrolled > 0, `${scrolled}`)
  const uptime = await scroll.evaluate((el) => {
    const strip = el.closest('[data-server-status]')
    const u = strip.lastElementChild.getBoundingClientRect()
    const s = strip.getBoundingClientRect()
    return {
      visible:
        u.width > 0 && u.right <= s.right + 1 && u.left >= el.getBoundingClientRect().right - 1
    }
  })
  check('uptime stays fixed outside the scrolled area', uptime.visible)
  await shot('status-02-narrow')

  // 5. Her çip kendi ayrıntısını açar; kart sabit genişlikte ve dar panelde pencerenin içinde
  const expectations = [
    ['cpu', /CPU/, /Ortalama|Geçmiş birikiyor/],
    ['mem', /Bellek/, /GB/],
    ['disk', /Diskler/, /\//],
    ['load', /Yük/, /Çekirdek başına kullanım/]
  ]
  // Sahte sunucunun kabuğu bu makinede çalışır: çekirdek sayısı buradan gelir.
  const cpuCount = os.cpus().length
  for (const [index, [focus, title, detail]] of expectations.entries()) {
    const chip = scroll.getByRole('button').nth(index)
    await chip.scrollIntoViewIfNeeded()
    await chip.click()
    const card = page.locator(`[data-server-status-card="${focus}"]`)
    await card.waitFor({ timeout: 5000 })
    // Kart küçükten büyüyerek açılır; ölçü açılış bitince alınır.
    await page.waitForTimeout(400)
    const cardBox = await card.locator('xpath=..').boundingBox()
    const text = await card.innerText()
    check(
      `${focus} chip opens its own details`,
      title.test(text) && detail.test(text) && /sn önce/.test(text),
      text.replace(/\s+/g, ' ').slice(0, 80)
    )
    check(
      `${focus} card has a fixed width and is not clipped`,
      Math.round(cardBox.width) === 320 && cardBox.x >= 0 && cardBox.x + cardBox.width <= WIDTH,
      `${Math.round(cardBox.x)}+${Math.round(cardBox.width)}`
    )
    if (focus === 'cpu') {
      await page.waitForTimeout(6000)
      check(
        'cpu card shows a history chart',
        (await page.getByRole('img', { name: 'CPU Geçmişi' }).count()) === 1
      )
      const top = await card
        .getByRole('list', { name: 'En çok CPU kullananlar' })
        .locator('li')
        .allInnerTexts()
      check(
        'cpu card lists top cpu processes',
        top.length >= 1 && top.length <= 5 && top.every((r) => /\d+%$/.test(r.trim())),
        top.map((r) => r.replace(/\s+/g, ' ')).join(' | ')
      )
      await shot('status-03-card-cpu')
    }
    if (focus === 'mem') {
      const top = await card
        .getByRole('list', { name: 'En çok bellek kullananlar' })
        .locator('li')
        .allInnerTexts()
      check(
        'memory card lists top 5 memory processes',
        top.length === 5 && top.every((r) => /\d+ (MB|GB)$/.test(r.trim())),
        top.map((r) => r.replace(/\s+/g, ' ')).join(' | ')
      )
      await shot('status-03b-card-mem')
    }
    if (focus === 'disk') {
      const chipMount = (await chip.innerText())
        .replace(/^Disk\s*/, '')
        .replace(/\s*\d+%$/, '')
        .trim()
      const sizes = await card.evaluate((el) =>
        [...el.querySelectorAll('[title]')].map((m) => ({
          mount: m.getAttribute('title'),
          size: Number(m.nextElementSibling.innerText.match(/\/\s*([\d.,]+)/)[1].replace(',', '.'))
        }))
      )
      check(
        'disk chip shows the largest disk, listed first',
        sizes.length > 0 &&
          sizes[0].mount === chipMount &&
          sizes.every((d) => d.size <= sizes[0].size),
        `${chipMount} · ${sizes.map((d) => `${d.mount} ${d.size}`).join(', ')}`
      )
    }
    if (focus === 'load') {
      const rows = card.locator('[data-core]')
      const charts = card.getByRole('img', { name: /^cpu\d+ Geçmişi$/ })
      check(
        'load card lists every core with a line chart',
        (await rows.count()) === cpuCount && (await charts.count()) === cpuCount,
        `${await rows.count()} çekirdek, ${await charts.count()} grafik / ${cpuCount}`
      )
      check(
        'load card has no load averages or uptime',
        !/ortalaması|1 \/ 5 \/ 15|Açık kalma/.test(text)
      )
      await shot('status-03c-card-load')
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  // 6. Tam ekran program öndeyken ölçüm durur, çıkınca sürer
  const firstStrip = strips().first()
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.type('less /etc/hostname\n')
  await page.waitForTimeout(2000)
  const before = await firstStrip.getAttribute('data-updated-at')
  await page.waitForTimeout(12000)
  const during = await firstStrip.getAttribute('data-updated-at')
  check('no updates while a full-screen program runs', before === during)
  await page.keyboard.press('q')
  await page.waitForTimeout(7000)
  const after = await firstStrip.getAttribute('data-updated-at')
  check('updates resume after it exits', after !== during)

  // 7. Ayar kapatılınca şeritler kaybolur
  await setEnabled(false)
  check(
    'strips hidden after turning off',
    (await page.locator('[data-server-status]').count()) === 0
  )
} catch (err) {
  failed = true
  console.log(`FAIL: ${err.message}`)
  await shot('status-error').catch(() => undefined)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

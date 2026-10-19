// Terminalde arama, alarm kelimeleri, kayıtlı çalışma düzenleri, komut paleti ve kısayollar penceresi.
// Kullanım: node dev/e2e/tools.mjs <klasör> (masaüstü bildirimleri gösterilmez, sayılır)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importFixtureSnippets, login, runPalette } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-tools-shots')
fs.mkdirSync(out, { recursive: true })
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    // Alarm testleri bağlantıdan hemen sonra çalışır; gerçek bekleme süresi alarm-warmup.mjs'de denetlenir.
    JUMPDESK_ALARM_WARMUP_MS: '0',
    JUMPDESK_ALARM_SNIPPET_WAIT_MS: '0',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_NO_NOTIFY: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-tools-'))
  }
})
const shot = async (name) => {
  const b64 = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, 'base64'))
}
const page = await app.firstWindow()
let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${detail}`)
}
const tree = () => page.getByRole('tree')
const connected = (name) =>
  page.waitForFunction(
    (n) =>
      [...document.querySelectorAll('[role=tab]')].some(
        (t) => t.getAttribute('aria-label') === n && t.querySelector('.bg-success')
      ),
    name,
    { timeout: 15000 }
  )

try {
  await login(app, page)
  await importFixtureSnippets(
    app,
    page,
    fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-fixture-'))
  )
  await tree().waitFor({ timeout: 15000 })

  // Kısayollar penceresi
  await page.getByRole('button', { name: 'Klavye Kısayolları' }).click()
  await page.getByRole('dialog').getByText('Komut Paleti').waitFor({ timeout: 5000 })
  check('shortcuts dialog opens from titlebar', true)
  await page.waitForTimeout(400)
  await shot('tools-01-shortcuts')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+Shift+K')
  check(
    'Ctrl+Shift+K opens shortcuts',
    (await page.getByRole('dialog').getByText('Sekmelerde Ara', { exact: true }).count()) === 1
  )
  await page.keyboard.press('Escape')

  // Komut paleti: ekranın üst ortasında; yalnız seçili öğe vurgulu, ok tuşları seçimi taşır, Enter çalıştırır
  await page.keyboard.press('Control+Shift+P')
  await page.getByRole('option').first().waitFor({ timeout: 5000 })
  await page.waitForTimeout(300)
  const box = await page.getByRole('dialog').boundingBox()
  const win = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
  check(
    'palette at top center',
    box.y < win.h * 0.2 && Math.abs(box.x + box.width / 2 - win.w / 2) < 4,
    `top=${Math.round(box.y)} center=${Math.round(box.x + box.width / 2)}/${win.w / 2}`
  )
  const highlighted = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[cmdk-item]')]
        .filter((el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)')
        .map((el) => el.textContent.trim().slice(0, 30))
    )
  const first = await highlighted()
  check('palette highlights only selected item', first.length === 1, first.join(' | '))
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  const moved = await highlighted()
  check('arrow keys move highlight', moved.length === 1 && moved[0] !== first[0], moved.join(' | '))
  await shot('tools-00-palette')
  await page.keyboard.type('Klavye')
  await page.keyboard.press('Enter')
  await page.getByRole('dialog').getByText('Komut Paleti').waitFor({ timeout: 5000 })
  check('Enter runs selected command', true)
  await page.keyboard.press('Escape')

  // Terminal araması
  await tree().getByText('jump-ops', { exact: true }).dblclick()
  await connected('jump-ops')
  await page.waitForTimeout(2500)
  await page.locator('.xterm-screen').first().click()
  await page.keyboard.type('echo needle-1; echo hay; echo needle-2\n')
  await page.waitForTimeout(600)
  await page.keyboard.press('Control+f')
  const searchBox = page.getByPlaceholder('Terminalde ara')
  await searchBox.waitFor({ timeout: 5000 })
  await searchBox.fill('needle')
  await page.waitForTimeout(300)
  const counter = await page.locator('[role=search] span').first().innerText()
  check('terminal search finds matches', /^\d+\/[2-9]\d*$/.test(counter.trim()), counter)
  const wideBar = await page.locator('[role=search]').boundingBox()
  check(
    'wide terminal keeps single-row search bar',
    wideBar.height < 40,
    `h=${Math.round(wideBar.height)}`
  )
  await shot('tools-02-search')
  await page.keyboard.press('Escape')
  check('Esc closes search', (await searchBox.count()) === 0)

  // Bağlantılar: üzerine gelince ipucu, düz tık açmaz, Ctrl+Tık açar
  await page.evaluate(() => {
    window.__opened = []
    window.open = (u) => {
      window.__opened.push(String(u))
      return null
    }
  })
  await page.locator('.xterm-screen').first().click()
  await page.keyboard.type('clear; echo https://example.com/docs\n')
  await page.waitForTimeout(900)
  const linkPos = await page.evaluate(() => {
    const screen = document.querySelector('.xterm-screen').getBoundingClientRect()
    const measure = document.querySelector('.xterm-char-measure-element')
    const cw = measure
      ? measure.getBoundingClientRect().width / (measure.textContent.length || 1)
      : 7.8
    return { x: screen.left + cw * 6.5, y: screen.top + 8 }
  })
  await page.mouse.move(linkPos.x, linkPos.y + 30)
  await page.mouse.move(linkPos.x, linkPos.y, { steps: 4 })
  await page.waitForTimeout(400)
  const hint = page.getByRole('tooltip').filter({ hasText: 'Bağlantıyı Açmak İçin' })
  check(
    'link hover shows Ctrl+click hint',
    (await hint.count()) === 1,
    await hint
      .first()
      .innerText()
      .catch(() => '')
  )
  await shot('tools-02b-link-hint')
  await page.mouse.click(linkPos.x, linkPos.y)
  await page.waitForTimeout(200)
  check('plain click does not open link', (await page.evaluate(() => window.__opened.length)) === 0)
  await page.keyboard.down('Control')
  await page.mouse.click(linkPos.x, linkPos.y)
  await page.keyboard.up('Control')
  await page.waitForTimeout(200)
  const opened = await page.evaluate(() => window.__opened)
  check(
    'Ctrl+click opens link',
    opened.includes('https://example.com/docs'),
    JSON.stringify(opened)
  )
  await page.mouse.move(5, 500)
  await page.getByRole('tab', { name: 'jump-ops' }).hover()
  await page.waitForTimeout(900)
  const previewText = await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find((d) => d.className.includes('z-[60]'))
    return card?.innerText ?? ''
  })
  check(
    'no ghost command line after clear',
    previewText.includes('https://example.com/docs') && !previewText.includes('clear; echo'),
    previewText.replace(/\n/g, ' ⏎ ').slice(0, 160)
  )
  await page.mouse.move(5, 500)

  // Alarm: arka plandaki oturumda Exception
  await page.keyboard.type(
    'sleep 2; echo "java.lang.NullPointerException: boom"; echo "  at com.app.Foo.bar(Foo.java:42)"\n'
  )
  await tree().getByText('Linux', { exact: true }).click()
  await tree().getByText('Test', { exact: true }).click()
  await tree().getByText('test-01', { exact: true }).dblclick()
  await connected('test-01')
  await page.waitForTimeout(3000)
  check(
    'alarm badge on background tab',
    (await page.getByRole('tab', { name: 'jump-ops' }).getByLabel('Alarm').count()) === 1
  )
  check(
    'unread dot on right panel toggle',
    (await page.getByLabel('Okunmamış Alarm').count()) === 1
  )
  const notes = await app.evaluate(() => globalThis.__jumpdeskNotifications ?? [])
  check(
    'desktop notification sent once',
    notes.length === 1,
    JSON.stringify(notes.map((n) => n.title))
  )
  // Bildirime tıklama: oturuma geçer, satırı arar ve oturumu öne çıkarır (kırmızı çerçeve)
  await app.evaluate(({ BrowserWindow }, note) => {
    BrowserWindow.getAllWindows()[0].webContents.send('notify:clicked', {
      tabId: note.tabId,
      line: note.line
    })
  }, notes[0])
  const alarmSearch = page.getByPlaceholder('Terminalde ara')
  await alarmSearch.waitFor({ timeout: 5000 })
  check(
    'notification click opens session and searches the line',
    (await page.locator('[role=tab][aria-selected=true]').getAttribute('aria-label')) ===
      'jump-ops' && (await alarmSearch.inputValue()).includes('NullPointerException'),
    await alarmSearch.inputValue()
  )
  // Etkin eşleşme turuncu görünür (seçim rengi altında kalmaz; terminale tıklamak gerekmez)
  await page.waitForTimeout(400)
  const activeMatchPixels = await (async () => {
    const b64 = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
    )
    return page.evaluate(async (b64) => {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const g = new OffscreenCanvas(img.width, img.height).getContext('2d')
      g.drawImage(img, 0, 0)
      const screen = [...document.querySelectorAll('.xterm-screen')]
        .find((s) => s.getBoundingClientRect().width > 0)
        .getBoundingClientRect()
      const { data } = g.getImageData(
        Math.round(screen.x),
        Math.round(screen.y),
        Math.round(screen.width),
        Math.round(screen.height)
      )
      let n = 0
      for (let i = 0; i < data.length; i += 4)
        if (data[i] > 180 && data[i + 1] > 100 && data[i + 1] < 210 && data[i + 2] < 90) n++
      return n
    }, b64)
  })()
  check(
    'active search match is orange without clicking',
    activeMatchPixels > 300,
    `${activeMatchPixels} px`
  )
  check(
    'clicking an alarm does not flash the frame',
    (await page.locator('[data-alarm-flash]').count()) === 0
  )
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Sağ paneli aç/kapat' }).click()
  await page.getByRole('button', { name: 'Alarmlar' }).click()
  await page.waitForTimeout(300)
  const clears = await app.evaluate(() => globalThis.__jumpdeskNotificationClears ?? [])
  check('viewing alarms clears desktop notifications', clears.includes('*'), JSON.stringify(clears))
  const events = page.locator('[title="Oturuma Git Ve Satırı Bul"]')
  await events.first().waitFor({ timeout: 5000 })
  check(
    'one merged alarm event (echo ignored)',
    (await events.count()) === 1,
    await events.first().innerText()
  )
  await shot('tools-03-alarms')
  await page.mouse.move(5, 500)
  const before = await events.first().boundingBox()
  await events.first().hover()
  await page.waitForTimeout(200)
  const after = await events.first().boundingBox()
  const copyVisible = await events
    .first()
    .getByRole('button', { name: 'Satırı Kopyala' })
    .evaluate((el) => getComputedStyle(el).opacity === '1')
  check(
    'hover shows copy without changing row height',
    copyVisible && Math.abs(before.height - after.height) < 0.5,
    `${before.height} → ${after.height}`
  )
  await events.first().click()
  await page.getByPlaceholder('Terminalde ara').waitFor({ timeout: 5000 })
  check(
    'event click jumps to session',
    (await page.locator('[role=tab][aria-selected=true]').getAttribute('aria-label')) === 'jump-ops'
  )
  await page.keyboard.press('Escape')
  check(
    'alarms panel has no rules/events headers',
    (await page.getByText('Kurallar', { exact: true }).count()) === 0 &&
      (await page.getByText(/^Olaylar/).count()) === 0
  )
  await page.getByRole('button', { name: /^Kurallar/ }).click()
  const rulesDialog = page.getByRole('dialog')
  await rulesDialog.getByPlaceholder('Kelime ya da düzenli ifade').fill('needle')
  await rulesDialog.getByRole('button', { name: 'Kural Ekle' }).click()
  check(
    'custom rule added in dialog',
    (await rulesDialog.getByLabel('needle Kuralını Aç/Kapat').count()) === 1
  )
  await shot('tools-03b-rules-dialog')
  await page.keyboard.press('Escape')

  // Çalışma düzeni
  await page.getByRole('tab', { name: 'jump-ops' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Yan Yana Yerleştir' }).click()
  await page.waitForTimeout(400)
  await page.keyboard.press('Control+Shift+P')
  await page.getByPlaceholder('Komut, sekme, düzen ya da snippet ara…').waitFor({ timeout: 5000 })
  check(
    'palette lists snippets for terminal',
    (await page.getByRole('option', { name: /Snippet Çalıştır/ }).count()) > 0
  )
  await page.keyboard.type('Düzeni Kaydet')
  await page.keyboard.press('Enter')
  await page.getByPlaceholder('Düzen adı (ör. App Sunucuları)').fill('Test Düzeni')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  const namedTab = async () =>
    (await page.getByRole('tab', { name: /^Bölünmüş görünüm/ }).innerText())
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
  const afterSave = await namedTab()
  check(
    'saved group tab shows layout name without IP',
    afterSave[0] === 'Test Düzeni' && !afterSave.some((x) => /\d+\.\d+\.\d+\.\d+/.test(x)),
    afterSave.join(' | ')
  )
  await page.keyboard.press('Control+Shift+P')
  await page.keyboard.type('Tüm Sekmeleri Kapat')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  const layoutCard = page.getByRole('button', { name: /^Test Düzeni/ })
  await layoutCard.waitFor({ timeout: 5000 })
  check(
    'saved layout card',
    (await layoutCard.innerText()).trim().endsWith('2 sunucu'),
    (await layoutCard.innerText()).replace('\n', ' | ')
  )
  await shot('tools-04-layout-card')
  await layoutCard.dblclick()
  await page.waitForTimeout(800)
  const group = await page
    .getByRole('tab', { name: /^Bölünmüş görünüm/ })
    .getAttribute('aria-label')
  check('layout reopens group', group === 'Bölünmüş görünüm: jump-ops, test-01', group)
  check(
    'reopened group named after layout',
    (await namedTab())[0] === 'Test Düzeni',
    (await namedTab()).join(' | ')
  )
  await shot('tools-05-layout-opened')

  // Grup içinde alarm: panel başlığında ve grup sekmesinde rozet; yalnız o panele odaklanınca kalkar
  const header = (name) => page.locator('[data-pane-header]', { hasText: name })
  const groupTab = page.getByRole('tab', { name: /^Bölünmüş görünüm/ })
  await page.waitForTimeout(3000)
  await header('jump-ops').click()
  await page.waitForTimeout(300)
  await page.keyboard.type('sleep 2; echo "IllegalStateException: grup"\n')
  await header('test-01').click()
  await page.waitForTimeout(3500)
  check(
    'pane header shows alarm in group',
    (await header('jump-ops').getByLabel('Alarm').count()) === 1
  )
  check('group tab shows alarm', (await groupTab.getByLabel('Alarm').count()) === 1)
  await shot('tools-06-group-alarm')
  await header('test-01').click()
  await page.waitForTimeout(200)
  check(
    'alarm stays while another pane is focused',
    (await header('jump-ops').getByLabel('Alarm').count()) === 1 &&
      (await groupTab.getByLabel('Alarm').count()) === 1
  )
  await header('jump-ops').click()
  await page.waitForTimeout(200)
  check(
    'focusing the pane clears both badges',
    (await header('jump-ops').getByLabel('Alarm').count()) === 0 &&
      (await groupTab.getByLabel('Alarm').count()) === 0
  )

  // Dar panelde arama çubuğu kırpılmaz; less gibi tam ekran programda Ctrl+F programa gider
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+f')
  const bar = page.locator('[role=search]')
  await bar.waitFor({ timeout: 5000 })
  const paneBox = await header('jump-ops').locator('xpath=..').boundingBox()
  const barBox = await bar.boundingBox()
  check(
    'search bar fits inside narrow pane',
    barBox.x >= paneBox.x - 0.5 && barBox.x + barBox.width <= paneBox.x + paneBox.width + 0.5,
    `pane ${Math.round(paneBox.x)}–${Math.round(paneBox.x + paneBox.width)}, bar ${Math.round(barBox.x)}–${Math.round(barBox.x + barBox.width)}`
  )
  const inputW = (await bar.locator('input').boundingBox()).width
  check(
    'narrow pane stacks: input full width, buttons below',
    barBox.height > 50 && inputW > paneBox.width * 0.8,
    `bar h=${Math.round(barBox.height)}, input w=${Math.round(inputW)}`
  )
  await shot('tools-07-narrow-search')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.type('less /etc/hosts\n')
  await page.waitForTimeout(800)
  await page.keyboard.press('Control+f')
  await page.waitForTimeout(300)
  check('Ctrl+F goes to full-screen program (less)', (await bar.count()) === 0)
  await page.keyboard.type('q')
  await page.waitForTimeout(300)

  // Okunmamış sayısı oturum bazında: odaklanılan oturumun olayları okundu sayılır
  await page.getByRole('button', { name: 'Snippetler' }).click()
  const alarmCount = async () => {
    const badge = page.getByRole('button', { name: 'Alarmlar' }).locator('span.bg-destructive')
    return (await badge.count()) ? Number(await badge.innerText()) : 0
  }
  const unreadBefore = await alarmCount()
  await header('jump-ops').click()
  await page.waitForTimeout(300)
  await page.keyboard.type('sleep 4; echo "Exception J"\n')
  await header('test-01').click()
  await page.waitForTimeout(300)
  await page.keyboard.type('sleep 3; echo "Exception T"\n')
  await page.keyboard.press('Control+Shift+T')
  await page.waitForTimeout(5000)
  const both = await alarmCount()
  check(
    'two background servers raise unread count',
    both === unreadBefore + 2,
    `${unreadBefore} → ${both}`
  )
  await page.getByRole('tab', { name: /^Bölünmüş görünüm/ }).click()
  await page.waitForTimeout(300)
  const afterGroup = await alarmCount()
  check(
    'focusing one server (group returns to test-01) removes only its unread',
    afterGroup === both - 1,
    `${both} → ${afterGroup}`
  )
  await header('jump-ops').click()
  await page.waitForTimeout(300)
  check(
    'visiting all servers clears the count',
    (await alarmCount()) === 0,
    String(await alarmCount())
  )
  // Yeni alarm: ekrandaki panelin çerçevesi kırmızı yanıp söner (dört kenar da, ayırıcıya bitişik olan dahil), mavi
  // odak çerçevesi o sırada gizlenir; bitince odak çerçevesi ayırıcıların üstünde görünür. Hareket azaltılınca çerçeve
  // sabit çizilir, pikseller kesin ölçülür.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  /** Çerçevenin her kenarından `offset` piksel içeride (eksiyse dışarıda) ortadaki rengi döndürür. */
  const frameEdges = async (selector, offset) => {
    const b64 = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
    )
    return page.evaluate(
      async ({ b64, selector, offset }) => {
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const g = new OffscreenCanvas(img.width, img.height).getContext('2d')
        g.drawImage(img, 0, 0)
        const r = document.querySelector(selector).getBoundingClientRect()
        const area = document.querySelector('[data-workspace]').getBoundingClientRect()
        const px = (x, y) => [
          ...g.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)
        ]
        const midX = (r.left + r.right) / 2
        const midY = (r.top + r.bottom) / 2
        const edges = {
          left: [r.left + offset, midY, r.left > area.left + 1],
          right: [r.right - 1 - offset, midY, r.right < area.right - 1],
          bottom: [midX, r.bottom - 1 - offset, r.bottom < area.bottom - 1]
        }
        return Object.fromEntries(
          Object.entries(edges)
            .filter(([, [, , inner]]) => offset >= 0 || inner)
            .map(([k, [x, y]]) => [k, px(x, y)])
        )
      },
      { b64, selector, offset }
    )
  }
  // Alarm sağdaki panelde (ilk panel değil): sol kenarı ayırıcıya bitişik
  await header('test-01').click()
  await page.waitForTimeout(300)
  await page.keyboard.type('sleep 4; echo "Exception F"\n')
  const flashFrame = page.locator('[data-alarm-flash]')
  await flashFrame.waitFor({ timeout: 9000 })
  const flash = await page.evaluate(() => {
    const id = document.querySelector('[data-alarm-flash]').parentElement.dataset.paneFrame
    return {
      frames: document.querySelectorAll('[data-alarm-flash]').length,
      server: document.querySelector(`[data-pane="${id}"]`).textContent.includes('test-01'),
      focusFrame: document.querySelectorAll(`[data-pane-frame="${id}"] [data-focus-frame]`).length
    }
  })
  const red = await frameEdges('[data-alarm-flash]', 0)
  const isRed = ([r, g, b]) => r > 150 && g < 120 && b < 120
  check(
    'new alarm flashes only its pane frame without the blue ring',
    flash.frames === 1 && flash.server && flash.focusFrame === 0,
    JSON.stringify(flash)
  )
  check(
    'alarm frame is red on every side, also next to a separator',
    Object.values(red).every(isRed),
    JSON.stringify(red)
  )
  await shot('tools-06c-alarm-flash')
  await page.waitForTimeout(2300)
  check('alarm flash ends', (await flashFrame.count()) === 0)
  const blue = await frameEdges('[data-focus-frame]', -1)
  check(
    'focus frame is blue next to other panes (above separators)',
    Object.keys(blue).length > 0 && Object.values(blue).every(([r, , b]) => b > r + 40),
    JSON.stringify(blue)
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const clearsAfter = await app.evaluate(() => globalThis.__jumpdeskNotificationClears ?? [])
  check(
    "focusing clears that server's notifications",
    clearsAfter.filter((c) => c !== '*').length >= 2,
    String(clearsAfter.length)
  )

  // Adlandırılmış grup sekmesi: kaydet yerine yeniden adlandır / sil
  const named = page.getByRole('tab', { name: /^Bölünmüş görünüm/ })
  const layoutsCount = () =>
    page.evaluate(() => {
      const key = Object.keys(localStorage).find(
        (k) => k.startsWith('jumpdesk.user/') && k.endsWith('/layouts')
      )
      return JSON.parse((key && localStorage.getItem(key)) ?? '[]').length
    })
  await named.click({ button: 'right' })
  check(
    'named group menu offers rename/delete instead of save',
    (await page.getByRole('menuitem', { name: 'Düzeni Yeniden Adlandır…' }).count()) === 1 &&
      (await page.getByRole('menuitem', { name: 'Düzeni Sil' }).count()) === 1 &&
      (await page.getByRole('menuitem', { name: 'Düzeni Kaydet…' }).count()) === 0
  )
  await page.getByRole('menuitem', { name: 'Düzeni Yeniden Adlandır…' }).click()
  const nameInput = page.getByPlaceholder('Düzen adı (ör. App Sunucuları)')
  check('rename dialog prefilled', (await nameInput.inputValue()) === 'Test Düzeni')
  await nameInput.fill('Yeni Ad')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check(
    'rename keeps single layout and renames tab',
    (await layoutsCount()) === 1 && (await named.innerText()).startsWith('Yeni Ad'),
    `${await layoutsCount()} | ${(await named.innerText()).split('\n')[0]}`
  )
  await named.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Düzeni Sil' }).click()
  await page.waitForTimeout(300)
  check(
    'delete removes layout and unnames group',
    (await layoutsCount()) === 0 && !(await named.innerText()).startsWith('Yeni Ad'),
    (await named.innerText()).split('\n')[0]
  )

  // Alarmları temizle: tüm sekme/panel rozetleri kalkar
  await header('jump-ops').click()
  await page.waitForTimeout(300)
  await page.keyboard.type('sleep 2; echo "Exception Z"\n')
  await page.keyboard.press('Control+Shift+T')
  await page.waitForTimeout(3500)
  check('background alarm badges group tab', (await named.getByLabel('Alarm').count()) === 1)
  await page.getByRole('button', { name: 'Alarmlar' }).click()
  // Gruptaki oturumun alarmına gidilince diğer paneller soluklaşır, oturumun çerçevesi yanıp söner
  await page
    .locator('[title="Oturuma Git Ve Satırı Bul"]', { hasText: 'Exception Z' })
    .first()
    .click()
  await page.waitForTimeout(450)
  const spot = await page.evaluate(() => {
    const panes = [...document.querySelectorAll('[data-workspace] > [data-pane]')].filter(
      (p) => p.getBoundingClientRect().width > 50
    )
    const opacity = (p) => Number(getComputedStyle(p).opacity)
    const target = panes.find((p) => p.textContent.includes('jump-ops'))
    return {
      frame: document.querySelectorAll('[data-alarm-flash]').length,
      target: target ? opacity(target) : null,
      others: panes.filter((p) => p !== target).map(opacity)
    }
  })
  check(
    'going to an alarm in a group dims the other panes only',
    spot.frame === 0 &&
      spot.target >= 0.8 &&
      spot.others.length > 0 &&
      spot.others.every((o) => o <= 0.2),
    JSON.stringify(spot)
  )
  await shot('tools-07b-alarm-spotlight')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(2300)
  const afterSpot = await page.evaluate(() =>
    [...document.querySelectorAll('[data-workspace] > [data-pane]')]
      .filter((p) => p.getBoundingClientRect().width > 50)
      .map((p) => Number(getComputedStyle(p).opacity))
  )
  check(
    'panes return to normal after the spotlight',
    afterSpot.every((o) => o >= 0.8),
    afterSpot.join(', ')
  )
  await page.getByRole('button', { name: 'Alarmları Temizle' }).click()
  await page.waitForTimeout(300)
  check(
    'clearing alarms removes all tab badges',
    (await page.getByRole('tab').getByLabel('Alarm').count()) === 0
  )

  // Düzen değişiklikleri: soluk mavi nokta, kaydet, kaydetmeden kapatınca onay
  const dirtyDot = () => named.getByLabel('Kaydedilmemiş Düzen Değişikliği').count()
  await named.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Düzeni Kaydet…' }).click()
  await page.getByPlaceholder('Düzen adı (ör. App Sunucuları)').fill('Kirli Test')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check('fresh layout has no dirty dot', (await dirtyDot()) === 0)
  await named.click({ button: 'right' })
  const saveChanges = page.getByRole('menuitem', { name: 'Düzendeki Değişiklikleri Kaydet' })
  check(
    'save changes disabled when clean',
    (await saveChanges.getAttribute('aria-disabled')) === 'true' ||
      (await saveChanges.getAttribute('data-disabled')) !== null
  )
  await page.getByRole('menuitem', { name: 'Alt Alta Yerleştir' }).click()
  await page.waitForTimeout(300)
  check('changing layout shows dirty dot', (await dirtyDot()) === 1)
  await shot('tools-08-dirty-dot')
  await named.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Düzendeki Değişiklikleri Kaydet' }).click()
  await page.waitForTimeout(300)
  check('saving changes clears dirty dot', (await dirtyDot()) === 0)

  // Panel boyutu değişince de düzen değişmiş sayılır; boyutlar düzende saklanır ve düzen açılınca geri gelir
  const paneHeights = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-workspace] > [data-pane]')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => Math.round(r.height))
    )
  await named.click()
  await page.waitForTimeout(400)
  const separator = page
    .locator('[data-workspace] [role="separator"][aria-orientation="horizontal"]:visible')
    .first()
  const sep = await separator.boundingBox()
  await page.mouse.move(sep.x + sep.width / 2, sep.y + sep.height / 2)
  await page.mouse.down()
  await page.mouse.move(sep.x + sep.width / 2, sep.y + sep.height / 2 + 90, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const resized = await paneHeights()
  check('resizing panes shows dirty dot', (await dirtyDot()) === 1, resized.join(' / '))
  await named.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Düzendeki Değişiklikleri Kaydet' }).click()
  await page.waitForTimeout(300)
  check('saving resized layout clears dirty dot', (await dirtyDot()) === 0)
  const savedSizes = await page.evaluate(() => {
    const entry = Object.entries(localStorage).find(([k]) => k.endsWith('/layouts'))
    const layout = entry && JSON.parse(entry[1]).find((l) => l.name === 'Kirli Test')
    return layout?.items[0]?.sizes ?? null
  })
  check('layout stores pane sizes', Boolean(savedSizes?.rows?.length), JSON.stringify(savedSizes))
  await named.click({ button: 'middle' })
  await page.waitForTimeout(400)
  await runPalette(page, 'Kirli Test')
  await named.waitFor({ timeout: 10000 })
  await page.waitForTimeout(600)
  const restored = await paneHeights()
  check(
    'reopened layout restores pane sizes',
    restored.length === resized.length && restored.every((h, i) => Math.abs(h - resized[i]) <= 3),
    `${resized.join(' / ')} → ${restored.join(' / ')}`
  )
  const nudge = await separator.boundingBox()
  await page.mouse.move(nudge.x + nudge.width / 2, nudge.y + nudge.height / 2)
  await page.mouse.down()
  await page.mouse.move(nudge.x + nudge.width / 2, nudge.y + nudge.height / 2 + 2, { steps: 2 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  check('a 2 px resize shows dirty dot', (await dirtyDot()) === 1)
  // Grup sekmesinin menüsünde sekmedekiyle aynı kapatma seçenekleri; "Diğerlerini Kapat" yalnız grubu bırakır
  await page.keyboard.press('Control+Shift+T')
  await page.waitForTimeout(300)
  await named.click({ button: 'right' })
  const groupMenu = {
    close: await page.getByRole('menuitem', { name: 'Kapat', exact: true }).count(),
    others: await page.getByRole('menuitem', { name: 'Diğerlerini Kapat' }).count(),
    all: await page.getByRole('menuitem', { name: 'Tüm Sekmeleri Kapat' }).count()
  }
  check(
    'group menu has the same close items as a tab',
    groupMenu.close === 1 && groupMenu.others === 1 && groupMenu.all === 1,
    JSON.stringify(groupMenu)
  )
  await page.getByRole('menuitem', { name: 'Diğerlerini Kapat' }).click()
  await page.waitForTimeout(400)
  check(
    'close others on a group keeps only the group',
    (await page.locator('[data-tab-strip] [role=tab]').count()) === 1 && (await named.count()) === 1
  )
  await named.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Yan Yana Yerleştir' }).click()
  await page.waitForTimeout(300)
  // Grup sekmesindeki çarpı grubu kapatır (değişiklik varsa sorar)
  await named.hover()
  await named.getByRole('button', { name: 'Grubu kapat' }).click()
  const confirmText = page.getByText(
    'Düzende yaptığınız değişiklikler kaybolacaktır. Devam etmek istiyor musunuz?'
  )
  await confirmText.waitFor({ timeout: 3000 })
  check('closing dirty group asks for confirmation', true)
  await shot('tools-09-confirm')
  await page.getByRole('button', { name: 'Vazgeç' }).click()
  await page.waitForTimeout(300)
  check('cancel keeps the group', (await named.count()) === 1)
  await named.click({ button: 'middle' })
  await page.getByRole('button', { name: 'Devam Et' }).click()
  await page.waitForTimeout(400)
  check('confirm closes the group', (await named.count()) === 0)

  // Orta tıkla sekme kapatınca birincil seçim yapıştırılmaz
  await page.keyboard.press('Control+Shift+T')
  await page.keyboard.press('Control+Shift+T')
  await page.waitForTimeout(300)
  await page.getByRole('tab').last().click({ button: 'middle' })
  const pasteBlocked = await page.evaluate(() => {
    const target = document.activeElement ?? document.body
    const e = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer()
    })
    target.dispatchEvent(e)
    return e.defaultPrevented
  })
  check('paste right after middle-click close is blocked', pasteBlocked)
  await page.waitForTimeout(700)
  const pasteLater = await page.evaluate(() => {
    const e = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer()
    })
    document.body.dispatchEvent(e)
    return e.defaultPrevented
  })
  check('normal paste works afterwards', !pasteLater)
} catch (err) {
  failed = true
  console.log(`FAIL ${err.message}`)
  await shot('zz-failure').catch(() => undefined)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

// README ekran görüntüleri: İngilizce arayüz, koyu tema, İngilizce adlı mock veri seti (MOCK_DATA=showcase) ve sahte
// bir OpenAI uyumlu sağlayıcı (komut önerisi, snippet, kural ve açıklama yanıtları). Mock sunucuyu kendisi ayrı bir portta açar; çalışan geliştirme mock'una dokunmaz.
// Kullanım: npm run build && node dev/screenshots.mjs [klasör]   (varsayılan docs/screenshots)
import { _electron as electron } from 'playwright-core'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { stubFileDialogs, writeExportFile } from './e2e/helpers.mjs'

const root = path.resolve(import.meta.dirname, '..')
const out = path.resolve(process.argv[2] || path.join(root, 'docs/screenshots'))
fs.mkdirSync(out, { recursive: true })
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-shots-'))
const MOCK_PORT = 18090

/**
 * Sunucuların ev klasörleri dosya yöneticisinin yol çubuğunda görünür; kısa bir yol için /tmp/home kullanılır. Bu
 * klasör başka bir şeye aitse (işaret dosyası yoksa) geçici klasöre düşülür.
 */
function hostsRoot() {
  const dir = path.join(os.tmpdir(), 'home')
  const marker = path.join(dir, '.jumpdesk-showcase')
  if (fs.existsSync(dir) && !fs.existsSync(marker)) return path.join(work, 'home')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir)
  fs.writeFileSync(marker, '')
  return dir
}
const WIDTH = 1440
const HEIGHT = 900

const mock = spawn(process.execPath, [path.join(root, 'dev/mock-jms/server.mjs')], {
  env: {
    ...process.env,
    MOCK_PORT: String(MOCK_PORT),
    MOCK_DATA: 'showcase',
    MOCK_ROOT: hostsRoot()
  },
  stdio: ['ignore', 'pipe', 'inherit']
})
await new Promise((resolve, reject) => {
  mock.stdout.on('data', (d) => d.toString().includes('mock JumpServer') && resolve())
  mock.once('exit', (code) => reject(new Error(`mock server exited (${code})`)))
})

/** Sahte yapay zeka sağlayıcısı: model listesi; istem türüne göre (öneri, snippet, kural, açıklama) sabit yanıtlar. */
const AI_ANSWERS = {
  suggest: {
    suggestions: [
      {
        command: 'du -ah /var/log | sort -rh | head -n 10',
        description: 'Lists the 10 largest files and folders under /var/log',
        risk: 'safe'
      },
      {
        command: 'find /var/log -type f -size +100M -exec ls -lh {} +',
        description: 'Shows log files larger than 100 MB',
        risk: 'safe'
      },
      {
        command: 'journalctl --vacuum-size=500M',
        description: 'Shrinks the systemd journal to 500 MB',
        risk: 'caution'
      }
    ],
    note: ''
  },
  snippet: {
    options: [
      {
        name: 'Orders API Errors',
        command: "tail -f logs/app.log | grep --line-buffered -E 'ERROR|Exception'",
        description: 'Follows the application log and shows only errors and exceptions',
        risk: 'safe'
      },
      {
        name: 'Orders Service Errors (Last Hour)',
        command: "journalctl -u orders --since '1 hour ago' -p err",
        description: 'Shows error-level journal entries of the orders service from the last hour',
        risk: 'safe'
      }
    ],
    note: ''
  },
  rule: {
    options: [
      {
        pattern: 'IllegalStateException|SQLTimeoutException',
        regex: true,
        caseSensitive: true,
        description: 'Order state errors and database timeouts'
      },
      {
        pattern: 'already closed',
        regex: false,
        caseSensitive: false,
        description: 'Operations on orders that are already closed'
      },
      {
        pattern: 'Connection (refused|reset)',
        regex: true,
        caseSensitive: false,
        description: 'Refused or reset connections'
      }
    ],
    note: ''
  },
  explain: {
    summary:
      'Cancelling order 48213 failed because the order was already closed: OrderService.cancel throws IllegalStateException for orders that are no longer open.',
    points: [
      'The exception is thrown in OrderService.cancel (OrderService.java:118), called from OrderController.cancel.',
      'This is an application-level error, not an infrastructure problem; the service itself keeps answering requests.',
      'A double submit or a client with a stale order state usually causes it.',
      'Check whether the same order was cancelled more than once around this time.'
    ],
    suggestions: [
      {
        command: "grep -n '48213' logs/app.log",
        description: 'Shows every log line about order 48213',
        risk: 'safe'
      },
      {
        command: "grep -c 'IllegalStateException' logs/app.log",
        description: 'Counts how often this error occurred',
        risk: 'safe'
      },
      {
        command: "grep -B2 -A3 'Request failed' logs/app.log | tail -n 40",
        description: 'Shows the latest failures with the lines around them',
        risk: 'safe'
      }
    ],
    note: ''
  }
}
const aiKind = (system) =>
  /snippet writer/.test(system)
    ? 'snippet'
    : /rule writer/.test(system)
      ? 'rule'
      : /terminal text explainer/.test(system)
        ? 'explain'
        : 'suggest'
const ai = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.end(JSON.stringify({ data: [{ id: 'llama3.1:8b' }, { id: 'qwen2.5-coder:7b' }] }))
    return
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const json = JSON.parse(body || '{}')
    const system = json.messages?.find((m) => m.role === 'system')?.content ?? ''
    const answer = AI_ANSWERS[aiKind(system)]
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
})
await new Promise((r) => ai.listen(0, '127.0.0.1', r))
const aiPort = ai.address().port

const env = {
  ...process.env,
  JUMPDESK_LANGUAGE: 'en',
  JUMPDESK_SERVER: `http://127.0.0.1:${MOCK_PORT}`,
  JUMPDESK_HIDE_WINDOW: '1',
  JUMPDESK_OFFSCREEN: '1',
  JUMPDESK_NO_NOTIFY: '1',
  // Seçim için terminal satırları DOM'dan okunur.
  JUMPDESK_DISABLE_WEBGL: '1',
  JUMPDESK_ALARM_WARMUP_MS: '0',
  JUMPDESK_ALARM_SNIPPET_WAIT_MS: '0',
  JUMPDESK_USER_DATA: path.join(work, 'user-data')
}
const app = await electron.launch({
  args: ['--ozone-platform=x11', path.join(root, 'out/main/index.js')],
  cwd: root,
  env
})
const page = await app.firstWindow()
await app.evaluate(
  ({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size.w, size.h),
  { w: WIDTH, h: HEIGHT }
)

const shot = async (name) => {
  await page.waitForTimeout(400)
  const b64 = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64')
  )
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(b64, 'base64'))
  console.log(`saved ${name}.png`)
}
const palette = async (text) => {
  await page.keyboard.press('Control+Shift+P')
  const input = page.getByPlaceholder('Search commands, tabs, layouts or snippets…')
  await input.waitFor({ timeout: 5000 })
  await input.fill(text)
  await page.waitForTimeout(250)
  await page.keyboard.press('Enter')
}
const tree = () => page.getByRole('tree')
const terminal = () => page.locator('.xterm-helper-textarea:visible')
const typeIn = async (index, text) => {
  await terminal().nth(index).focus()
  await page.keyboard.type(text, { delay: 15 })
}
/** Sunucuyu açar; birden çok hesabı olan sunucuda hesap seçme ekranında verilen hesap seçilir. */
const openServer = async (name, account) => {
  await tree().getByText(name, { exact: true }).first().dblclick()
  await page.mouse.move(WIDTH - 20, HEIGHT - 20)
  if (account) {
    await page.getByText('Choose an account').first().waitFor({ timeout: 5000 })
    await page.getByRole('button', { name: account, exact: true }).last().click()
  }
  await page.waitForTimeout(2500)
}
const expand = async (name) => {
  const row = tree().getByRole('treeitem', { name, exact: true }).first()
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click()
  await page.waitForTimeout(300)
}

try {
  // 1. Sunucu adresi ekranı
  const address = page.locator('#server-address')
  await address.waitFor({ timeout: 15000 })
  await address.fill('https://jumpserver.example.com')
  await shot('sign-in')

  await address.fill(`http://127.0.0.1:${MOCK_PORT}`)
  await address.press('Enter')
  for (let i = 0; i < 100; i++) {
    const done = await app.evaluate(async ({ webContents }) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => w.getURL().includes('/core/auth/login/'))
      if (!wc || wc.isLoading()) return false
      await wc.executeJavaScript(
        "document.querySelector('[name=username]').value='demo';document.querySelector('[name=password]').value='demo';document.querySelector('form').submit()"
      )
      return true
    })
    if (done) break
    await page.waitForTimeout(150)
  }
  await tree().waitFor({ timeout: 15000 })
  await page.evaluate(() => window.jumpdesk.theme.set('dark'))
  await page.waitForTimeout(500)

  // Örnek snippetler, vurgu ve alarm kuralları içe aktarılır
  const snippet = (group, name, command) => ({
    id: name.toLowerCase().replace(/\W+/g, '-'),
    name,
    group,
    command
  })
  const rule = (id, pattern, extra = {}) => ({
    id,
    pattern,
    regex: false,
    caseSensitive: true,
    enabled: true,
    ...extra
  })
  const bundle = writeExportFile(
    work,
    {
      snippets: [
        snippet('Logs', 'Orders API Log', 'tail -n 40 -f logs/app.log'),
        snippet('Logs', 'Nginx Access Log', 'tail -f /var/log/nginx/access.log'),
        snippet('Logs', 'System Journal', 'journalctl -f'),
        snippet('Health', 'Service Status', 'systemctl status orders'),
        snippet('Health', 'Memory', 'free -m'),
        snippet('Health', 'Disk Usage', 'df -h'),
        snippet('Deploy', 'Restart Orders API', 'sudo systemctl restart orders'),
        snippet('Deploy', 'Release Notes', 'cat projects/api/CHANGELOG.md')
      ],
      highlights: [
        rule('h-error', 'ERROR', { fg: '#ffffff', bg: '#cf222e' }),
        rule('h-exception', 'Exception', { fg: '#ffffff', bg: '#cf222e' }),
        rule('h-warn', 'WARN', { fg: '#ffffff', bg: '#9a6700' }),
        rule('h-info', 'INFO', { fg: '#ffffff', bg: '#0969da' })
      ],
      alarms: [rule('a-exception', 'Exception'), rule('a-oom', 'OutOfMemoryError')]
    },
    { name: 'showcase.jumpdesk', server: `127.0.0.1:${MOCK_PORT}` }
  )
  await stubFileDialogs(app, { open: bundle, save: path.join(work, 'export.jumpdesk') })
  await palette('Import')
  const importDialog = page.getByRole('dialog').filter({ has: page.locator('[role=checkbox]') })
  await importDialog.waitFor({ timeout: 5000 })
  await importDialog.locator('[data-slot=dialog-footer] button').last().click()
  await importDialog.waitFor({ state: 'hidden', timeout: 5000 })
  await page.waitForTimeout(4500)

  // 2. Sunucu ağacı ve bilgi kartı
  await expand('Production')
  await expand('Web')
  await expand('App')
  await expand('Database')
  await tree().getByText('web-01', { exact: true }).first().hover()
  await page.waitForTimeout(900)
  await shot('servers')
  await page.mouse.move(WIDTH - 20, HEIGHT - 20)

  // 3. Komut paleti
  await page.keyboard.press('Control+Shift+P')
  await page.getByRole('option').first().waitFor({ timeout: 5000 })
  await shot('command-palette')
  await page.keyboard.press('Escape')

  // 4. Bölünmüş görünüm: dört oturum, günlükte vurgular, sağ panelde snippetler
  const sessions = [['web-01', 'root'], ['app-01'], ['app-02'], ['db-primary', 'postgres']]
  for (const [i, [name, account]] of sessions.entries()) {
    if (i > 0) await page.keyboard.press('Control+Shift+T')
    await page.waitForTimeout(400)
    await openServer(name, account)
  }
  await palette('Arrange as Grid')
  await page.waitForTimeout(1200)
  await typeIn(0, 'ls\n')
  await typeIn(0, 'cat notes.txt\n')
  await typeIn(1, 'tail -n 40 -f logs/app.log\n')
  await typeIn(2, 'tail -n 40 -f logs/app.log\n')
  await typeIn(3, 'ls projects/api logs\n')
  await page.waitForTimeout(1500)
  await page.keyboard.press('Control+Shift+B')
  await page.getByRole('button', { name: 'Snippets', exact: true }).first().click()
  await page.waitForTimeout(600)
  await shot('split-view')

  // 5. Alarmlar paneli
  await page.getByRole('button', { name: 'Alarms', exact: true }).first().click()
  await page.waitForTimeout(600)
  await shot('alarms')

  // 6. Vurgular paneli
  await page.getByRole('button', { name: 'Highlights', exact: true }).first().click()
  await page.waitForTimeout(600)
  await shot('highlights')

  // 7. Dosya yöneticisi (SFTP)
  await terminal().nth(3).focus()
  await page.getByRole('button', { name: 'Files', exact: true }).first().click()
  await page.waitForTimeout(1500)
  await shot('files')
  await page.keyboard.press('Control+Shift+B')

  // 8. Yapay zeka ayarları
  await page.keyboard.press('Control+,')
  await page.getByRole('button', { name: 'AI', exact: true }).click()
  await page.getByRole('combobox', { name: 'Provider' }).click()
  await page.getByRole('option', { name: 'Local Model Server', exact: true }).click()
  const aiAddress = page.getByLabel('Address', { exact: true })
  await aiAddress.fill(`http://127.0.0.1:${aiPort}/v1`)
  await aiAddress.press('Enter')
  await page.getByText('2 models').waitFor({ timeout: 10000 })
  const modelSelect = page.getByRole('combobox', { name: 'Model' })
  await modelSelect.click()
  await page.getByRole('option', { name: 'llama3.1:8b' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('switch', { name: 'AI Autocomplete' }).click()
  await page.getByRole('button', { name: 'Test Connection' }).click()
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[role=dialog] *'))
      if (el.scrollTop > 0) el.scrollTop = 0
  })
  await shot('settings-ai')
  await page.keyboard.press('Escape')

  // 9. Tek oturum: autocomplete ve yapay zekaya sorma
  await page.keyboard.press('Control+Shift+T')
  await page.waitForTimeout(400)
  await openServer('app-03')
  await typeIn(0, 'tail -n 40 -f lo')
  await page.waitForTimeout(900)
  await shot('autocomplete')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+u')
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+Space')
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+Space')
  const askDialog = page.getByRole('dialog', { name: 'Ask AI' })
  await askDialog.waitFor({ timeout: 5000 })
  await page.keyboard.type('which log files take the most space?', { delay: 10 })
  await page.keyboard.press('Enter')
  await askDialog.getByRole('option').first().waitFor({ timeout: 10000 })
  await shot('ai-assist')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // 10. Seçili çıktıyı açıklama: hata satırları seçilir, "Explain" → onay → açıklama ve komutlar
  await terminal().nth(0).focus()
  await page.keyboard.type('clear; cat logs/app.log\n', { delay: 10 })
  await page.waitForTimeout(1200)
  const rowBox = (text) =>
    page.evaluate((t) => {
      const container = [...document.querySelectorAll('.xterm-rows')].find(
        (e) => e.getBoundingClientRect().width > 0
      )
      const row = [...container.children].find((r) => r.textContent.includes(t))
      const r = row.getBoundingClientRect()
      const width = (row.textContent.trimEnd().length / row.textContent.length) * r.width
      return { left: r.left, right: r.left + width, y: r.top + r.height / 2 }
    }, text)
  const from = await rowBox('Request failed')
  const to = await rowBox('OrderController.cancel')
  await page.mouse.move(from.left + 2, from.y)
  await page.mouse.down()
  await page.mouse.move(to.right - 2, to.y, { steps: 8 })
  await page.mouse.up()
  await page.locator('[data-ai-explain-chip]').waitFor({ timeout: 5000 })
  await shot('ai-explain-selection')
  await page.locator('[data-ai-explain-chip]').click()
  const explainDialog = page.getByRole('dialog', { name: 'Ask AI About the Selection' })
  await explainDialog.waitFor({ timeout: 5000 })
  await explainDialog.getByRole('button', { name: 'Send' }).click()
  await explainDialog.locator('[data-ai-explanation]').waitFor({ timeout: 10000 })
  await shot('ai-explain')
  await explainDialog
    .locator('[data-slot=dialog-footer]')
    .getByRole('button', { name: 'Close' })
    .click()
  await page.waitForTimeout(300)

  // 11. Alarm olayını açıklama: gönderilecek metin (alarm satırı ve öncesi) onaydan önce gösterilir
  await palette('Open Alarms Panel')
  await page.waitForTimeout(500)
  const alarmEvent = page.getByRole('button', { name: /IllegalStateException/ }).first()
  await alarmEvent.hover()
  await alarmEvent.getByRole('button', { name: 'Ask AI' }).click()
  const alarmDialog = page.getByRole('dialog', { name: 'Ask AI About the Alarm' })
  await alarmDialog.waitFor({ timeout: 5000 })
  await alarmDialog.getByLabel('Extra Question').fill('Is this caused by the database?')
  await shot('ai-alarm')
  await alarmDialog.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(300)

  // 12. Yapay zekayla kural: tarif ve örnek satır, öneriler örnekle denenir
  await page.getByRole('button', { name: /^Rules/ }).click()
  const rulesDialog = page.getByRole('dialog', { name: 'Alarm Rules' })
  await rulesDialog.getByRole('button', { name: 'Create a Rule with AI' }).click()
  await page
    .getByLabel('Description of What to Catch')
    .fill('order state errors and database timeouts')
  await page
    .getByLabel('Sample Line')
    .fill('java.lang.IllegalStateException: Order 48213 is already closed')
  await page.getByRole('button', { name: 'Suggest Rules' }).click()
  await page.getByRole('list', { name: 'Suggested Rules' }).waitFor({ timeout: 10000 })
  await shot('ai-rule')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+Shift+B')

  // 13. Yapay zekayla snippet: tarif → öneriler → Use forma koyar
  await palette('Edit Snippets')
  const editor = page.getByRole('dialog')
  await editor.getByRole('button', { name: 'New Snippet' }).click()
  await editor
    .getByLabel('Snippet Description')
    .fill('follow the orders API log and show only errors')
  await editor.getByRole('button', { name: 'Suggest', exact: true }).click()
  const snippetOptions = editor.getByRole('list', { name: 'Suggested Snippets' })
  await snippetOptions.waitFor({ timeout: 10000 })
  await snippetOptions.getByRole('button', { name: 'Use' }).first().click()
  await page.waitForTimeout(300)
  await shot('ai-snippet')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // 14. Dışa aktarım ekranı
  await palette('Export')
  await page.getByRole('dialog').waitFor({ timeout: 5000 })
  await shot('export')
  await page.keyboard.press('Escape')
} catch (err) {
  process.exitCode = 1
  console.log(`FAIL: ${err.message}`)
  await shot('error').catch(() => undefined)
} finally {
  await app.close().catch(() => undefined)
  ai.close()
  mock.kill()
}

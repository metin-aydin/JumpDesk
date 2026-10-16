// README ekran görüntüleri: İngilizce arayüz, koyu tema, İngilizce adlı mock veri seti (MOCK_DATA=showcase) ve sahte
// bir OpenAI uyumlu sağlayıcı. Mock sunucuyu kendisi ayrı bir portta açar; çalışan geliştirme mock'una dokunmaz.
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

/** Sahte yapay zeka sağlayıcısı: model listesi ve her soruya aynı üç öneri. */
const ai = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.end(JSON.stringify({ data: [{ id: 'llama3.1:8b' }, { id: 'qwen2.5-coder:7b' }] }))
    return
  }
  req.resume()
  req.on('end', () => {
    const answer = {
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
    }
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
  await page.getByRole('button', { name: /OpenAI Compatible/ }).click()
  const aiAddress = page.getByLabel('Address', { exact: true })
  await aiAddress.fill(`http://127.0.0.1:${aiPort}/v1`)
  await aiAddress.press('Enter')
  const modelSelect = page.getByRole('combobox')
  await modelSelect.waitFor({ timeout: 10000 })
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

  // 10. Dışa aktarım ekranı
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

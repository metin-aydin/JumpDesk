// Yapay zeka ayarları ve autocomplete'te yapay zekaya sorma. Test kendi sahte OpenAI uyumlu sunucusunu açar; gelen
// istekler kaydedilir (sunucu verisi gitmediği denetlenir). Kullanım: node dev/e2e/ai.mjs <klasör> (mock açıkken)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { decodeExportFile, login, runPalette, stubFileDialogs } from './helpers.mjs'

const out = process.argv[2] || path.join(os.tmpdir(), 'jumpdesk-ai-shots')
fs.mkdirSync(out, { recursive: true })
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-ai-'))

/** Sahte sağlayıcı: soruya göre sabit öneriler döndürür, her isteği saklar. */
const requests = []
let modelRequests = 0
const answer = (question) => {
  if (/disk/i.test(question))
    return {
      suggestions: [
        { command: 'echo JUMPDESK_AI_OK', description: 'Deneme komutu', risk: 'safe' },
        { command: 'df -h', description: 'Disk kullanımını gösterir', risk: 'safe' },
        { command: 'ls\nreboot', description: 'Çok satırlı', risk: 'safe' }
      ],
      note: ''
    }
  if (/uzun/i.test(question))
    return {
      suggestions: Array.from({ length: 5 }, (_, i) => ({
        command: `echo secenek-${i + 1}`,
        description:
          'Uzun bir açıklama: bu komut listede yer kaplasın diye birkaç satıra yayılan bir metin içerir ve kaydırmayı gerektirir.',
        risk: 'safe'
      })),
      note: ''
    }
  if (/sil/i.test(question))
    return {
      suggestions: [{ command: 'rm -rf /', description: 'Her şeyi siler', risk: 'safe' }],
      note: ''
    }
  return { suggestions: [], note: 'Bu istek sunucu yönetimiyle ilgili değil.' }
}
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    modelRequests++
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'test-model' }, { id: 'other-model' }] }))
    return
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const json = JSON.parse(body || '{}')
    requests.push({ url: req.url, auth: req.headers.authorization, body: json })
    const user = json.messages?.find((m) => m.role === 'user')?.content ?? ''
    const question = user.split('<request>')[1] ?? user
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer(question)) } }] })
    )
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

const app = await electron.launch({
  args: ['--ozone-platform=x11', '--password-store=basic', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_NO_NOTIFY: '1',
    JUMPDESK_USER_DATA: userData
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
const searchCount = async (text) => {
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.press('Control+f')
  await page.getByPlaceholder('Terminalde ara').fill(text)
  await page.waitForTimeout(400)
  const counter = await page
    .getByPlaceholder('Terminalde ara')
    .locator('xpath=..')
    .innerText()
    .catch(() => '')
  await page.keyboard.press('Escape')
  const m = counter.match(/\d+\/(\d+)/)
  return m ? Number(m[1]) : 0
}

try {
  await login(app, page)

  // Ayarlar → Yapay Zeka
  await page.keyboard.press('Control+,')
  await page.getByRole('button', { name: 'Yapay Zeka', exact: true }).click()
  const providerSelect = page.getByRole('combobox', { name: 'Sağlayıcı' })
  const featureSwitch = page.getByRole('switch', { name: 'Yapay Zeka ile Autocomplete' })
  check(
    'feature switches come first, provider below',
    (await featureSwitch.boundingBox()).y < (await providerSelect.boundingBox()).y
  )
  check(
    'provider is a dropdown showing its name',
    (await providerSelect.innerText()).includes('Kullanma')
  )
  await providerSelect.click()
  await page.getByRole('option', { name: 'OpenAI Uyumlu', exact: true }).click()
  await page.waitForTimeout(300)
  // Adres (anahtar) kaydedilmeden model listesi istenmez; model elle yazılamaz
  const modelSelect = page.getByRole('combobox', { name: 'Model' })
  const fieldOrder = await page.evaluate(() =>
    [...document.querySelectorAll('[role=dialog] label')].map((l) => l.textContent.trim())
  )
  check(
    'API key field sits right below the provider dropdown',
    fieldOrder.indexOf('Sağlayıcı') + 1 === fieldOrder.indexOf('API Anahtarı (İsteğe Bağlı)'),
    fieldOrder.join(' | ')
  )
  check(
    'model list is not requested before the address is saved',
    modelRequests === 0 &&
      (await modelSelect.isDisabled()) &&
      (await page.getByText('Model listesi için önce adresi girin.').count()) === 1
  )
  check(
    'model name cannot be typed',
    (await page.getByRole('textbox', { name: 'Model' }).count()) === 0
  )
  await page.getByLabel('Adres', { exact: true }).fill(`http://127.0.0.1:${port}/v1`)
  await page.getByLabel('Adres', { exact: true }).press('Enter')
  // Model listesi sağlayıcıdan gelir; listeden seçilir
  await page.getByText('2 model').waitFor({ timeout: 10000 })
  check('model list loaded from provider', modelRequests >= 1 && !(await modelSelect.isDisabled()))
  await modelSelect.click()
  await page.getByRole('option', { name: 'test-model' }).click()
  await page.waitForTimeout(300)
  check('model selected from list', (await modelSelect.innerText()).includes('test-model'))
  await page.getByLabel('API Anahtarı (İsteğe Bağlı)').fill('test-secret-key')
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click()
  await page.getByText('Kayıtlı (gizli)').waitFor({ timeout: 5000 })
  check('secret saved and hidden', true)
  await page.getByRole('button', { name: 'Bağlantıyı Dene' }).click()
  await page.getByText(/Bağlantı çalışıyor/).waitFor({ timeout: 10000 })
  check('connection test works', requests.at(-1)?.auth === 'Bearer test-secret-key')
  await page.getByRole('switch', { name: 'Yapay Zeka ile Autocomplete' }).click()
  await page.waitForTimeout(300)
  await shot('ai-01-settings')
  await page.keyboard.press('Escape')

  const config = await page.evaluate(() => window.jumpdesk.ai.getConfig())
  check('renderer never receives the key', !JSON.stringify(config).includes('test-secret-key'))
  await page.waitForTimeout(500)
  check(
    'key not stored in plain text',
    !fs.readFileSync(path.join(userData, 'jumpdesk.json'), 'utf8').includes('test-secret-key')
  )

  // Dışa aktarıma yapay zeka ayarları girmez
  const exported = path.join(userData, 'all.jumpdesk')
  await stubFileDialogs(app, { save: exported })
  await runPalette(page, 'Dışa Aktar')
  await page.getByRole('dialog', { name: 'Dışa Aktar' }).waitFor({ timeout: 5000 })
  await page.getByRole('button', { name: /^Dışa Aktar \(/ }).click()
  await page.waitForTimeout(800)
  const bundle = decodeExportFile(exported)
  const raw = JSON.stringify(bundle.payload)
  check(
    'export has no AI settings',
    bundle.ok &&
      !raw.includes('test-secret-key') &&
      !raw.includes(`127.0.0.1:${port}`) &&
      !/"ai"/.test(raw)
  )

  // Terminal: Ctrl+Space iki kez → yapay zekaya sor
  await page.getByRole('tree').getByText('jump-ops', { exact: true }).dblclick()
  await page.waitForTimeout(4000)
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.press('Control+Space')
  await page.waitForTimeout(300)
  check('autocomplete shows ask-AI row', (await page.getByText('Yapay zekaya sor…').count()) === 1)
  await page.keyboard.press('Control+Space')
  const dialog = page.getByRole('dialog', { name: 'Yapay Zekaya Sor' })
  await dialog.waitFor({ timeout: 5000 })
  await page.keyboard.type('kalan disk alanını göster')
  await page.keyboard.press('Enter')
  await dialog.getByRole('option').first().waitFor({ timeout: 10000 })
  const askBox = dialog.getByLabel('Yapay Zekaya Sorulacak Metin')
  check('input cleared after asking', (await askBox.inputValue()) === '')
  check(
    'asked question shown as bubble',
    (await dialog.getByText('kalan disk alanını göster', { exact: true }).count()) === 1
  )
  const options = await dialog.getByRole('option').allInnerTexts()
  check(
    'AI answers as options',
    options.length === 2 && options[0].includes('echo JUMPDESK_AI_OK'),
    options.join(' | ')
  )
  check('multi-line command dropped', !options.some((o) => o.includes('reboot')))
  await shot('ai-02-options')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  check('dialog closes after pick', (await dialog.count()) === 0)
  check('command written, not run', (await searchCount('JUMPDESK_AI_OK')) === 1)
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  check('runs after Enter', (await searchCount('JUMPDESK_AI_OK')) === 2)

  // Uzun listede klavyeyle seçilen öneri görünür alana kaydırılır; önceki soru bağlam olarak gösterilir
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.press('Control+Space')
  await page.waitForTimeout(200)
  await page.keyboard.press('Control+Space')
  await dialog.waitFor({ timeout: 5000 })
  await page.keyboard.type('uzun liste')
  await page.keyboard.press('Enter')
  await dialog.getByRole('option').nth(4).waitFor({ timeout: 10000 })
  check('context indicator shown', (await dialog.getByText(/önceki soru bağlamda/).count()) === 1)
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  const visible = await dialog.evaluate((el) => {
    const list = el.querySelector('[data-index]').parentElement
    const item = el.querySelector('[aria-selected="true"]')
    const l = list.getBoundingClientRect()
    const r = item.getBoundingClientRect()
    return {
      overflow: list.scrollHeight > list.clientHeight,
      inside: r.top >= l.top - 1 && r.bottom <= l.bottom + 1,
      index: item.dataset.index
    }
  })
  check(
    'selected option scrolled into view',
    visible.overflow && visible.inside && visible.index === '4',
    JSON.stringify(visible)
  )
  await shot('ai-02b-scrolled')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Riskli öneri: kural listesi işaretler, yazmadan önce onay ister
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.press('Control+Space')
  await page.waitForTimeout(200)
  await page.keyboard.press('Control+Space')
  await dialog.waitFor({ timeout: 5000 })
  await page.keyboard.type('her şeyi sil')
  await page.keyboard.press('Enter')
  await dialog.getByRole('option').first().waitFor({ timeout: 10000 })
  check(
    'dangerous command flagged',
    (await dialog.getByText('Riskli', { exact: true }).count()) === 1
  )
  await page.keyboard.press('Enter')
  const confirm = page.getByRole('dialog', { name: 'Riskli Komut' })
  await confirm.waitFor({ timeout: 5000 })
  check('dangerous command needs confirmation', true)
  await shot('ai-03-dangerous')
  await confirm.getByRole('button', { name: 'Vazgeç' }).click()
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('cancelled command not written', (await searchCount('rm -rf /')) === 0)

  // Gönderilen istekler: yalnız soru, önceki sorular ve sunucu türü
  const sent = requests.slice(1).map((r) => JSON.stringify(r.body.messages))
  const leaked = sent.filter((s) => /jump-ops|192\.168|10\.12|root@|127\.0\.0\.1/.test(s))
  check(
    'no server data sent to AI',
    sent.length >= 2 && leaked.length === 0,
    leaked[0]?.slice(0, 200)
  )
  check(
    'server type sent',
    sent.every((s) => s.includes('Linux'))
  )
  check('earlier question sent as context', sent.at(-1).includes('kalan disk alanını göster'))
  check(
    'system prompt treats request as untrusted',
    requests.at(-1).body.messages[0].content.includes('untrusted data')
  )
} catch (err) {
  failed = true
  console.log(`FAIL: ${err.message}`)
  await shot('ai-error').catch(() => undefined)
} finally {
  await app.close()
  server.close()
  process.exitCode = failed ? 1 : 0
}

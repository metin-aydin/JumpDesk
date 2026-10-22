// Yapay zeka ayarları, autocomplete'te yapay zekaya sorma, snippet ve kural üretme, seçili çıktıyı ve alarm olayını
// açıklama. Test kendi sahte OpenAI uyumlu sunucusunu açar; gelen istekler türüyle kaydedilir (sunucu verisi
// gitmediği, açıklamada metnin yalnız onaydan sonra gittiği denetlenir). Kullanım: node dev/e2e/ai.mjs <klasör>
// (mock açıkken)
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
const SNIPPET_ANSWER = {
  options: [
    {
      name: 'Nginx Hata Logu',
      command: 'tail -f /var/log/nginx/error.log',
      description: 'Hata logunu canlı izler',
      risk: 'safe'
    }
  ],
  note: ''
}
const RULE_ANSWER = {
  options: [
    {
      pattern: 'OutOfMemoryError|Connection refused',
      regex: true,
      caseSensitive: false,
      description: 'Bellek ve bağlantı hataları'
    },
    { pattern: 'Timeout', regex: false, caseSensitive: false, description: 'Zaman aşımı' }
  ],
  note: ''
}
const EXPLAIN_ANSWER = {
  summary: 'JD_EXPLAIN_SUMMARY',
  points: ['Olası neden'],
  suggestions: [{ command: 'echo JD_EXPLAIN_CMD', description: 'Deneme', risk: 'safe' }],
  note: ''
}
const kindOf = (system) =>
  /snippet writer/.test(system)
    ? 'snippet'
    : /rule writer/.test(system)
      ? 'rule'
      : /terminal text explainer/.test(system)
        ? 'explain'
        : 'suggest'
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
    const system = json.messages?.find((m) => m.role === 'system')?.content ?? ''
    const user = json.messages?.find((m) => m.role === 'user')?.content ?? ''
    const kind = kindOf(system)
    requests.push({ url: req.url, auth: req.headers.authorization, body: json, kind, user })
    const question = user.split('<request>')[1] ?? user
    const payload =
      kind === 'snippet'
        ? SNIPPET_ANSWER
        : kind === 'rule'
          ? RULE_ANSWER
          : kind === 'explain'
            ? EXPLAIN_ANSWER
            : answer(question)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }))
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
    JUMPDESK_DISABLE_WEBGL: '1',
    JUMPDESK_ALARM_WARMUP_MS: '0',
    JUMPDESK_ALARM_SNIPPET_WAIT_MS: '0',
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
  check(
    'five AI feature switches on top',
    (await page.getByRole('dialog').getByRole('switch').count()) === 5
  )
  await providerSelect.click()
  await page.getByRole('option', { name: 'Yerel Model Sunucusu', exact: true }).click()
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

  // Snippet üretme: tarif → seçenek → Kullan forma koyar; yalnız tarif gider. Açıkla komutu açıklatır.
  await runPalette(page, 'Snippetleri Düzenle')
  const editor = page.getByRole('dialog')
  await editor.getByLabel('Snippet Tarifi').fill('nginx hata logunu izle')
  await editor.getByRole('button', { name: 'Öner', exact: true }).click()
  const snippetOption = editor.getByRole('listitem').first()
  await snippetOption.waitFor({ timeout: 10000 })
  await snippetOption.getByRole('button', { name: 'Kullan' }).click()
  check(
    'snippet suggestion fills the form',
    (await editor.getByLabel('Ad', { exact: true }).inputValue()) === 'Nginx Hata Logu' &&
      (await editor.getByLabel('Komut', { exact: true }).inputValue()) ===
        'tail -f /var/log/nginx/error.log'
  )
  const snippetRequest = requests.filter((r) => r.kind === 'snippet').at(-1)
  check(
    'only the description is sent for a snippet',
    Boolean(snippetRequest?.user.includes('nginx hata logunu izle')) &&
      !/jump-ops|192\.168|root@/.test(snippetRequest.user)
  )
  await editor.getByRole('button', { name: 'Açıkla', exact: true }).click()
  await editor.locator('[data-ai-explanation]').waitFor({ timeout: 10000 })
  check(
    'command explanation shown in the editor',
    (await editor.locator('[data-ai-explanation]').innerText()).includes('JD_EXPLAIN_SUMMARY') &&
      requests.at(-1).kind === 'explain' &&
      requests.at(-1).user.includes('tail -f /var/log/nginx/error.log')
  )
  await page.waitForTimeout(400)
  await shot('ai-04-snippet')
  await editor.getByRole('button', { name: 'Ekle', exact: true }).click()
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Kural üretme: tarif + örnek satır → eşleşme durumu → Kullan alarm kuralı formuna koyar
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 5000 })
  await page.waitForTimeout(300)
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await runPalette(page, 'Alarmlar Panelini Aç')
  await page.getByRole('button', { name: /^Kurallar/ }).click()
  const rulesDialog = page.getByRole('dialog', { name: 'Alarm Kuralları' })
  await rulesDialog.getByRole('button', { name: 'Yapay Zekayla Kural Oluştur' }).click()
  await page.getByLabel('Yakalanacak Şeyin Tarifi').fill('bellek ve bağlantı hataları')
  await page.getByLabel('Örnek Satır').fill('java.lang.OutOfMemoryError: Java heap space')
  await page.getByRole('button', { name: 'Kural Öner' }).click()
  const ruleOptions = page.getByRole('list', { name: 'Önerilen Kurallar' }).getByRole('listitem')
  await ruleOptions.first().waitFor({ timeout: 10000 })
  check(
    'rule suggestions are tested against the sample',
    (await ruleOptions.nth(0).innerText()).includes('Örnek satırda eşleşiyor') &&
      (await ruleOptions.nth(1).innerText()).includes('Örnek satırda eşleşmiyor')
  )
  await shot('ai-05-rule')
  await ruleOptions.nth(0).getByRole('button', { name: 'Kullan' }).click()
  await page.waitForTimeout(200)
  check(
    'Use fills the rule form',
    (await rulesDialog.getByPlaceholder('Kelime ya da düzenli ifade').inputValue()) ===
      'OutOfMemoryError|Connection refused' &&
      (await rulesDialog
        .getByRole('button', { name: 'Düzenli İfade' })
        .getAttribute('aria-pressed')) === 'true'
  )
  check(
    'rule request carries the description and the sample',
    requests.at(-1).kind === 'rule' && requests.at(-1).user.includes('<sample>')
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Seçili çıktıyı açıklama: seçince "Açıkla"; onay penceresi metni gösterir, Gönder'den önce istek gitmez
  const terminalRows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.xterm-rows')]
        .find((e) => e.getBoundingClientRect().width > 0)
        .innerText.split('\n')
        .map((l) => l.replace(/ /g, ' ').trimEnd())
    )
  const selectWord = async (word) => {
    const at = await page.evaluate((w) => {
      const container = [...document.querySelectorAll('.xterm-rows')].find(
        (e) => e.getBoundingClientRect().width > 0
      )
      const row = [...container.children].reverse().find((r) => r.textContent.trim() === w)
      const r = row.getBoundingClientRect()
      return { x: r.left + 20, y: r.top + r.height / 2 }
    }, word)
    await page.mouse.dblclick(at.x, at.y)
    await page.waitForTimeout(300)
  }
  await page.locator('.xterm-helper-textarea:visible').first().focus()
  await page.keyboard.type('echo JD_SELECT_ME\n')
  await page.waitForTimeout(800)
  await selectWord('JD_SELECT_ME')
  const chip = page.locator('[data-ai-explain-chip]')
  await chip.waitFor({ timeout: 5000 })
  check('selection shows the Explain button', true)
  const beforeExplain = requests.length
  await chip.click()
  const explainDialog = page.getByRole('dialog', { name: 'Seçimi Yapay Zekaya Sor' })
  await explainDialog.waitFor({ timeout: 5000 })
  check(
    'confirmation shows the exact text and sends nothing yet',
    (await explainDialog.getByLabel('Gönderilecek Metin').innerText()).trim() === 'JD_SELECT_ME' &&
      requests.length === beforeExplain
  )
  await page.waitForTimeout(400)
  await shot('ai-06-explain-confirm')
  await explainDialog.getByRole('button', { name: 'Vazgeç' }).click()
  await page.waitForTimeout(300)
  check('cancelling sends nothing', requests.length === beforeExplain)
  await selectWord('JD_SELECT_ME')
  await chip.click()
  await explainDialog.waitFor({ timeout: 5000 })
  await explainDialog.getByRole('button', { name: 'Gönder' }).click()
  await explainDialog.locator('[data-ai-explanation]').waitFor({ timeout: 10000 })
  check(
    'explanation shown after sending the selection',
    (await explainDialog.innerText()).includes('JD_EXPLAIN_SUMMARY') &&
      requests.at(-1).kind === 'explain' &&
      requests.at(-1).user.includes('<text>\nJD_SELECT_ME\n</text>')
  )
  await page.waitForTimeout(400)
  await shot('ai-07-explain-result')
  await explainDialog.getByRole('button', { name: 'Komut Satırına Yaz' }).click()
  await page.waitForTimeout(700)
  const promptAfterWrite = (await terminalRows()).filter((l) => l.trim()).at(-1) ?? ''
  check(
    'suggested command written to the command line, not run',
    promptAfterWrite.endsWith('echo JD_EXPLAIN_CMD') &&
      !(await terminalRows()).includes('JD_EXPLAIN_CMD'),
    promptAfterWrite
  )
  await page.keyboard.press('Control+U')
  await page.waitForTimeout(300)

  // Alarm olayını açıklama: alarm satırı ve önceki satırlar onaydan sonra gider
  await page.keyboard.type('echo JD_CONTEXT_LINE; echo "java.lang.Exception: JD_ALARM_BOOM"\n')
  await page.waitForTimeout(1000)
  await runPalette(page, 'Alarmlar Panelini Aç')
  const eventRow = page.getByRole('button', { name: /JD_ALARM_BOOM/ }).first()
  await eventRow.waitFor({ timeout: 5000 })
  await eventRow.hover()
  await eventRow.getByRole('button', { name: 'Yapay Zekaya Sor' }).click()
  const alarmDialog = page.getByRole('dialog', { name: 'Alarmı Yapay Zekaya Sor' })
  await alarmDialog.waitFor({ timeout: 5000 })
  const alarmPreview = await alarmDialog.getByLabel('Gönderilecek Metin').innerText()
  check(
    'alarm confirmation shows the line with the lines before it',
    alarmPreview.includes('JD_CONTEXT_LINE') && alarmPreview.includes('JD_ALARM_BOOM'),
    alarmPreview.replace(/\s+/g, ' ').slice(0, 200)
  )
  await shot('ai-08-alarm-confirm')
  await alarmDialog.getByRole('button', { name: 'Gönder' }).click()
  await alarmDialog.locator('[data-ai-explanation]').waitFor({ timeout: 10000 })
  check(
    'alarm explanation request has the context',
    requests.at(-1).kind === 'explain' &&
      /<context>[\s\S]*JD_CONTEXT_LINE[\s\S]*<\/context>/.test(requests.at(-1).user) &&
      requests.at(-1).user.includes('JD_ALARM_BOOM')
  )
  await alarmDialog.getByRole('button', { name: 'Kapat' }).click()
  await page.waitForTimeout(300)

  // Özellik kapatılınca seçimde düğme çıkmaz
  await page.keyboard.press('Control+,')
  await page.getByRole('button', { name: 'Yapay Zeka', exact: true }).click()
  await page.getByRole('switch', { name: 'Seçili Çıktıyı Açıklama' }).click()
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await selectWord('JD_SELECT_ME')
  check('no Explain button when the feature is off', (await chip.count()) === 0)
} catch (err) {
  failed = true
  console.log(`FAIL: ${err.message}`)
  await shot('ai-error').catch(() => undefined)
} finally {
  await app.close()
  server.close()
  process.exitCode = failed ? 1 : 0
}

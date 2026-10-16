// Sunucu adresi uygulamada gömülü değildir: ilk açılışta adres alanı boş gelir, girilen adres kaydedilir ve sonraki
// açılışta hazır gelir. Kullanım: node dev/e2e/server-address.mjs (mock açıkken)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const MOCK = 'http://127.0.0.1:18080'
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-address-'))
let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const env = {
  ...process.env,
  JUMPDESK_LANGUAGE: 'tr',
  JUMPDESK_HIDE_WINDOW: '1',
  JUMPDESK_OFFSCREEN: '1',
  JUMPDESK_USER_DATA: userData
}
delete env.JUMPDESK_SERVER
const launch = () => electron.launch({ args: ['--ozone-platform=x11', 'out/main/index.js'], env })

let app = await launch()
try {
  let page = await app.firstWindow()
  const address = () => page.getByLabel('Sunucu Adresi')
  await address().waitFor({ timeout: 15000 })
  check(
    'first run: address empty',
    (await address().inputValue()) === '',
    await address().inputValue()
  )
  check(
    'first run: continue disabled',
    await page.getByRole('button', { name: 'Devam' }).isDisabled()
  )

  await login(app, page, { server: MOCK })
  check('login with entered address', true)
  await page.getByRole('button', { name: /demo/ }).click()
  await page.getByText('Çıkış Yap').click()
  await address().waitFor({ timeout: 10000 })
  check('after logout: entered address shown', (await address().inputValue()) === MOCK)
  await app.close()

  app = await launch()
  page = await app.firstWindow()
  await page.getByLabel('Sunucu Adresi').waitFor({ timeout: 15000 })
  check(
    'next launch: saved address prefilled',
    (await page.getByLabel('Sunucu Adresi').inputValue()) === MOCK,
    await page.getByLabel('Sunucu Adresi').inputValue()
  )
  const saved = JSON.parse(fs.readFileSync(path.join(userData, 'jumpdesk.json'), 'utf8')).settings
  check(
    'saved in settings',
    saved.server === MOCK && saved.recentServers?.[0] === MOCK,
    JSON.stringify(saved)
  )
} catch (err) {
  failed = true
  console.log(`FAIL: ${err.message}`)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

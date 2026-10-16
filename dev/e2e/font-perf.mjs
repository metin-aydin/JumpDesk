// Çok sayıda açık oturumda terminal yazı boyutunu değiştirmenin arayüzü ne kadar kilitlediğini ölçer (uzun görevler).
// Terminaller DOM çiziciyle çizilir (JUMPDESK_DISABLE_WEBGL): WebGL'siz makinelerdeki en pahalı yol ölçülür ve
// yazı boyutu satır öğelerinden okunabilir (WebGL kipinde boyut yalnız tuvalde görünür).
// Kullanım: node dev/e2e/font-perf.mjs [oturum-sayısı]
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { login } from './helpers.mjs'

const sessions = Number(process.argv[2] || 12)
let failed = false
const check = (name, ok, detail = '') => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const app = await electron.launch({
  args: ['--ozone-platform=x11', 'out/main/index.js'],
  env: {
    ...process.env,
    JUMPDESK_LANGUAGE: 'tr',
    JUMPDESK_SERVER: process.env.JUMPDESK_SERVER || 'http://127.0.0.1:18080',
    JUMPDESK_HIDE_WINDOW: '1',
    JUMPDESK_OFFSCREEN: '1',
    JUMPDESK_NO_NOTIFY: '1',
    JUMPDESK_DISABLE_WEBGL: '1',
    JUMPDESK_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-fontperf-'))
  }
})
const page = await app.firstWindow()
try {
  await login(app, page)
  const node = page.getByRole('tree').getByText('jump-ops', { exact: true })
  await node.waitFor({ timeout: 15000 })
  for (let i = 0; i < sessions; i++) {
    await node.dblclick()
    await page.waitForTimeout(250)
  }
  await page.waitForFunction(
    (n) => [...document.querySelectorAll('[data-tab-strip] [role=tab] .bg-success')].length >= n,
    sessions,
    { timeout: 60000 }
  )
  // Her terminale biraz çıktı (vurgu taraması da çalışsın)
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    window.__long = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__long.push(e.duration)
    }).observe({ type: 'longtask', buffered: false })
  })
  await page.keyboard.press('Control+,')
  await page.getByRole('heading', { name: 'Yazı Boyutu' }).waitFor({ timeout: 5000 })
  const t0 = Date.now()
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: 'Terminal (SSH) Yazısını Büyüt' }).click()
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(1200)
  const long = await page.evaluate(() => window.__long)
  const total = Math.round(long.reduce((a, b) => a + b, 0))
  const max = Math.round(Math.max(0, ...long))
  console.log(
    `${sessions} oturum, 6 adım: uzun görev sayısı ${long.length}, toplam ${total} ms, en uzun ${max} ms (${Date.now() - t0} ms içinde)`
  )
  check('no long freeze while changing terminal font', max < 400, `${max} ms`)
  await page.keyboard.press('Escape')
  // Gizli bir sekmeye geçince yeni boyut uygulanmış olmalı (ertelenen güncelleme)
  await page.locator('[data-tab-strip] [role=tab]').first().click()
  await page.waitForTimeout(600)
  const size = await page.evaluate(() => {
    const hosts = [...document.querySelectorAll('[data-tab-host]')].filter(
      (h) => h.getBoundingClientRect().width > 0
    )
    const rows = hosts[0]?.querySelector('.xterm-rows')
    return rows ? getComputedStyle(rows).fontSize : null
  })
  check('hidden terminal gets new size when shown', size === '19px', `${size}`)
} catch (err) {
  failed = true
  console.log(`FAIL: ${err.message}`)
} finally {
  await app.close()
  process.exitCode = failed ? 1 : 0
}

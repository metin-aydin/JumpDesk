// e2e testlerinin ortak adımları: sunucu adresi ekranı + mock giriş formu, şifreli .jumpdesk dosyası üretme ve içe
// aktarma (ana süreçteki dosya seçme penceresi taklit edilir).
import { buildSync } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')

/**
 * Giriş: adres ekranında (adres JUMPDESK_SERVER ile hazır gelir) Devam'a basar, ardından mock giriş formunu doldurur.
 * `server` verilirse adres kutusuna o yazılır.
 */
export async function login(app, page, { user = 'demo', server } = {}) {
  const address = page.getByLabel('Sunucu Adresi')
  await address.waitFor({ timeout: 15000 })
  if (server !== undefined) await address.fill(server)
  await page.getByRole('button', { name: 'Devam' }).click()
  for (let i = 0; i < 100; i++) {
    const done = await app.evaluate(async ({ webContents }, u) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => w.getURL().includes('/core/auth/login/'))
      if (!wc || wc.isLoading()) return false
      await wc.executeJavaScript(
        `document.querySelector('[name=username]').value=${JSON.stringify(u)};document.querySelector('[name=password]').value='demo';document.querySelector('form').submit()`
      )
      return true
    }, user)
    if (done) break
    await page.waitForTimeout(150)
  }
  await page.getByRole('tree').waitFor({ timeout: 15000 })
}

let format
/** Uygulamanın kendi şifreleme kodu (src/main/transfer-format.ts) esbuild ile paketlenip yüklenir. */
function transferFormat() {
  if (format) return format
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jumpdesk-format-'))
  const outfile = path.join(dir, 'transfer-format.cjs')
  buildSync({
    entryPoints: [path.join(root, 'src/main/transfer-format.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'warning'
  })
  format = createRequire(import.meta.url)(outfile)
  return format
}

/** Verilen bölümlerle şifreli dışa aktarım dosyası yazar ve yolunu döndürür. */
export function writeExportFile(
  dir,
  sections,
  { username = 'demo', server = '127.0.0.1:18080', name } = {}
) {
  const { encodeExport, exportFileName } = transferFormat()
  const file = path.join(dir, name ?? exportFileName(username))
  const payload = {
    format: 'jumpdesk-export',
    version: 1,
    app: 'test',
    exportedAt: new Date().toISOString(),
    user: { username, server },
    sections
  }
  fs.writeFileSync(file, encodeExport(payload))
  return file
}

export function decodeExportFile(file) {
  return transferFormat().decodeExport(fs.readFileSync(file))
}

/** Testlerin kullandığı snippetler (gerçek listeden bir bölüm). */
export const FIXTURE_SNIPPETS = JSON.parse(
  fs.readFileSync(path.join(root, 'dev/e2e/fixtures/snippets.json'), 'utf8')
)

/** Ana süreçteki dosya açma/kaydetme pencerelerini verilen yollarla yanıtlayacak şekilde değiştirir. */
export async function stubFileDialogs(app, { open, save } = {}) {
  await app.evaluate(
    ({ dialog }, paths) => {
      if (paths.open !== undefined)
        dialog.showOpenDialog = async () => ({
          canceled: !paths.open,
          filePaths: paths.open ? [paths.open] : []
        })
      if (paths.save !== undefined)
        dialog.showSaveDialog = async (_win, opts) => {
          globalThis.__jumpdeskSaveDefault = opts?.defaultPath
          return { canceled: !paths.save, filePath: paths.save }
        }
    },
    { open, save }
  )
}

/**
 * Komut paletinde komutu çalıştırır. Palet kapanma animasyonu bitmeden yeniden açılırsa önceki aramayı tutar; arama
 * kutusu bu yüzden yazmadan önce temizlenir.
 */
export async function runPalette(page, text) {
  await page.keyboard.press('Control+Shift+P')
  const input = page.getByPlaceholder('Komut, sekme, düzen ya da snippet ara…')
  await input.waitFor({ timeout: 5000 })
  await input.fill(text)
  await page.waitForTimeout(200)
  await page.keyboard.press('Enter')
}

/** Dosyayı komut paletindeki İçe Aktar… ile açar ve içe aktarım ekranında seçili bölümleri içe aktarır. */
export async function importFile(app, page, file) {
  await stubFileDialogs(app, { open: file })
  await runPalette(page, 'İçe Aktar')
  const dialog = page.getByRole('dialog', { name: 'İçe Aktar' })
  await dialog.waitFor({ timeout: 5000 })
  await dialog.getByRole('button', { name: /^İçe Aktar/ }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 5000 })
}

/** Snippet fixture'ını içe aktarır. */
export async function importFixtureSnippets(app, page, dir) {
  const file = writeExportFile(
    dir,
    { snippets: FIXTURE_SNIPPETS },
    { name: 'fixture-snippets.jumpdesk' }
  )
  await importFile(app, page, file)
}

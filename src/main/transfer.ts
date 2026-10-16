import { app, dialog, type BrowserWindow } from 'electron'
import { readFile, stat, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import type { TransferOpenResult } from '@shared/api'
import { decodeExport, encodeExport, EXPORT_EXTENSION, exportFileName } from './transfer-format'
import { mt } from './i18n'

const MAX_IMPORT_BYTES = 20 * 1024 * 1024
const filters = (): Electron.FileFilter[] => [
  { name: mt('JumpDesk Dışa Aktarım Dosyası'), extensions: [EXPORT_EXTENSION] }
]

/** Kayıt penceresinde seçilen yere şifreli dosyayı yazar; vazgeçilirse null döner. */
export async function saveExport(
  win: BrowserWindow,
  payload: unknown,
  username: string
): Promise<{ path: string } | null> {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: mt('Dışa Aktar'),
    defaultPath: join(app.getPath('downloads'), exportFileName(username)),
    filters: filters(),
    properties: ['showOverwriteConfirmation', 'createDirectory']
  })
  if (canceled || !filePath) return null
  const target = filePath.endsWith(`.${EXPORT_EXTENSION}`)
    ? filePath
    : `${filePath}.${EXPORT_EXTENSION}`
  await writeFile(target, encodeExport(payload))
  return { path: target }
}

/** Seçilen dosyayı okuyup çözer; geçerli bir JumpDesk dışa aktarım dosyası değilse nedeni döner. */
export async function openImport(win: BrowserWindow): Promise<TransferOpenResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: mt('İçe Aktar'),
    defaultPath: app.getPath('downloads'),
    filters: filters(),
    properties: ['openFile']
  })
  const path = filePaths[0]
  if (canceled || !path) return { status: 'canceled' }
  const name = basename(path)
  try {
    if ((await stat(path)).size > MAX_IMPORT_BYTES)
      return { status: 'error', name, error: 'too-large' }
    const result = decodeExport(await readFile(path))
    return result.ok
      ? { status: 'ok', name, payload: result.payload }
      : { status: 'error', name, error: result.error }
  } catch {
    return { status: 'error', name, error: 'read-failed' }
  }
}

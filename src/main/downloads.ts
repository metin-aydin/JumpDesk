import { app, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { mt } from './i18n'

/**
 * Uzak sunucudan parça parça gelen dosyaları İndirilenler klasörüne akıtarak yazar; büyük dosyalar bellekte
 * biriktirilmez. Aynı adlı dosya varsa `ad (1).uzantı` biçiminde yeni ad seçilir.
 */
interface OpenDownload {
  stream: fs.WriteStream
  path: string
}

const open = new Map<string, OpenDownload>()

function safeName(name: string): string {
  const base = Array.from(path.basename(name).replace(/[\\/:*?"<>|]/g, '_'))
    .map((c) => (c.charCodeAt(0) < 32 ? '_' : c))
    .join('')
    .trim()
  return base && base !== '.' && base !== '..' ? base : 'indirilen-dosya'
}

function uniquePath(dir: string, name: string): string {
  const ext = path.extname(name)
  const stem = name.slice(0, name.length - ext.length)
  let candidate = path.join(dir, name)
  for (let i = 1; fs.existsSync(candidate); i++) candidate = path.join(dir, `${stem} (${i})${ext}`)
  return candidate
}

export const downloads = {
  begin(name: string): { id: string; path: string } {
    const dir = app.getPath('downloads')
    fs.mkdirSync(dir, { recursive: true })
    const target = uniquePath(dir, safeName(name))
    const id = crypto.randomUUID()
    open.set(id, { stream: fs.createWriteStream(target, { flags: 'wx' }), path: target })
    return { id, path: target }
  },

  write(id: string, data: Uint8Array): Promise<void> {
    const entry = open.get(id)
    if (!entry) return Promise.reject(new Error(mt('İndirme bulunamadı')))
    return new Promise((resolve, reject) => {
      entry.stream.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength), (err) =>
        err ? reject(err) : resolve()
      )
    })
  },

  /** `ok` değilse yarım dosya silinir. */
  end(id: string, ok: boolean): Promise<string | null> {
    const entry = open.get(id)
    open.delete(id)
    if (!entry) return Promise.resolve(null)
    return new Promise((resolve) => {
      entry.stream.end(() => {
        if (ok) return resolve(entry.path)
        fs.rm(entry.path, { force: true }, () => resolve(null))
      })
    })
  },

  /** Yalnız İndirilenler klasöründeki dosyalar gösterilir. */
  showInFolder(target: string): void {
    const resolved = path.resolve(target)
    if (
      path.dirname(resolved) === path.resolve(app.getPath('downloads')) &&
      fs.existsSync(resolved)
    ) {
      shell.showItemInFolder(resolved)
    }
  }
}

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { gunzipSync, gzipSync } from 'zlib'

/**
 * JumpDesk dışa aktarım dosyası (`.jumpdesk`): `JUMPDESK` + biçim sürümü (1 bayt) başlığı, 12 baytlık rastgele IV,
 * AES-256-GCM ile şifrelenmiş gzip'li JSON ve 16 baytlık doğrulama etiketi. Başlık ek doğrulanmış veri (AAD) olarak
 * şifrelemeye katılır; dosyanın tek bir baytı değişse de çözme başarısız olur. Anahtar uygulamaya gömülüdür: dosya
 * yalnız JumpDesk ile açılır ve bozulmuş ya da başka uygulamadan gelen dosya içe aktarılmaz.
 */
export const EXPORT_EXTENSION = 'jumpdesk'
export const EXPORT_FORMAT = 'jumpdesk-export'

const MAGIC = Buffer.from('JUMPDESK', 'ascii')
const VERSION = 1
const IV_LENGTH = 12
const TAG_LENGTH = 16
const HEADER_LENGTH = MAGIC.length + 1

let cachedKey: Buffer | null = null
function key(): Buffer {
  cachedKey ??= scryptSync('jumpdesk/export/v1', 'jumpdesk-export-v1', 32)
  return cachedKey
}

export type DecodeError = 'not-jumpdesk' | 'unsupported-version' | 'corrupt' | 'wrong-format'

export function encodeExport(payload: unknown): Buffer {
  const header = Buffer.concat([MAGIC, Buffer.from([VERSION])])
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(header)
  const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify(payload))), cipher.final()])
  return Buffer.concat([header, iv, body, cipher.getAuthTag()])
}

export function decodeExport(
  file: Buffer
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: DecodeError } {
  if (
    file.length < HEADER_LENGTH + IV_LENGTH + TAG_LENGTH ||
    !file.subarray(0, MAGIC.length).equals(MAGIC)
  )
    return { ok: false, error: 'not-jumpdesk' }
  if (file[MAGIC.length] !== VERSION) return { ok: false, error: 'unsupported-version' }
  const header = file.subarray(0, HEADER_LENGTH)
  const iv = file.subarray(HEADER_LENGTH, HEADER_LENGTH + IV_LENGTH)
  const tag = file.subarray(file.length - TAG_LENGTH)
  const body = file.subarray(HEADER_LENGTH + IV_LENGTH, file.length - TAG_LENGTH)
  let payload: unknown
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), iv)
    decipher.setAAD(header)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(body), decipher.final()])
    payload = JSON.parse(gunzipSync(plain).toString('utf8'))
  } catch {
    return { ok: false, error: 'corrupt' }
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    (payload as Record<string, unknown>)['format'] !== EXPORT_FORMAT
  )
    return { ok: false, error: 'wrong-format' }
  return { ok: true, payload: payload as Record<string, unknown> }
}

/**
 * Dışa aktarım dosyasının adı: kullanıcı adındaki harf ve rakam dışındaki karakterler `_` olur, sonuna yerel tarih ve
 * saat (`YYYYMMDDHHmmss`) eklenir.
 */
export function exportFileName(username: string, now = new Date()): string {
  const safe = Array.from(username)
    .map((c) => (/[\p{L}\p{N}]/u.test(c) ? c : '_'))
    .join('')
  const p = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `${safe || 'jumpdesk'}_${stamp}.${EXPORT_EXTENSION}`
}

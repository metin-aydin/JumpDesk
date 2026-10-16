/**
 * Kullanıcıya özel kalıcı kayıtlar (localStorage). Anahtarlar giriş yapan kullanıcının kapsamıyla (sunucu + kullanıcı
 * adı) öneklenir; giriş yokken okumalar boş döner, yazmalar yapılmaz. Kapsam değişince kayıtlı dinleyiciler çağrılır
 * ve depolar yeni kullanıcının kayıtlarını yükler.
 */

const USER_PREFIX = 'jumpdesk.user/'
const LEGACY_PREFIX = 'jumpdesk.'
/** Kullanıcı kapsamı olmayan eski kayıtların taşındığı kullanıcı; bir kez, ilk giriş yapan kullanıcıya taşınır. */
const LEGACY_OWNER_KEY = 'jumpdesk.legacyOwner'

let scope: string | null = null
const listeners = new Set<() => void>()
/** Eski sürümde localStorage dışında tutulan değerler (ör. tema); taşınırken ilk kullanıcıya yazılır. */
const legacyProviders = new Map<string, () => string | null>()

const fullKey = (key: string): string | null => (scope ? `${USER_PREFIX}${scope}/${key}` : null)

export function currentUserScope(): string | null {
  return scope
}

export function readUserItem(key: string): string | null {
  const k = fullKey(key)
  if (!k) return null
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

export function writeUserItem(key: string, value: string): void {
  const k = fullKey(key)
  if (!k) return
  try {
    localStorage.setItem(k, value)
  } catch {
    /* kayıt yalnız bu oturumda geçerli kalır */
  }
}

export function readUserJson<T>(key: string): T | null {
  const raw = readUserItem(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeUserJson(key: string, value: unknown): void {
  writeUserItem(key, JSON.stringify(value))
}

/** Kullanıcı kapsamı olmayan `jumpdesk.<ad>` kayıtlarını kullanıcının `<ad>` kayıtlarına taşır (yalnız ilk kullanıcı). */
function adoptLegacy(next: string): void {
  try {
    if (localStorage.getItem(LEGACY_OWNER_KEY) !== null) return
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(LEGACY_PREFIX) && !key.startsWith(USER_PREFIX)) keys.push(key)
    }
    for (const key of keys) {
      const value = localStorage.getItem(key)
      const target = `${USER_PREFIX}${next}/${key.slice(LEGACY_PREFIX.length)}`
      if (value !== null && localStorage.getItem(target) === null)
        localStorage.setItem(target, value)
      localStorage.removeItem(key)
    }
    for (const [key, get] of legacyProviders) {
      const target = `${USER_PREFIX}${next}/${key}`
      const value = get()
      if (value !== null && localStorage.getItem(target) === null)
        localStorage.setItem(target, value)
    }
    localStorage.setItem(LEGACY_OWNER_KEY, next)
  } catch {
    /* eski kayıtlar taşınamazsa yerinde kalır */
  }
}

/** Giriş yapan kullanıcıyı belirler (çıkışta null); depolar eşzamanlı olarak yeniden yüklenir. */
export function setUserScope(next: string | null): void {
  if (next === scope) return
  if (next) adoptLegacy(next)
  scope = next
  for (const listener of listeners) listener()
}

/** Eski kayıtlar ilk kullanıcıya taşınırken `key` kaydına yazılacak değeri verir. */
export function provideLegacyValue(key: string, get: () => string | null): void {
  legacyProviders.set(key, get)
}

/** Kullanıcı değişince çağrılır (giriş, çıkış). */
export function onUserScope(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

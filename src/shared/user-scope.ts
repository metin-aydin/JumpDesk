/**
 * Kullanıcıya özel kayıtların (ayarlar, snippetler, kurallar, düzenler, sunucu bilgileri) anahtarı. Aynı kullanıcı
 * adı başka bir JumpServer'da ayrı kullanıcı sayılır.
 */
export function userScopeOf(server: string, username: string): string {
  let host = server
  try {
    host = new URL(server).host
  } catch {
    /* adres URL değilse olduğu gibi kullanılır */
  }
  return `${host.toLowerCase()}/${username}`
}

/**
 * Kullanıcının girdiği JumpServer adresini `https://host[:port]` biçimine getirir; şema yazılmadıysa https kabul
 * edilir, yol ve sorgu atılır. Geçersiz adreste null döner.
 */
export function normalizeServerUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (!/^[a-z0-9.-]+$/i.test(url.hostname) && !/^\[[0-9a-f:]+\]$/i.test(url.hostname)) return null
    return url.origin
  } catch {
    return null
  }
}

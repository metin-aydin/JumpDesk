import { session, type Certificate, type Session } from 'electron'
import { X509Certificate } from 'crypto'
import { readFileSync } from 'fs'
import { isIP } from 'net'
import { getCACertificates } from 'tls'

/** Chromium'un "sertifikayı veren yetkili tanınmıyor" hatası (net::ERR_CERT_AUTHORITY_INVALID). */
const AUTHORITY_INVALID = -202
/** `setCertificateVerifyProc` yanıtları: güven, Chromium'un kendi sonucunu kullan. */
const TRUST = 0
const USE_CHROMIUM = -3

let roots: X509Certificate[] | null = null

/** PEM metnindeki sertifikalar. */
export function splitPem(text: string): string[] {
  return text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []
}

/**
 * İşletim sisteminin güvendiği kök sertifikalar (Linux'ta /etc/ssl/certs, Windows ve macOS'ta sistem deposu; kurum
 * kökleri dahil). Testlerde `JUMPDESK_TEST_SYSTEM_CA` dosyası kullanılır.
 */
function systemRoots(): X509Certificate[] {
  if (roots) return roots
  const file = process.env['JUMPDESK_TEST_SYSTEM_CA']
  let pems: string[] = []
  try {
    pems = file ? splitPem(readFileSync(file, 'utf8')) : getCACertificates('system')
  } catch {
    pems = []
  }
  roots = pems.flatMap((pem) => {
    try {
      return [new X509Certificate(pem)]
    } catch {
      return []
    }
  })
  return roots
}

const validAt = (cert: X509Certificate, now: Date): boolean =>
  new Date(cert.validFrom) <= now && now <= new Date(cert.validTo)

/**
 * Sunucunun gönderdiği zincir (yapraktan yukarı) verilen köklerden birine bağlanıyor mu: yaprak adresle eşleşir, her
 * sertifika geçerlilik süresi içindedir, her halka bir üstündekince (CA) imzalanmıştır ve zincir bir köke ulaşır.
 */
export function chainTrusted(
  chainPems: string[],
  hostname: string,
  trusted: X509Certificate[],
  now = new Date()
): boolean {
  const chain = chainPems.map((pem) => new X509Certificate(pem))
  const leaf = chain[0]
  if (!leaf || !(isIP(hostname) ? leaf.checkIP(hostname) : leaf.checkHost(hostname))) return false
  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i]
    if (!validAt(cert, now)) return false
    if (trusted.some((root) => root.fingerprint256 === cert.fingerprint256)) return true
    const root = trusted.find((r) => r.ca && cert.checkIssued(r) && cert.verify(r.publicKey))
    if (root) return validAt(root, now)
    const next = chain[i + 1]
    if (!next || !next.ca || !cert.checkIssued(next) || !cert.verify(next.publicKey)) return false
  }
  return false
}

function chainOf(certificate: Certificate): string[] {
  const pems: string[] = []
  let current: Certificate | undefined = certificate
  while (current && pems.length < 10) {
    pems.push(current.data)
    if (!current.issuerCert || current.issuerCert.fingerprint === current.fingerprint) break
    current = current.issuerCert
  }
  return pems
}

function trustSystemRoots(ses: Session): void {
  ses.setCertificateVerifyProc((request, callback) => {
    if (request.errorCode !== AUTHORITY_INVALID) return callback(USE_CHROMIUM)
    try {
      callback(
        chainTrusted(chainOf(request.certificate), request.hostname, systemRoots())
          ? TRUST
          : USE_CHROMIUM
      )
    } catch {
      callback(USE_CHROMIUM)
    }
  })
}

/**
 * Chromium Linux'ta işletim sisteminin sertifika deposunu (ör. kurumun TLS denetimi için /etc/ssl/certs'e eklediği
 * kök) kullanmaz; bu ağlarda GitHub güncellemeleri, yapay zeka sağlayıcıları ve iç JumpServer adresleri
 * net::ERR_CERT_AUTHORITY_INVALID verir. Chromium yalnız bu hatayı verdiğinde zincir işletim sisteminin köklerine göre
 * doğrulanır; diğer bütün hatalarda Chromium'un sonucu geçerlidir.
 */
export function initSystemTrust(partitions: string[]): void {
  trustSystemRoots(session.defaultSession)
  // electron-updater kendi oturumunu bu adla ve önbelleksiz açar.
  trustSystemRoots(session.fromPartition('electron-updater', { cache: false }))
  for (const partition of partitions) trustSystemRoots(session.fromPartition(partition))
}

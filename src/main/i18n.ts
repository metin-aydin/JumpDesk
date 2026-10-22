import { store } from './store'

type Language = 'en' | 'tr'
type Params = Record<string, string | number>

/**
 * Ana sürecin kullanıcıya görünen iletileri (giriş hataları, dosya pencereleri). Kaynak metin Türkçedir ve anahtar
 * olarak kullanılır; dil, arayüzde son seçilen dildir (hiç seçilmediyse İngilizce).
 */
const EN: Record<string, string> = {
  '{url} bir JumpServer sunucusu gibi yanıt vermedi (HTTP {status}).':
    '{url} did not respond like a JumpServer server (HTTP {status}).',
  'zaman aşımı': 'timed out',
  bağlanılamadı: 'connection failed',
  '{url} adresine ulaşılamadı ({reason}).': 'Could not reach {url} ({reason}).',
  'Oturum süresi doldu, yeniden giriş yapın.': 'Your session has expired. Please sign in again.',
  'Geçerli bir sunucu adresi girin.': 'Enter a valid server address.',
  'Sunucu adresi girin.': 'Enter a server address.',
  'Giriş sayfası açılamadı ({description}): {url}':
    'Could not open the sign-in page ({description}): {url}',
  'Sunucu adresi girilmedi.': 'No server address has been entered.',
  'Sunucuya ulaşılamadı: {message}': 'Could not reach the server: {message}',
  'Oturum süresi doldu': 'Session expired',
  'İndirme bulunamadı': 'Download not found',
  'JumpDesk Dışa Aktarım Dosyası': 'JumpDesk Export File',
  'Dışa Aktar': 'Export',
  'İçe Aktar': 'Import',
  Pencere: 'Window',
  'Kurulum başlatılamadı: {message}': 'Could not start the installation: {message}',
  'Parola penceresi kapatıldı ya da yetki verilmedi; güncelleme kurulmadı.':
    'The password dialog was closed or authorization was denied; the update was not installed.',
  'Güncelleme kurulamadı (çıkış kodu {code}).':
    'The update could not be installed (exit code {code}).',
  'Yapay zeka yanıt vermedi (zaman aşımı).': 'The AI provider did not respond (timed out).',
  'Yapay zeka sağlayıcısına ulaşılamadı: {message}': 'Could not reach the AI provider: {message}',
  'API anahtarı geçersiz ya da bu işlem için yetkisi yok.':
    'The API key is invalid or not authorized for this request.',
  'Model ya da adres bulunamadı.': 'Model or address not found.',
  'Sağlayıcının istek sınırına ulaşıldı; biraz sonra yeniden deneyin.':
    'The provider rate limit was reached; try again shortly.',
  'Yapay zeka isteği başarısız oldu (HTTP {status}): {detail}':
    'The AI request failed (HTTP {status}): {detail}',
  'Yapay zeka yanıtı okunamadı.': 'Could not read the AI response.',
  'Adres http:// ya da https:// ile başlamalı.': 'The address must start with http:// or https://.',
  'Bu sistemde şifreleme kullanılamıyor; API anahtarı kaydedilmedi.':
    'Encryption is not available on this system; the API key was not saved.',
  'Kayıtlı API anahtarı çözülemedi; anahtarı yeniden girin.':
    'The saved API key could not be decrypted; enter it again.',
  'Bir soru yazın.': 'Type a question.',
  'Yapay zeka ile autocomplete kapalı.': 'AI autocomplete is turned off.',
  'Yapay zeka ayarları eksik. Ayarlar → Yapay Zeka bölümünü doldurun.':
    'AI settings are incomplete. Fill in Settings → AI.',
  'Yapay zeka isteği başarısız oldu.': 'The AI request failed.',
  'Bu kuruluş anahtarı bir çalışma alanına bağlı değil. "Çalışma Alanı Kimliği" alanına kullanılacak çalışma alanının kimliğini (wrkspc_…) girin ya da bir çalışma alanına ait anahtar kullanın.':
    'This organization key is not scoped to a workspace. Enter the ID of the workspace to use (wrkspc_…) in "Workspace ID", or use a key that belongs to a workspace.',
  '{field} geçerli değil.': '{field} is not valid.',
  'Model listesi alınamadı.': 'Could not get the model list.',
  'Çalışma Alanı Kimliği (İsteğe Bağlı)': 'Workspace ID (Optional)',
  Adres: 'Address',
  'Uç Nokta': 'Endpoint',
  Model: 'Model',
  'Dağıtım Adı': 'Deployment Name',
  'API Sürümü': 'API Version',
  'Kayıtlı Düzenler': 'Saved Layouts',
  'Kayıtlı düzen yok': 'No saved layouts',
  'Klasörde düzen yok': 'No layouts in this folder',
  "JumpDesk'i Göster": 'Show JumpDesk',
  Çıkış: 'Quit'
}

/** Ortam değişkeniyle sabitlenen dil (testler). */
function forcedLanguage(): Language | null {
  const value = process.env['JUMPDESK_LANGUAGE']
  return value === 'en' || value === 'tr' ? value : null
}

export function languageForced(): boolean {
  return forcedLanguage() !== null
}

export function currentLanguage(): Language {
  return forcedLanguage() ?? store.settings.language ?? 'en'
}

export function mt(source: string, params?: Params): string {
  const text = currentLanguage() === 'tr' ? source : (EN[source] ?? source)
  return params
    ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m))
    : text
}

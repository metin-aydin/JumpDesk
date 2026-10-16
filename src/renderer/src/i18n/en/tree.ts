import type { Dictionary } from '@/lib/i18n'

const servers = (n: string | number): string => `${n} ${Number(n) === 1 ? 'Server' : 'Servers'}`

export const tree: Dictionary = {
  // Sunucu sağ tık menüsü
  Bağlan: 'Connect',
  '{n} Sunucuya Bağlan': ({ n }) => `Connect to ${servers(n)}`,
  '{n} Sunucuya Farklı Bağlan…': ({ n }) => `Connect to ${servers(n)} With Layout…`,
  '{n} Sunucuda Dosyaları Aç': ({ n }) => `Open Files on ${servers(n)}`,
  'Dosya Yöneticisi': 'File Manager',
  '{n} Sunucuyu Etiketle': ({ n }) => `Tag ${servers(n)}`,
  'Etiketleri Düzenle': 'Edit Tags',
  'Adresi Kopyala': 'Copy Address',
  "Yerel IP'yi Kopyala": 'Copy Internal IP',
  'Adı Kopyala': 'Copy Name',

  // Hepsine bağlan alt menüsü
  'Tümünü Yan Yana Açarak Bağlan': 'Connect All Side by Side',
  'Tümünü Alt Alta Açarak Bağlan': 'Connect All Stacked',
  'Tümünü Izgara Şeklinde Açarak Bağlan': 'Connect All as Grid',
  'Sunucular okunuyor…': 'Loading servers…',

  // Klasör sağ tık menüsü
  'Klasörü Aç': 'Open Folder',
  'Sunucular Okunamadı': 'Could Not Load Servers',
  'Klasördeki Sunucular Okunuyor…': 'Loading Servers in Folder…',
  'Klasörde Doğrudan Sunucu Yok': 'No Servers Directly in Folder',
  'Klasördeki {n} Sunucuya Bağlan': ({ n }) => `Connect to ${servers(n)} in Folder`,
  'Klasördeki {n} Sunucuya Farklı Bağlan…': ({ n }) =>
    `Connect to ${servers(n)} in Folder With Layout…`,
  Yenile: 'Refresh',

  // Sunucu bilgi kartı
  Etiketler: 'Tags',
  'İç IP': 'Internal IP',
  Adres: 'Address',
  Protokoller: 'Protocols',
  Hesaplar: 'Accounts',
  'Son bağlantı': 'Last connected',
  Açıklama: 'Description',

  // Arama sonuçları
  'Aranıyor…': 'Searching…',
  '"{query}" için sunucu bulunamadı': 'No servers found for "{query}"',
  "{n} Sunucu Seçildi · {key}'yi Bırakınca Bağlanılır": ({ n, key }) =>
    `${servers(n)} Selected · Release ${key} to Connect`,
  '{key} + Tık İle Birden Çok Sunucu Seçin': '{key} + Click to Select Multiple Servers',

  // Sunucu ağacı
  Favoriler: 'Favorites',
  Gruplanmamış: 'Ungrouped',
  'Yükleniyor…': 'Loading…',
  Sunucular: 'Servers',
  'Sunucular yükleniyor…': 'Loading servers…',
  'Sunucu ağaçta bulunamadı': 'Server not found in the tree',
  'Bu sunucu bir klasöre bağlı değil ya da artık yetkiniz yok.':
    'This server is not in any folder, or you no longer have access to it.',

  // Kenar çubuğu ve profil menüsü
  'Sunucu Ağacı': 'Server Tree',
  'Sunucu, IP, etiket ara': 'Search servers, IPs, tags',
  'Aramayı temizle': 'Clear search',
  Ayarlar: 'Settings',
  'Ayarlar ({shortcut})': 'Settings ({shortcut})',
  'Dışa Aktar…': 'Export…',
  'İçe Aktar…': 'Import…',
  'Çıkış Yap': 'Sign Out',
  'Sürüm {version}': 'Version {version}',

  // Etiket penceresi
  '{n} Sunucunun Etiketleri': ({ n }) => `Tags of ${servers(n)}`,
  'Eklediğiniz etiketler seçili tüm sunuculara, kaldırdıklarınız hepsinden uygulanır.':
    'Tags you add are applied to all selected servers; tags you remove are removed from all of them.',
  'Etiket yazın (birden çoksa Enter ya da virgülle ayırın)':
    'Type a tag (separate multiple tags with Enter or a comma)',
  '{tag} etiketini kaldır': 'Remove tag {tag}',
  Vazgeç: 'Cancel',
  Kaydet: 'Save',

  // Giriş ekranı
  "JumpServer'a Bağlan": 'Connect to JumpServer',
  'Giriş yapacağınız JumpServer sunucusunun adresini girin.':
    'Enter the address of the JumpServer you want to sign in to.',
  'Sunucu Adresi': 'Server Address',
  'jump.ornek.com': 'jump.example.com',
  'Son kullanılanlar:': 'Recent:',
  'Bu Sunucuya Bağlan': 'Connect to This Server',
  Devam: 'Continue',
  Dil: 'Language',
  '{host} kontrol ediliyor…': 'Checking {host}…',
  'Sunucu Adresini Değiştir': 'Change Server Address',
  'Sunucuyu Değiştir': 'Change Server',
  '{host} hesabınızla giriş yapın': 'Sign in with your {host} account',

  // Uygulama çerçevesi
  'Sağ Panel': 'Right Panel',
  'Beklenmeyen bir hata oluştu': 'An unexpected error occurred',
  'Yeniden yükle': 'Reload'
}

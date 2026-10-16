import type { Dictionary } from '@/lib/i18n'

const plural = (n: string | number, one: string, many: string): string =>
  `${n} ${Number(n) === 1 ? one : many}`

export const terminal: Dictionary = {
  // Terminal
  'Öneri yok': 'No suggestions',
  'Tab / → kabul · ↑↓ seç · Esc kapat · Ctrl+Space aç':
    'Tab / → accept · ↑↓ select · Esc close · Ctrl+Space open',
  'Bağlantıyı Açmak İçin {key} + Tıklayın': '{key} + Click to Open Link',
  'Terminalde Ara': 'Search Terminal',
  'Terminalde ara': 'Search terminal',
  Geçersiz: 'Invalid',
  'Sonuç Yok': 'No Results',
  'Büyük/Küçük Harf Duyarlı': 'Match Case',
  'Düzenli İfade': 'Regular Expression',
  'Önceki Eşleşme': 'Previous Match',
  'Önceki Eşleşme (Shift+Enter)': 'Previous Match (Shift+Enter)',
  'Sonraki Eşleşme': 'Next Match',
  'Sonraki Eşleşme (Enter)': 'Next Match (Enter)',
  'Aramayı Kapat': 'Close Search',
  'Aramayı Kapat (Esc)': 'Close Search (Esc)',

  // Bağlantı durumları (terminal, dosya, uzak masaüstü)
  'Bağlantı hatası': 'Connection error',
  'Sunucuya bağlanılamadı (oturum geçersiz olabilir)':
    'Could not connect to the server (the session may be invalid)',
  'Bağlantı kapandı ({code})': 'Connection closed ({code})',
  'Bağlantı kapandı': 'Connection closed',
  'Bağlantı hatası ({code})': 'Connection error ({code})',
  'Uzak masaüstü sunucusuna ulaşılamadı': 'Could not reach the remote desktop server',
  'Oturum başka bir bağlantı tarafından kapatıldı': 'The session was closed by another connection',
  'Uzak masaüstü kimlik doğrulaması reddedildi': 'Remote desktop authentication was rejected',
  'Oturum zaman aşımına uğradı': 'The session timed out',
  'Uzak masaüstüne bağlanılamadı': 'Could not connect to the remote desktop',

  // Dosya oturumu
  'Dosya oturumu açılıyor…': 'Opening file session…',
  'Bu işlem için yetkiniz yok.': "You don't have permission for this operation.",
  'Dosya oturumu sona erdi.': 'The file session has expired.',
  'Dosya okunamadı': 'Could not read the file',
  'Dosya sunucusuna bağlanılamadı.': 'Could not connect to the file server.',
  'Dosya oturumu kapandı.': 'The file session was closed.',
  'Dosya sunucusu hata verdi.': 'The file server returned an error.',
  'Sunucu yanıt vermedi.': 'The server did not respond.',
  'Yükleme iptal edildi.': 'Upload canceled.',

  // Aktarımlar
  '{name} indirildi': '{name} downloaded',
  '{name} indirilemedi': 'Could not download {name}',
  '{name} yüklenemedi': 'Could not upload {name}',
  'Klasörde Göster': 'Show in Folder',
  Aktarımlar: 'Transfers',
  Temizle: 'Clear',
  '%{n}': '{n}%',
  Tamam: 'Done',
  İptal: ({ context }) => (context === 'status' ? 'Canceled' : 'Cancel'),
  Hata: 'Error',

  // Dosya yöneticisi
  'Bu sunucuda dosya indirme yetkiniz yok.':
    "You don't have permission to download files on this server.",
  'Bu sunucuda dosya yükleme yetkiniz yok.':
    "You don't have permission to upload files to this server.",
  'Bu sunucuda dosya yükleme yetkiniz yok':
    "You don't have permission to upload files to this server",
  '{name} silinemedi': 'Could not delete {name}',
  '{name} silindi': '{name} deleted',
  '{n} öğe silindi': ({ n }) => `${plural(n, 'item', 'items')} deleted`,
  'Ad "/" içeremez.': 'Name cannot contain "/".',
  'Yeniden adlandırılamadı': 'Could not rename',
  'Klasör oluşturulamadı': 'Could not create the folder',
  'Yol kopyalandı': 'Path copied',
  'Klasör yükleme desteklenmiyor': 'Folder upload is not supported',
  'Klasörün içindeki dosyaları seçerek yükleyin.':
    'Select the files inside the folder to upload them.',
  'Yeniden Bağlan': 'Reconnect',
  'Yolu Düzenlemek İçin Çift Tıklayın': 'Double-Click to Edit Path',
  'Bu klasörde süz': 'Filter this folder',
  'Yeni Klasör': 'New Folder',
  'Yeni klasör': 'New folder',
  'Dosya Yükle': 'Upload Files',
  'Dosya Yükleme Yetkiniz Yok': 'No Permission to Upload Files',
  'Üst Klasör': 'Parent Folder',
  Yenile: 'Refresh',
  Aç: 'Open',
  'Terminalde Bu Klasöre Geç': 'Go to This Folder in Terminal',
  '{n} Öğeyi İndir': ({ n }) => `Download ${plural(n, 'Item', 'Items')}`,
  'Zip Olarak İndir': 'Download as Zip',
  İndir: 'Download',
  'Yeniden Adlandır': 'Rename',
  'Yolu Kopyala': 'Copy Path',
  '{n} Öğeyi Sil': ({ n }) => `Delete ${plural(n, 'Item', 'Items')}`,
  Sil: 'Delete',
  Ad: 'Name',
  Boyut: 'Size',
  Değiştirilme: 'Modified',
  İzinler: 'Permissions',
  Dosyalar: 'Files',
  'Eşleşen dosya yok': 'No matching files',
  'Klasör boş': 'This folder is empty',
  'Bırakın: {path} klasörüne yüklenecek': 'Drop to upload to {path}',
  '{n} öğe': ({ n }) => plural(n, 'item', 'items'),
  '{n} seçili': '{n} selected',
  'Platformda Tanımlı SFTP Kök Dizini': 'SFTP Root Directory Defined on the Platform',
  'Kök: {root}': 'Root: {root}',
  '{n} öğe silinsin mi?': ({ n }) => `Delete ${plural(n, 'item', 'items')}?`,
  '{name} silinsin mi?': 'Delete {name}?',
  'Klasörler içindekilerle birlikte silinir.': 'Folders are deleted along with their contents.',
  'Bu işlem geri alınamaz.': 'This action cannot be undone.',
  Vazgeç: 'Cancel'
}

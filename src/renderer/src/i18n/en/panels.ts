import type { Dictionary } from '@/lib/i18n'

const plural = (n: string | number, one: string, many: string): string =>
  `${n} ${Number(n) === 1 ? one : many}`

export const panels: Dictionary = {
  // Sağ panel sekmeleri
  Snippetler: 'Snippets',
  Geçmiş: 'History',
  Dosyalar: 'Files',
  Alarmlar: 'Alarms',
  Vurgular: 'Highlights',
  'Sağ Panelin Genişliğini Ayarla': 'Resize Right Panel',

  // Dosyalar
  'Dosyaları görmek için bir SSH oturumu seçin.': 'Select an SSH session to see its files.',
  'Dosya yöneticisi yalnız SSH oturumlarında kullanılabilir.':
    'The file manager is only available in SSH sessions.',
  'Dosya oturumu açılıyor…': 'Opening file session…',
  'Yeniden Dene': 'Retry',
  'Ayrı Sekmede Aç': 'Open in Separate Tab',

  // Geçmiş
  'Geçmişi görmek için bir SSH oturumu seçin.': 'Select an SSH session to see its history.',
  '{title} geçmişinde ara': 'Search {title} history',
  'Geçmiş okunuyor…': 'Reading history…',
  'Geçmiş hazırlanıyor…': 'Preparing history…',
  'Bu sunucudan geçmiş okunamadı (bash ya da zsh gerekir).':
    'Could not read history from this server (bash or zsh is required).',
  'Eşleşen komut yok': 'No matching commands',
  'Geçmiş boş': 'History is empty',
  Çalıştır: 'Run',
  'Terminale Yaz (Çalıştırmadan)': 'Insert into Terminal (Without Running)',
  Kopyala: 'Copy',

  // Alarmlar
  '{pattern} Kuralını Aç/Kapat': 'Toggle {pattern} Rule',
  '{pattern} Kuralını Sil': 'Delete {pattern} Rule',
  'Büyük/Küçük Harf Duyarlı': 'Match Case',
  'Düzenli İfade': 'Regular Expression',
  'Kuralı Sil': 'Delete Rule',
  'Kelime ya da düzenli ifade': 'Word or regular expression',
  'Kural Ekle': 'Add Rule',
  'Oturuma Git Ve Satırı Bul': 'Go to Session and Find Line',
  'Oturum Kapandı': 'Session Closed',
  Okundu: 'Read',
  Okunmadı: 'Unread',
  'Satırı Kopyala': 'Copy Line',
  'Kuralları Düzenle': 'Edit Rules',
  'Henüz alarm yok. Açık terminallerde kurallardan biri geçince burada listelenir.':
    'No alarms yet. Lines in open terminals that match a rule are listed here.',
  Kurallar: 'Rules',
  '{n} Aktif': '{n} Active',
  'Tüm Alarmları Listeden Kaldır': 'Remove All Alarms from the List',
  'Alarmları Temizle': 'Clear Alarms',
  'Alarm Kuralları': 'Alarm Rules',
  'Açık terminallerde bu kelimelerden ya da düzenli ifadelerden biri geçen satırlar alarm olarak yakalanır.':
    'Lines in open terminals that contain one of these words or regular expressions are captured as alarms.',
  'İçe Aktar…': 'Import…',
  'Dışa Aktar…': 'Export…',
  Oturum: 'Session',

  // Vurgular
  'Vurgu Metnini Düzenle': 'Edit Highlight Text',
  '{pattern} Vurgusunu Aç/Kapat': 'Toggle {pattern} Highlight',
  '{pattern} Vurgusunu Sil': 'Delete {pattern} Highlight',
  'Düzenlemek İçin Çift Tıklayın': 'Double-Click to Edit',
  'Yazı Rengi': 'Text Color',
  'Arka Plan Rengi': 'Background Color',
  'Vurgulanacak Metin': 'Text to Highlight',
  Yazı: 'Text',
  'Arka Plan': 'Background',
  Örnek: 'Sample',
  'Vurgu Ekle': 'Add Highlight',
  'Yazı Ya Da Arka Plan Rengi Seçin': 'Choose a Text or Background Color',
  Ekle: 'Add',
  'Henüz vurgu yok. Bir kelime ya da düzenli ifade ekleyin; terminalde eşleşen metin seçtiğiniz renklerle gösterilir.':
    'No highlights yet. Add a word or regular expression; matching text in the terminal is shown in the colors you choose.',

  // Renk seçici
  Şeffaf: 'Transparent',
  'Şeffaf (Rengi Değiştirme)': 'Transparent (Keep Original Color)',
  'Özel Renk Seç': 'Choose Custom Color',
  'Renk Kodu': 'Color Code',

  // Snippetler
  'Önce bir SSH oturumu seçin': 'Select an SSH session first',
  'Snippet etkin terminal sekmesinde çalışır.': 'Snippets run in the active terminal tab.',
  '“{name}” Snippetini Düzenle': 'Edit Snippet “{name}”',
  'Snippetleri Düzenle': 'Edit Snippets',
  'Snippet ara': 'Search snippets',
  '{name} bağlanınca {n} snippet çalışır': ({ name, n }) =>
    `${plural(n, 'snippet runs', 'snippets run')} when connecting to ${name}`,
  '{name} için bağlanınca çalışacak snippet seçilmedi':
    'No snippets selected to run when connecting to {name}',
  'Bağlanınca Çalıştır': 'Run on Connect',
  'Otomatik Çalıştırmadan Çıkar': 'Remove from Run on Connect',
  '{name} Bağlanınca Çalıştır': 'Run When Connecting to {name}',
  'Henüz snippet yok. Aşağıdaki düğmeyle ekleyin ya da bir JumpDesk dosyasından içe aktarın (sağ tık → İçe Aktar).':
    'No snippets yet. Add one with the button below or import them from an JumpDesk file (right-click → Import).',
  'Eşleşen snippet yok': 'No matching snippets',
  '{n} Snippet': ({ n }) => plural(n, 'Snippet', 'Snippets'),
  Genel: 'General',

  // Snippet düzenleyici
  'Değişiklikler Kaydedilmedi': 'Unsaved Changes',
  'Bu snippetteki kaydedilmemiş değişiklikler silinsin mi?':
    'Discard the unsaved changes to this snippet?',
  'Değişiklikleri Sil': 'Discard Changes',
  'Düzenlemeye Dön': 'Keep Editing',
  'Snippet Silinsin Mi?': 'Delete Snippet?',
  '"{name}" kalıcı olarak silinir. Bağlanınca çalıştırma listelerinden de çıkar.':
    '"{name}" will be permanently deleted. It is also removed from run-on-connect lists.',
  Sil: 'Delete',
  'Snippetler sağ panelde gruplarına göre listelenir; tıklayınca etkin terminalde çalışır.':
    'Snippets are listed by group in the right panel; click one to run it in the active terminal.',
  'Snippet Ara': 'Search Snippets',
  'Yeni Snippet': 'New Snippet',
  'Henüz snippet yok': 'No snippets yet',
  Ad: 'Name',
  'Ör. App Server 1 Log': 'e.g. App Server 1 Log',
  Grup: 'Group',
  Komut: 'Command',
  'Birden çok satır yazılabilir; her satır ayrı komut olarak gönderilir. Kaydetmek için Ctrl+Enter.':
    'You can write multiple lines; each line is sent as a separate command. Press Ctrl+Enter to save.',
  Vazgeç: 'Cancel',
  Kaydet: 'Save',
  '{snippets} snippet · {groups} grup': ({ snippets, groups }) =>
    `${plural(snippets, 'snippet', 'snippets')} · ${plural(groups, 'group', 'groups')}`
}

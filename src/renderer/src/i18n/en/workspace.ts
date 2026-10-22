import type { Dictionary, Params } from '@/lib/i18n'

const plural = (n: Params[string], one: string, many: string): string =>
  Number(n) === 1 ? one : many

export const workspace: Dictionary = {
  // Sekme şeridi ve grup sekmesi
  'Yeni Bağlantı': 'New Connection',
  'Gruba Ekle': 'Add to Group',
  'Yan Yana Yerleştir': 'Arrange Side by Side',
  'Alt Alta Yerleştir': 'Arrange Stacked',
  'Izgara Olarak Yerleştir': 'Arrange as Grid',
  'Ana Pencereye Taşı': 'Move to Main Window',
  'Bölünmüş görünüm: {names}': 'Split view: {names}',
  Alarm: 'Alarm',
  'Yeni çıktı': 'New output',
  'Yayın açık': 'Broadcast on',
  '{n} Sunucu': ({ n }) => `${n} ${plural(n, 'Server', 'Servers')}`,
  'Kaydedilmemiş Düzen Değişikliği': 'Unsaved Layout Change',
  'Kaydedilmemiş Düzen Değişiklikleri': 'Unsaved Layout Changes',
  'Grubu kapat': 'Close group',
  'Grubu Kapat': 'Close Group',
  'Boyutları Eşitle': 'Equalize Sizes',
  'Yayını Kapat': 'Turn Off Broadcast',
  'Girdiyi Tüm Panellere Gönder (Yayın)': 'Send Input to All Panes (Broadcast)',
  'Grubu Ayır': 'Ungroup',
  'Grubu Yeni Pencerede Aç': 'Open Group in New Window',
  'Tüm Sekmeleri Kapat': 'Close All Tabs',
  '"{name}" düzeni güncellendi': 'Layout "{name}" updated',
  'Düzendeki Değişiklikleri Kaydet': 'Save Changes to Layout',
  'Düzeni Yeniden Adlandır…': 'Rename Layout…',
  'Düzeni Sil': 'Delete Layout',
  'Düzeni Kaydet…': 'Save Layout…',
  'Sekmeyi kapat': 'Close tab',
  'Klasörde Göster': 'Show in Folder',
  'Yeni Pencerede Aç': 'Open in New Window',
  Kapat: 'Close',
  'Diğerlerini Kapat': 'Close Others',

  // Başlık çubuğu
  Tema: 'Theme',
  Sistem: 'System',
  Açık: 'Light',
  Koyu: 'Dark',
  'Sunucu Ağacını Aç/Kapat': 'Toggle Server Tree',
  'Klavye Kısayolları': 'Keyboard Shortcuts',
  'Sağ paneli aç/kapat': 'Toggle right panel',
  'Okunmamış Alarm': 'Unread Alarm',
  'Sağ Paneli Aç/Kapat': 'Toggle Right Panel',
  'Simge durumuna küçült': 'Minimize',
  'Önceki boyut': 'Restore',
  'Ekranı kapla': 'Maximize',

  // Sekme arama ve sekme önizlemesi
  'Sekmelerde ara': 'Search tabs',
  'Açık Sekmeler': 'Open Tabs',
  'Açık sekmeler': 'Open tabs',
  'Eşleşen sekme yok': 'No matching tabs',
  'Bölünmüş Görünümde': 'In Split View',
  '{name} sekmesini kapat': 'Close {name} tab',
  'Sekmelerde Ara': 'Search Tabs',
  Bekliyor: 'Waiting',
  Bağlanıyor: 'Connecting',
  Bağlı: 'Connected',
  'Oturum kapandı': 'Session closed',

  // Yeni Bağlantı ekranı
  Tümü: 'All',
  'Klasör Yolu': 'Folder Path',
  'Gizli Klasörler': 'Hidden Folders',
  '{n} sunucu': ({ n }) => `${n} ${plural(n, 'server', 'servers')}`,
  Klasör: 'Folder',
  Klasörler: 'Folders',
  'Klasörler okunuyor…': 'Loading folders…',
  'Bu klasör boş': 'This folder is empty',
  'Son bağlantılar': 'Recent connections',
  Favoriler: 'Favorites',
  'Sunucu adı veya IP adresi yazın': 'Type a server name or IP address',

  // Oturum görünümü
  "{protocol} bağlantısı için JumpServer'da tanımlı bir uzak uygulama (applet) bulunamadı. Yöneticinizden bu varlık için applet yayınlamasını isteyin.":
    'No remote application (applet) is defined in JumpServer for {protocol} connections. Ask your administrator to publish an applet for this asset.',
  'Dosya yöneticisi için hesap seçin': 'Choose an account for the file manager',
  'Hesap seçin': 'Choose an account',
  'Bu sunucu için bağlanma yetkiniz olan hesap yok.':
    'You have no account with permission to connect to this server.',
  'Kimlik bilgileri': 'Credentials',
  'Kullanıcı adı': 'Username',
  Parola: 'Password',
  Geri: 'Back',
  Bağlan: 'Connect',
  '{name} bağlanıyor…': 'Connecting to {name}…',
  'Tekrar dene': 'Try again',
  'Yeniden bağlan': 'Reconnect',

  // Döşenmiş grup panelleri
  'Ana Pencereye Al': 'Move to Main Window',
  'Ayrı Sekmeye Al': 'Move to Separate Tab',
  'Alarm: Bu Panelde Kurala Takılan Bir Satır Var': 'Alarm: A Line in This Pane Matched a Rule',
  'Yayına Kat': 'Include in Broadcast',
  'Yayından Çıkar': 'Exclude from Broadcast',
  Yayın: 'Broadcast',
  Küçült: 'Restore',
  Büyüt: 'Maximize',
  'Oturumu Kapat': 'Close Session',
  'Sürükleyerek Boyutlandır, Çift Tıklayarak Eşitle': 'Drag to Resize, Double-Click to Equalize',

  // Ayrı pencereler
  'Yeni pencere açılamadı': 'Could not open a new window',
  'Ana Pencereye Geri Al': 'Move Back to Main Window',
  'Tüm Sekmeleri Ana Pencereye Geri Al': 'Move All Tabs Back to Main Window',

  // Çalışma düzenleri
  'Düzende yaptığınız değişiklikler kaybolacaktır. Devam etmek istiyor musunuz?':
    'The changes you made to the layout will be lost. Do you want to continue?',
  'Devam Et': 'Continue',
  '"{name}" düzeni kaydedildi': 'Layout "{name}" saved',
  'Yeni Bağlantı ekranından tek tıkla açabilirsiniz.':
    'You can open it with one click from the New Connection screen.',
  'Düzeni Kaydet': 'Save Layout',
  'Düzeni Yeniden Adlandır': 'Rename Layout',
  'Kaydedilecek açık oturum yok.': 'There are no open sessions to save.',
  'Bu gruptaki {n} sunucu ve yerleşimi kaydedilir; grup sekmesi düzenin adını alır.': ({ n }) =>
    `The ${n} ${plural(n, 'server', 'servers')} in this group and their arrangement will be saved; the group tab takes the layout’s name.`,
  'Açık {n} sunucu, sekme sırası ve bölünmüş görünümler kaydedilir.': ({ n }) =>
    `The ${n} open ${plural(n, 'server', 'servers')}, the tab order and split views will be saved.`,
  'Düzenin yeni adını yazın.': 'Enter a new name for the layout.',
  'Düzen adı (ör. App Sunucuları)': 'Layout name (e.g. App Servers)',
  Vazgeç: 'Cancel',
  Kaydet: 'Save',
  'Yeniden Adlandır': 'Rename',
  'Açmak İçin Çift Tıklayın': 'Double-Click to Open',
  'Düzeni Aç': 'Open Layout',
  'Kayıtlı Düzenler': 'Saved Layouts',
  'Klasör Yok': 'No Folder',
  'Kayıtlı düzen yok': 'No saved layouts',
  'Yeni Klasör…': 'New Folder…',
  'Klasör adı (ör. Üretim)': 'Folder name (e.g. Production)',
  'Yeni Klasörün Adı': 'New Folder Name',
  'Bu adda bir klasör var.': 'A folder with this name already exists.',
  'Yeni Klasör': 'New Folder',
  'Klasörü Yeniden Adlandır': 'Rename Folder',
  'Klasör oluşturulur ve "{name}" düzeni içine taşınır.':
    'The folder is created and the "{name}" layout is moved into it.',
  'Düzenleri klasörlere ayırarak gruplayın.': 'Group your layouts into folders.',
  'Klasörün yeni adını yazın.': 'Enter a new name for the folder.',
  Oluştur: 'Create',
  'Klasöre Taşı': 'Move to Folder',
  'Klasörden Çıkar': 'Remove from Folder',
  'Klasörü Sil': 'Delete Folder',
  '"{name}" klasörü silindi': '"{name}" folder deleted',
  'Klasör boş. Düzenleri buraya sürükleyin ya da düzene sağ tıklayıp “Klasöre Taşı” seçin.':
    'This folder is empty. Drag layouts here, or right-click a layout and choose “Move to Folder”.',
  'Düzenleri Gruplamak İçin Klasör Oluştur': 'Create a Folder to Group Layouts',
  'Klasörden çıkarmak için buraya bırakın.': 'Drop here to remove from its folder.',
  'İçindeki {n} düzen klasör dışına taşındı.': ({ n }) =>
    `${n} ${plural(n, 'layout was', 'layouts were')} moved out of the folder.`
}

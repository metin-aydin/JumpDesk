import type { Dictionary } from '@/lib/i18n'

const plural = (n: unknown, one: string, many: string): string =>
  `${n} ${Number(n) === 1 ? one : many}`

export const serverStatus: Dictionary = {
  // Şerit ve ayrıntı kartı
  CPU: 'CPU',
  RAM: 'RAM',
  Disk: 'Disk',
  Load: 'Load',
  '{n} gün': ({ n }) => plural(n, 'day', 'days'),
  '{n} sa': '{n} h',
  '{n} dk': '{n} min',
  '{n} çekirdek': ({ n }) => plural(n, 'core', 'cores'),
  Bellek: 'Memory',
  'Swap {used} / {total} GB': 'Swap {used} / {total} GB',
  Diskler: 'Disks',
  'Yük (1 / 5 / 15 dk)': 'Load (1 / 5 / 15 min)',
  'Açık Kalma Süresi': 'Uptime',
  'Son güncelleme: {n} sn önce': 'Updated {n} s ago',
  'Ayrıntıları Göster': 'Show Details',
  'Geçmiş birikiyor…': 'Collecting history…',
  'Ortalama {value}': 'Average {value}',
  'En yüksek {value}': 'Peak {value}',
  'CPU Geçmişi': 'CPU History',
  'Bellek Geçmişi': 'Memory History',
  Swap: 'Swap',
  Yük: 'Load',
  'Çekirdek başına kullanım': 'Usage per core',
  'cpu{n} Geçmişi': 'cpu{n} History',
  'En çok CPU kullananlar': 'Top CPU processes',
  'En çok bellek kullananlar': 'Top memory processes',
  'Durumu Göster': 'Show Status',
  'Sunucu durumu alınamadı: kabuk entegrasyonu kurulamadı (bash ya da zsh, base64 ve gzip gerekir).':
    'Server status unavailable: shell integration could not be set up (needs bash or zsh, base64 and gzip).',
  'Oturumu Yeniden Bağlayıp Sunucu Durumunu Başlat':
    'Reconnect the Session and Start Server Status',
  'Yeniden Bağlantı Gerekiyor': 'Reconnect Required',
  'Sunucu durumu yeni bağlantıyla başlar. Oturum yeniden bağlanınca terminaldeki çıktı silinir ve sunucuda çalışan komutlar sonlanır. Yeniden bağlanılsın mı?':
    'Server status starts with a new connection. Reconnecting clears the terminal output and ends commands running on the server. Reconnect now?',
  Evet: 'Yes',
  Hayır: 'No',

  // Ayarlar → Sunucu Durumu
  'Sunucu Durumu': 'Server Status',
  'Bağlı sunucuların CPU, bellek, disk ve yük bilgisi.':
    'CPU, memory, disk and load of connected servers.',
  'Sunucu Durum Şeridi': 'Server Status Strip',
  'Linux sunucularda CPU, bellek, disk ve yük bilgisi başlığın altındaki şeritte gösterilir; çipe tıklayınca ayrıntılar açılır.':
    'Shows CPU, memory, disk and load of Linux servers in a strip below the header; click a chip for details.',
  'Yenileme Aralığı': 'Refresh Interval',
  'Yeni bağlantılarda geçerlidir.': 'Applies to new connections.',
  '{n} sn': '{n} s',
  'Ölçümü, bağlanınca sunucuda arka planda çalışan küçük bir döngü yapar; sunucuya hiçbir şey kurulmaz ve bilgiler yalnız bu uygulamada gösterilir. Tam ekran programlar (vim, less, top) açıkken ölçüm durur. Ayarı açmadan önce bağlanılan oturumlarda şeritteki "Durumu Göster" oturumu yeniden bağlayarak başlatır; ayar kapatılınca açık oturumlardaki ölçüm oturum bitene kadar sürer.':
    'A small loop started in the background when you connect does the measuring; nothing is installed on the server and the data is only shown in this app. Measuring pauses while full-screen programs (vim, less, top) are open. In sessions opened before turning this on, "Show Status" in the strip reconnects the session to start it; after turning it off, measuring in open sessions continues until they end.'
}

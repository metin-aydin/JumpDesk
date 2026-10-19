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
  '{d} gün {h} sa': ({ d, h }) => `${plural(d, 'day', 'days')} ${h} h`,
  '{h} sa {m} dk': '{h} h {m} min',
  '{n} çekirdek': ({ n }) => plural(n, 'core', 'cores'),
  Bellek: 'Memory',
  'Swap {used} / {total} GB': 'Swap {used} / {total} GB',
  Diskler: 'Disks',
  'Yük (1 / 5 / 15 dk)': 'Load (1 / 5 / 15 min)',
  'Açık kalma süresi': 'Uptime',
  'Açık Kalma Süresi': 'Uptime',
  'Son güncelleme: {n} sn önce': 'Updated {n} s ago',
  'Ayrıntıları Göster': 'Show Details',
  'Durumu Göster': 'Show Status',
  'Bu Oturumda Sunucu Durumunu Başlat': 'Start Server Status in This Session',
  'Komut satırı boşken başlatılabilir': 'Start it when the command line is free',

  // Ayarlar → Sunucu Durumu
  'Sunucu Durumu': 'Server Status',
  'Bağlı sunucuların CPU, bellek, disk ve yük bilgisi.':
    'CPU, memory, disk and load of connected servers.',
  'Sunucu Durum Şeridi': 'Server Status Strip',
  'Linux sunucularda CPU, bellek, disk ve yük bilgisi başlığın altındaki şeritte gösterilir; çipe tıklayınca ayrıntılar açılır.':
    'Shows CPU, memory, disk and load of Linux servers in a strip below the header; click a chip for details.',
  'Yenileme Aralığı': 'Refresh Interval',
  'Yeni bağlantılarda ve şeritten başlatılan ölçümlerde geçerlidir.':
    'Applies to new connections and to measurements started from the strip.',
  '{n} sn': '{n} s',
  'Ölçümü, bağlanınca sunucuda arka planda çalışan küçük bir döngü yapar; sunucuya hiçbir şey kurulmaz ve bilgiler yalnız bu uygulamada gösterilir. Tam ekran programlar (vim, less, top) açıkken ölçüm durur. Ayarı açmadan önce bağlanılan oturumlarda şeritteki "Durumu Göster" ile başlatılır; ayar kapatılınca açık oturumlardaki ölçüm oturum bitene kadar sürer.':
    'A small loop started in the background when you connect does the measuring; nothing is installed on the server and the data is only shown in this app. Measuring pauses while full-screen programs (vim, less, top) are open. In sessions opened before turning this on, start it with "Show Status" in the strip; after turning it off, measuring in open sessions continues until they end.'
}

import { t } from '@/lib/i18n'
import { SETTINGS_SHORTCUT, isMac, shortcutLabel } from './shortcuts'

export interface ShortcutInfo {
  keys: string
  label: string
}

export interface ShortcutGroup {
  title: string
  items: ShortcutInfo[]
}

const ctrl = isMac ? '⌘' : 'Ctrl'

/**
 * Uygulamadaki klavye kısayolları, geçerli dilde; kısayollar penceresi ve komut paleti buradan beslenir. Metinler
 * çağrı anında çevrildiğinden liste çizim sırasında üretilir.
 */
export function shortcutGroups(): ShortcutGroup[] {
  return [
    {
      title: t('Genel'),
      items: [
        { keys: shortcutLabel('P'), label: t('Komut Paleti') },
        { keys: shortcutLabel('K'), label: t('Klavye Kısayolları') },
        { keys: SETTINGS_SHORTCUT, label: t('Ayarlar') },
        { keys: shortcutLabel('F'), label: t('Sunucu Ara') },
        { keys: shortcutLabel('T'), label: t('Yeni Bağlantı') }
      ]
    },
    {
      title: t('Sekmeler'),
      items: [
        { keys: shortcutLabel('W'), label: t('Sekmeyi Kapat') },
        { keys: isMac ? '⌘⇧A' : 'Ctrl+Shift+A', label: t('Sekmelerde Ara') },
        { keys: 'Ctrl+Tab', label: t('Sonraki Sekme') },
        { keys: 'Ctrl+Shift+Tab', label: t('Önceki Sekme') },
        { keys: `${ctrl}+1…8`, label: t('Sekmeye Git') },
        { keys: `${ctrl}+9`, label: t('Son Sekmeye Git') },
        { keys: t('Orta Tık'), label: t('Sekmeyi Kapat') }
      ]
    },
    {
      title: t('Görünüm'),
      items: [
        { keys: shortcutLabel('E'), label: t('Sunucu Ağacını Aç/Kapat') },
        { keys: shortcutLabel('B'), label: t('Sağ Paneli Aç/Kapat') },
        { keys: shortcutLabel('Enter'), label: t('Paneli Büyüt/Küçült') }
      ]
    },
    {
      title: t('Terminal'),
      items: [
        { keys: isMac ? '⌘F' : 'Ctrl+F', label: t('Terminalde Ara (less/vim Dışında)') },
        { keys: shortcutLabel('S'), label: t('Terminalde Ara (Her Yerde)') },
        { keys: 'Enter / Shift+Enter', label: t('Sonraki / Önceki Eşleşme') },
        { keys: isMac ? '⌘C' : 'Ctrl+Shift+C', label: t('Kopyala') },
        { keys: isMac ? '⌘V' : 'Ctrl+Shift+V', label: t('Yapıştır') },
        { keys: 'Ctrl+Space', label: t('Öneri Listesini Aç') },
        { keys: 'Ctrl+Space Ctrl+Space', label: t('Yapay Zekaya Sor') },
        { keys: 'Tab / →', label: t('Öneriyi Kabul Et') }
      ]
    },
    {
      title: t('Sunucu Ağacı Ve Klasörler'),
      items: [
        { keys: t('Enter / Çift Tık'), label: t('Bağlan') },
        { keys: t('{ctrl}+Tık / Shift+Tık', { ctrl }), label: t('Çoklu Seçim') }
      ]
    },
    {
      title: t('Dosya Yöneticisi'),
      items: [
        { keys: t('Enter / Çift Tık'), label: t('Aç / İndir') },
        { keys: 'Backspace', label: t('Üst Klasör') },
        { keys: 'F2', label: t('Yeniden Adlandır') },
        { keys: 'Delete', label: t('Sil') },
        { keys: 'F5', label: t('Yenile') },
        { keys: `${ctrl}+A`, label: t('Tümünü Seç') }
      ]
    }
  ]
}

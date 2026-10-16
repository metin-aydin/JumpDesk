import { Bell, Highlighter, LayoutDashboard, Rocket, SlidersHorizontal } from 'lucide-react'
import type { SectionId } from './bundle'

/**
 * Dışa/içe aktarım ekranlarındaki bölüm kartlarının adı, açıklaması, simgesi ve simge rengi. Ad ve açıklama Türkçe
 * kaynak metindir; ekranda `t()` ile çevrilir.
 */
export const SECTION_META: Record<
  SectionId,
  { label: string; description: string; Icon: typeof Bell; tone: string }
> = {
  snippets: {
    label: 'Snippetler',
    description: 'Ad, grup ve komutlarıyla tüm snippetler',
    Icon: Rocket,
    tone: 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
  },
  alarms: {
    label: 'Alarm Kuralları',
    description: 'Terminalde yakalanan kelime ve düzenli ifadeler',
    Icon: Bell,
    tone: 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
  },
  highlights: {
    label: 'Vurgular',
    description: 'Terminalde renklendirilen metinler ve renkleri',
    Icon: Highlighter,
    tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  },
  layouts: {
    label: 'Düzen Kayıtları',
    description: 'Kayıtlı çalışma düzenleri ve sunucuları',
    Icon: LayoutDashboard,
    tone: 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
  },
  settings: {
    label: 'Uygulama Ayarları',
    description: 'Dil, yazı boyutları, tema, terminal ve bildirim ayarları',
    Icon: SlidersHorizontal,
    tone: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
  }
}

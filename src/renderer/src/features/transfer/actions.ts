import { toast } from 'sonner'
import type { TransferError } from '@shared/api'
import { t } from '@/lib/i18n'
import { jumpdesk } from '@/lib/jumpdesk'
import { useAuth } from '@/stores/auth'
import { useTransfer } from '@/stores/transfer'
import { buildBundle, parseBundle, SECTION_IDS, type SectionId } from './bundle'

/** Dosya hatalarının Türkçe kaynak metinleri; gösterilirken çevrilir. */
const ERRORS: Record<TransferError | 'empty', string> = {
  'not-jumpdesk': 'Bu dosya bir JumpDesk dışa aktarım dosyası değil.',
  'unsupported-version': "Dosya JumpDesk'ın daha yeni bir sürümüyle oluşturulmuş.",
  corrupt: 'Dosya bozuk ya da değiştirilmiş; içeriği doğrulanamadı.',
  'wrong-format': 'Dosyanın içeriği tanınmadı.',
  'too-large': 'Dosya çok büyük (en fazla 20 MB).',
  'read-failed': 'Dosya okunamadı.',
  empty: 'Dosyada içe aktarılacak kayıt yok.'
}

function currentUser(): { username: string; server: string } {
  const state = useAuth.getState().state
  if (state?.status !== 'logged-in') return { username: 'jumpdesk', server: '' }
  return { username: state.user.username, server: new URL(state.server).host }
}

/** Dışa aktarım ekranını açar; verilen bölümler (yoksa tümü) seçili gelir. */
export function openExport(only?: SectionId[]): void {
  useTransfer.getState().openExport(only ?? SECTION_IDS)
}

/** Seçilen bölümleri kayıt penceresinde seçilen yere şifreli dosya olarak yazar. */
export async function exportSections(sections: SectionId[]): Promise<boolean> {
  const user = currentUser()
  const saved = await jumpdesk.transfer.save(buildBundle(sections, user), user.username)
  if (!saved) return false
  const name = saved.path.split(/[\\/]/).pop()
  toast.success(t('Dışa aktarıldı'), {
    description: name,
    action: {
      label: t('Klasörde Göster'),
      onClick: () => jumpdesk.downloads.showInFolder(saved.path)
    }
  })
  return true
}

/**
 * Dosya seçtirir ve doğrular; geçerliyse içe aktarım ekranını açar. Verilen bölümler (dosyada varsa) seçili gelir,
 * verilmezse dosyadaki tüm bölümler.
 */
export async function openImport(only?: SectionId[]): Promise<void> {
  const result = await jumpdesk.transfer.open()
  if (result.status === 'canceled') return
  if (result.status === 'error') {
    toast.error(t('İçe aktarılamadı'), {
      description: `${result.name}: ${t(ERRORS[result.error])}`
    })
    return
  }
  const bundle = parseBundle(result.payload)
  if (!bundle) {
    toast.error(t('İçe aktarılamadı'), { description: `${result.name}: ${t(ERRORS.empty)}` })
    return
  }
  const present = SECTION_IDS.filter((id) => bundle.sections[id] !== undefined)
  const wanted = only ? present.filter((id) => only.includes(id)) : present
  useTransfer.getState().showImport(bundle, result.name, wanted.length ? wanted : present)
}

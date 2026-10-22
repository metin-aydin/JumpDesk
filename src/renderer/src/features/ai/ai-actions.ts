import type { AiRisk } from '@shared/ai'
import { terminalRegistry } from '@/features/terminal/registry'
import { focusDetached } from '@/features/windows/detached-windows'
import { t } from '@/lib/i18n'
import { useConfirm } from '@/stores/confirm'
import { findTab, useWorkspace } from '@/stores/workspace'

/** Yapay zekaya giden tek sunucu bilgisi: türü (ör. linux). */
export function platformOf(tabId: string | undefined): string {
  if (!tabId) return 'linux'
  return findTab(useWorkspace.getState(), tabId)?.asset?.platformType?.toLowerCase() || 'linux'
}

/** Riskli komut için onay; komut yalnız komut satırına yazılacağı için Enter ayrıca gerekir. */
export async function confirmRisk(command: string, risk: AiRisk): Promise<boolean> {
  if (risk !== 'dangerous') return true
  return useConfirm.getState().ask({
    title: t('Riskli Komut'),
    description: t(
      'Bu komut sunucuda geri alınamaz değişiklikler yapabilir ya da güvenliği etkileyebilir: {command}. Komut yalnız komut satırına yazılır; çalıştırmak için ayrıca Enter gerekir.',
      { command }
    ),
    confirmLabel: t('Yine de Yaz')
  })
}

/**
 * Önerilen komutu oturumun komut satırına yazar (satırdaki metnin yerine; Ctrl+E, Ctrl+U satırı temizler); komut
 * çalışmaz, Enter kullanıcıdadır. Oturuma geçilir ve terminal odak alır.
 */
export async function writeCommand(tabId: string, command: string, risk: AiRisk): Promise<boolean> {
  const handle = terminalRegistry.get(tabId)
  if (!handle || !(await confirmRisk(command, risk))) return false
  const ws = useWorkspace.getState()
  if (ws.tabs.some((tab) => tab.id === tabId)) ws.activate(tabId)
  else focusDetached(tabId)
  handle.send(`\x05\x15${command}`)
  requestAnimationFrame(() => handle.focus())
  return true
}

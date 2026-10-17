import type { Terminal } from '@xterm/xterm'
import { WebglAddon } from '@xterm/addon-webgl'
import { jumpdesk } from '@/lib/jumpdesk'

/**
 * Chromium bir renderer'da en çok 16 etkin WebGL bağlamına izin verir ve aşınca en eskisini sessizce düşürür.
 * Terminal gizlense de bağlamını korur (DOM çiziciye geçiş gizli terminalde pahalıdır); üst sınır aşılırsa en uzun
 * süredir görünmeyen terminalinki bırakılır, o terminal yeniden görününce bağlam yeniden alınır.
 */
const MAX_CONTEXTS = 12
const MAX_RETRIES = 3

interface Entry {
  addon: WebglAddon
  lastUsed: number
}

const active = new Map<Terminal, Entry>()
const failures = new Map<Terminal, number>()

function disposeAddon(term: Terminal, addon: WebglAddon): void {
  try {
    const renderer = (
      addon as unknown as { _renderer?: { _cursorBlinkStateManager?: { dispose?: () => void } } }
    )._renderer
    renderer?._cursorBlinkStateManager?.dispose?.()
    addon.dispose()
  } catch {
    /* bağlam zaten kaybolmuş olabilir */
  }
  active.delete(term)
}

export function acquireWebgl(term: Terminal): void {
  if (!jumpdesk.terminalWebgl) return
  const existing = active.get(term)
  if (existing) {
    existing.lastUsed = Date.now()
    return
  }
  if ((failures.get(term) ?? 0) >= MAX_RETRIES) return

  if (active.size >= MAX_CONTEXTS) {
    let oldest: [Terminal, Entry] | null = null
    for (const e of active) if (!oldest || e[1].lastUsed < oldest[1].lastUsed) oldest = e
    if (oldest) disposeAddon(oldest[0], oldest[1].addon)
  }

  try {
    const addon = new WebglAddon()
    addon.onContextLoss(() => {
      failures.set(term, (failures.get(term) ?? 0) + 1)
      disposeAddon(term, addon)
    })
    term.loadAddon(addon)
    active.set(term, { addon, lastUsed: Date.now() })
  } catch {
    failures.set(term, MAX_RETRIES)
  }
}

export function releaseWebgl(term: Terminal): void {
  const entry = active.get(term)
  if (entry) disposeAddon(term, entry.addon)
}

export function forgetTerminal(term: Terminal): void {
  releaseWebgl(term)
  failures.delete(term)
}

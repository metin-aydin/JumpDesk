import { create } from 'zustand'
import { onUserScope, readUserJson, writeUserJson } from '@/lib/user-storage'

export interface TerminalPreferences {
  autocomplete: boolean
  commandHighlight: boolean
  outputHighlight: boolean
  /** Bölünmüş görünümde odakta olmayan panelleri soluklaştır. */
  dimInactivePanes: boolean
}

const KEY = 'terminalPreferences'
export const TERMINAL_PREFERENCE_DEFAULTS: TerminalPreferences = {
  autocomplete: true,
  commandHighlight: true,
  outputHighlight: true,
  dimInactivePanes: true
}

/** Kayıttan ya da içe aktarılan dosyadan gelen tercihleri doğrular; eksik ya da bozuk alanlar varsayılan olur. */
export function sanitizePreferences(raw: unknown): TerminalPreferences {
  const out = { ...TERMINAL_PREFERENCE_DEFAULTS }
  if (!raw || typeof raw !== 'object') return out
  for (const key of Object.keys(out) as (keyof TerminalPreferences)[]) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === 'boolean') out[key] = value
  }
  return out
}

function read(): TerminalPreferences {
  return sanitizePreferences(readUserJson(KEY))
}

interface PreferencesStore extends TerminalPreferences {
  set: (patch: Partial<TerminalPreferences>) => void
}

export const usePreferences = create<PreferencesStore>((set) => ({
  ...read(),
  set: (patch) => {
    set(patch)
    writeUserJson(KEY, currentPreferences())
  }
}))

/** Depodaki tercihlerin düz kopyası (dışa aktarma ve kayıt için). */
export function currentPreferences(): TerminalPreferences {
  const { autocomplete, commandHighlight, outputHighlight, dimInactivePanes } =
    usePreferences.getState()
  return { autocomplete, commandHighlight, outputHighlight, dimInactivePanes }
}

onUserScope(() => usePreferences.setState(read()))

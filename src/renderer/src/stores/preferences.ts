import { create } from 'zustand'
import { onUserScope, readUserJson, writeUserJson } from '@/lib/user-storage'

export interface TerminalPreferences {
  autocomplete: boolean
  commandHighlight: boolean
  outputHighlight: boolean
  /** Bölünmüş görünümde odakta olmayan panelleri soluklaştır. */
  dimInactivePanes: boolean
  /** Linux sunucularda CPU, bellek ve disk bilgisini başlığın altındaki şeritte göster. */
  serverStatus: boolean
  /** Sunucu durumunun yenilenme aralığı (saniye). */
  serverStatusInterval: number
}

export const SERVER_STATUS_INTERVALS = [5, 10, 30] as const

const KEY = 'terminalPreferences'
export const TERMINAL_PREFERENCE_DEFAULTS: TerminalPreferences = {
  autocomplete: true,
  commandHighlight: true,
  outputHighlight: true,
  dimInactivePanes: true,
  serverStatus: false,
  serverStatusInterval: 5
}

/** Kayıttan ya da içe aktarılan dosyadan gelen tercihleri doğrular; eksik ya da bozuk alanlar varsayılan olur. */
export function sanitizePreferences(raw: unknown): TerminalPreferences {
  const out = { ...TERMINAL_PREFERENCE_DEFAULTS }
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>
  for (const key of [
    'autocomplete',
    'commandHighlight',
    'outputHighlight',
    'dimInactivePanes',
    'serverStatus'
  ] as const) {
    if (typeof r[key] === 'boolean') out[key] = r[key]
  }
  const interval = r['serverStatusInterval']
  if ((SERVER_STATUS_INTERVALS as readonly unknown[]).includes(interval))
    out.serverStatusInterval = interval as number
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
  const {
    autocomplete,
    commandHighlight,
    outputHighlight,
    dimInactivePanes,
    serverStatus,
    serverStatusInterval
  } = usePreferences.getState()
  return {
    autocomplete,
    commandHighlight,
    outputHighlight,
    dimInactivePanes,
    serverStatus,
    serverStatusInterval
  }
}

onUserScope(() => usePreferences.setState(read()))

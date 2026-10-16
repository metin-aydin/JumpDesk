import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { AiFeatures, AiProvider } from '@shared/ai'
import type { AppSettings, ServerMeta } from '@shared/types'

/** Kullanıcının yapay zeka ayarları; gizli alanlar `safeStorage` ile şifrelenmiş (base64) tutulur. */
export interface StoredAi {
  provider: AiProvider | null
  fields: Partial<Record<AiProvider, Record<string, string>>>
  secrets: Partial<Record<AiProvider, Record<string, string>>>
  features: AiFeatures
}

interface UserData {
  servers: Record<string, ServerMeta>
  ai?: StoredAi
}

interface StoreData {
  settings: AppSettings
  /** Kullanıcı kapsamına (`userScopeOf`) göre kayıtlar; bir kullanıcı diğerininkini görmez. */
  users: Record<string, UserData>
  /** Kullanıcıya bağlı olmayan eski sunucu bilgileri; giriş yapan ilk kullanıcıya taşınır. */
  servers?: Record<string, ServerMeta>
  windowBounds?: { x?: number; y?: number; width: number; height: number; maximized: boolean }
}

const defaults: StoreData = {
  settings: { theme: 'system', server: '' },
  users: {}
}

let data: StoreData | null = null
let writeTimer: NodeJS.Timeout | null = null
/** Giriş yapmış kullanıcının kapsamı; giriş yokken kullanıcı kayıtları okunmaz ve yazılmaz. */
let scope: string | null = null

function filePath(): string {
  return join(app.getPath('userData'), 'jumpdesk.json')
}

function load(): StoreData {
  if (data) return data
  try {
    const raw = JSON.parse(readFileSync(filePath(), 'utf8')) as Partial<StoreData>
    data = {
      ...defaults,
      ...raw,
      settings: { ...defaults.settings, ...raw.settings },
      users: raw.users ?? {}
    }
  } catch {
    data = structuredClone(defaults)
  }
  return data
}

function flush(): void {
  if (!data) return
  const target = filePath()
  if (!existsSync(dirname(target))) mkdirSync(dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, target)
}

function scheduleWrite(): void {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    flush()
  }, 300)
}

export const store = {
  get settings(): AppSettings {
    return load().settings
  },
  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const d = load()
    d.settings = { ...d.settings, ...patch }
    scheduleWrite()
    return d.settings
  },
  /** Giriş yapan kullanıcıyı belirler; eski (kullanıcısız) sunucu bilgileri bir kez bu kullanıcıya taşınır. */
  setUserScope(next: string | null): void {
    scope = next
    const d = load()
    if (!next || !d.servers) return
    const user = (d.users[next] ??= { servers: {} })
    user.servers = { ...d.servers, ...user.servers }
    delete d.servers
    scheduleWrite()
  },
  get servers(): Record<string, ServerMeta> {
    return scope ? (load().users[scope]?.servers ?? {}) : {}
  },
  updateServer(assetId: string, patch: Partial<ServerMeta>): ServerMeta {
    if (!scope) return { ...patch }
    const user = (load().users[scope] ??= { servers: {} })
    user.servers[assetId] = { ...user.servers[assetId], ...patch }
    scheduleWrite()
    return user.servers[assetId]
  },
  get userAi(): StoredAi | undefined {
    return scope ? load().users[scope]?.ai : undefined
  },
  setUserAi(ai: StoredAi): void {
    if (!scope) return
    const user = (load().users[scope] ??= { servers: {} })
    user.ai = ai
    scheduleWrite()
  },
  get windowBounds(): StoreData['windowBounds'] {
    return load().windowBounds
  },
  setWindowBounds(bounds: NonNullable<StoreData['windowBounds']>): void {
    load().windowBounds = bounds
    scheduleWrite()
  },
  flushNow(): void {
    if (writeTimer) {
      clearTimeout(writeTimer)
      writeTimer = null
    }
    flush()
  }
}

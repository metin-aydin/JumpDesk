import type { ThemePreference } from '@shared/types'
import { isLanguage, LANGUAGES, setLanguage, t, useLanguage, type Language } from '@/lib/i18n'
import { useAlarms, type AlarmRule } from '@/stores/alarms'
import {
  currentFontSizes,
  sanitizeFontSizes,
  useFontSizes,
  type FontSizes
} from '@/stores/font-sizes'
import { sanitizeHighlights, useHighlights, type HighlightRule } from '@/stores/highlights'
import {
  countServers,
  sanitizeFolders,
  sanitizeLayouts,
  useLayouts,
  type SavedLayout
} from '@/stores/layouts'
import {
  currentNotificationSettings,
  sanitizeNotificationSettings,
  useNotificationSettings,
  type NotificationSettings
} from '@/stores/notification-settings'
import {
  currentPreferences,
  sanitizePreferences,
  usePreferences,
  type TerminalPreferences
} from '@/stores/preferences'
import { sanitizeSnippets, useSnippets, type Snippet } from '@/stores/snippets'
import { isThemePreference, useTheme } from '@/stores/theme'

export const EXPORT_FORMAT = 'jumpdesk-export'
export const EXPORT_VERSION = 1

export type SectionId = 'snippets' | 'alarms' | 'highlights' | 'layouts' | 'settings'

/** Ekranlardaki sıra. */
export const SECTION_IDS: SectionId[] = ['snippets', 'alarms', 'highlights', 'layouts', 'settings']

export interface SettingsSection {
  language: Language
  fontSizes: FontSizes
  terminal: TerminalPreferences
  notifications: NotificationSettings
  theme: ThemePreference
}

export interface BundleSections {
  snippets?: Snippet[]
  alarms?: AlarmRule[]
  highlights?: HighlightRule[]
  layouts?: SavedLayout[]
  /** Düzen klasörleri (gösterim sırası); düzenler bölümüyle birlikte aktarılır. */
  layoutFolders?: string[]
  settings?: SettingsSection
}

export interface ExportBundle {
  format: typeof EXPORT_FORMAT
  version: number
  /** Dosyayı oluşturan JumpDesk sürümü. */
  app: string
  exportedAt: string
  user: { username: string; server: string }
  sections: BundleSections
}

function collect(id: SectionId): BundleSections[SectionId] {
  switch (id) {
    case 'snippets':
      return useSnippets.getState().snippets
    case 'alarms':
      return useAlarms.getState().rules
    case 'highlights':
      return useHighlights.getState().rules
    case 'layouts':
      return useLayouts.getState().layouts
    case 'settings':
      return {
        language: useLanguage.getState().language,
        fontSizes: currentFontSizes(),
        terminal: currentPreferences(),
        notifications: currentNotificationSettings(),
        theme: useTheme.getState().info.preference
      }
  }
}

/** Seçilen bölümlerin şu anki kayıtlarından dışa aktarım içeriği. */
export function buildBundle(
  sections: SectionId[],
  user: { username: string; server: string }
): ExportBundle {
  const out: BundleSections = {}
  for (const id of sections) Object.assign(out, { [id]: collect(id) })
  if (sections.includes('layouts')) out.layoutFolders = useLayouts.getState().folders
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    app: __APP_VERSION__,
    exportedAt: new Date().toISOString(),
    user,
    sections: out
  }
}

function sanitizeAlarms(raw: unknown): AlarmRule[] {
  if (!Array.isArray(raw)) return []
  return (raw as Partial<AlarmRule>[])
    .filter(
      (r): r is AlarmRule =>
        Boolean(r) && typeof r.id === 'string' && typeof r.pattern === 'string' && r.pattern !== ''
    )
    .map((r) => ({
      id: r.id,
      pattern: r.pattern,
      regex: r.regex === true,
      caseSensitive: r.caseSensitive === true,
      enabled: r.enabled !== false
    }))
}

function sanitizeSettings(raw: unknown): SettingsSection | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  return {
    language: isLanguage(r['language']) ? r['language'] : useLanguage.getState().language,
    fontSizes: sanitizeFontSizes(r['fontSizes']),
    terminal: sanitizePreferences(r['terminal']),
    notifications: sanitizeNotificationSettings(r['notifications']),
    theme: isThemePreference(r['theme']) ? r['theme'] : 'system'
  }
}

/**
 * Çözülmüş dosya içeriğini doğrular. Biçim ya da sürüm uymuyorsa null; bölümlerdeki bozuk kayıtlar atlanır, dosyada
 * olmayan bölüm `undefined` kalır.
 */
export function parseBundle(payload: Record<string, unknown>): ExportBundle | null {
  if (payload['format'] !== EXPORT_FORMAT) return null
  if (typeof payload['version'] !== 'number' || payload['version'] > EXPORT_VERSION) return null
  const raw = payload['sections']
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const user = (payload['user'] ?? {}) as Record<string, unknown>
  const sections: BundleSections = {}
  if ('snippets' in s) sections.snippets = sanitizeSnippets(s['snippets'])
  if ('alarms' in s) sections.alarms = sanitizeAlarms(s['alarms'])
  if ('highlights' in s) sections.highlights = sanitizeHighlights(s['highlights'])
  if ('layouts' in s) {
    sections.layouts = sanitizeLayouts(s['layouts'])
    sections.layoutFolders = sanitizeFolders(s['layoutFolders'], sections.layouts).folders
  }
  if ('settings' in s) sections.settings = sanitizeSettings(s['settings'])
  if (!SECTION_IDS.some((id) => sections[id] !== undefined)) return null
  return {
    format: EXPORT_FORMAT,
    version: payload['version'],
    app: typeof payload['app'] === 'string' ? payload['app'] : '',
    exportedAt: typeof payload['exportedAt'] === 'string' ? payload['exportedAt'] : '',
    user: {
      username: typeof user['username'] === 'string' ? user['username'] : '',
      server: typeof user['server'] === 'string' ? user['server'] : ''
    },
    sections
  }
}

/** Dosyadaki bölümle şu anki kayıtları değiştirir. */
export function applySection(bundle: ExportBundle, id: SectionId): void {
  const s = bundle.sections
  switch (id) {
    case 'snippets':
      if (s.snippets) useSnippets.getState().replaceAll(s.snippets)
      return
    case 'alarms':
      if (s.alarms) useAlarms.getState().replaceRules(s.alarms)
      return
    case 'highlights':
      if (s.highlights) useHighlights.getState().replaceAll(s.highlights)
      return
    case 'layouts':
      if (s.layouts) useLayouts.getState().replaceAll(s.layouts, s.layoutFolders)
      return
    case 'settings':
      if (!s.settings) return
      useFontSizes.getState().replace(s.settings.fontSizes)
      usePreferences.getState().set(s.settings.terminal)
      useNotificationSettings.getState().replace(s.settings.notifications)
      void useTheme.getState().setPreference(s.settings.theme)
      setLanguage(s.settings.language)
  }
}

/** Bir bölümün kartta gösterilen özeti: ana sayı ve ayrıntı satırı. */
export interface SectionSummary {
  count: number
  /** Kartın büyük rakamının yanındaki birim ("snippet", "kural"...). */
  unit: string
  details: string[]
  /** Bölümde aktarılacak kayıt yok (ayarlar her zaman vardır). */
  empty: boolean
}

/** Tema adlarının Türkçe kaynak metinleri; özet üretilirken çevrilir. */
const THEME_LABEL: Record<ThemePreference, string> = {
  system: 'Sistem Teması',
  dark: 'Koyu Tema',
  light: 'Açık Tema'
}

/** Metinler çağrı anında çevrilir; ekranlar özeti çizim sırasında üretir. */
export function summarize(id: SectionId, sections: BundleSections): SectionSummary | null {
  switch (id) {
    case 'snippets': {
      const list = sections.snippets
      if (!list) return null
      const groups = new Set(list.map((x) => x.group)).size
      return {
        count: list.length,
        unit: t('snippet', { n: list.length }),
        details: [t('{n} grup', { n: groups })],
        empty: !list.length
      }
    }
    case 'alarms': {
      const list = sections.alarms
      if (!list) return null
      const on = list.filter((r) => r.enabled).length
      const regex = list.filter((r) => r.regex).length
      return {
        count: list.length,
        unit: t('kural', { n: list.length }),
        details: [
          t('{n} aktif', { n: on }),
          ...(regex ? [t('{n} düzenli ifade', { n: regex })] : [])
        ],
        empty: !list.length
      }
    }
    case 'highlights': {
      const list = sections.highlights
      if (!list) return null
      const on = list.filter((r) => r.enabled).length
      return {
        count: list.length,
        unit: t('kural', { n: list.length }),
        details: [t('{n} aktif', { n: on })],
        empty: !list.length
      }
    }
    case 'layouts': {
      const list = sections.layouts
      if (!list) return null
      const servers = list.reduce((n, l) => n + countServers(l.items), 0)
      const folders = sections.layoutFolders?.length ?? 0
      return {
        count: list.length,
        unit: t('düzen', { n: list.length }),
        details: [
          t('{n} sunucu', { n: servers }),
          ...(folders ? [t('{n} klasör', { n: folders })] : [])
        ],
        empty: !list.length && !folders
      }
    }
    case 'settings': {
      const set = sections.settings
      if (!set) return null
      const n = set.notifications
      const count = 5
      return {
        count,
        unit: t('ayar grubu', { n: count }),
        details: [
          LANGUAGES.find((l) => l.id === set.language)?.label ?? set.language,
          t('Yazı {ui}/{tree}/{terminal} px', { ...set.fontSizes }),
          t(THEME_LABEL[set.theme]),
          n.alarmDesktop ? t('Bildirimler açık') : t('Bildirimler kapalı'),
          t('Alarm bekleme {connect}+{snippet} sn', {
            connect: n.connectWaitSec,
            snippet: n.snippetWaitSec
          })
        ],
        empty: false
      }
    }
  }
}

/** Şu anki kayıtların özeti (dışa aktarım ekranı ve içe aktarımda "mevcut" sayıları). */
export function currentSections(): BundleSections {
  const out: BundleSections = {}
  for (const id of SECTION_IDS) Object.assign(out, { [id]: collect(id) })
  out.layoutFolders = useLayouts.getState().folders
  return out
}

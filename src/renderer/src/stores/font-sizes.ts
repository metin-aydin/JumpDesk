import { create } from 'zustand'
import { jumpdesk } from '@/lib/jumpdesk'
import { onUserScope, readUserJson, writeUserJson } from '@/lib/user-storage'

/** Ayrı ayarlanan yazı boyutları (px): arayüz geneli, sunucu ağacı ve terminal. */
export interface FontSizes {
  ui: number
  tree: number
  terminal: number
}

export type FontSizeKey = keyof FontSizes

/** Arayüz bu boyuta göre tasarlandı; arayüz boyutu bundan farklıysa pencere yakınlaştırılır. */
export const BASE_UI_FONT = 13

export const FONT_SIZE_DEFAULTS: FontSizes = { ui: 13, tree: 13, terminal: 13 }

export const FONT_SIZE_LIMITS: Record<FontSizeKey, { min: number; max: number }> = {
  ui: { min: 11, max: 18 },
  tree: { min: 10, max: 20 },
  terminal: { min: 9, max: 24 }
}

const KEY = 'fontSizes'

const clamp = (key: FontSizeKey, value: number): number =>
  Math.min(FONT_SIZE_LIMITS[key].max, Math.max(FONT_SIZE_LIMITS[key].min, Math.round(value)))

/** Kayıttan ya da içe aktarılan dosyadan gelen boyutları doğrular; sınır dışı değerler sınıra çekilir. */
export function sanitizeFontSizes(raw: unknown): FontSizes {
  const out = { ...FONT_SIZE_DEFAULTS }
  if (!raw || typeof raw !== 'object') return out
  for (const key of Object.keys(out) as FontSizeKey[]) {
    const value = (raw as Record<string, unknown>)[key]
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = clamp(key, value)
  }
  return out
}

function read(): FontSizes {
  return sanitizeFontSizes(readUserJson(KEY))
}

/** Arayüz yakınlaştırma çarpanı: tüm pencere bu oranla büyür ya da küçülür. */
export const uiZoom = (sizes: Pick<FontSizes, 'ui'>): number => sizes.ui / BASE_UI_FONT

/**
 * Pencere yakınlaştırılmışken CSS pikseli ekranda `zoom` kat büyük görünür. Ağaç ve terminal kendi boyutlarını
 * yakınlaştırmadan bağımsız tutmak için bu çarpana bölünmüş değerler kullanır.
 */
export const unzoomed = (px: number, sizes: Pick<FontSizes, 'ui'>): number => px / uiZoom(sizes)

interface FontSizeStore extends FontSizes {
  set: (key: FontSizeKey, value: number) => void
  /** Üç boyutu birden değiştirir (içe aktarma). */
  replace: (sizes: FontSizes) => void
  reset: () => void
}

function persist(sizes: FontSizes): void {
  writeUserJson(KEY, sizes)
}

export const useFontSizes = create<FontSizeStore>((set, get) => ({
  ...read(),
  set: (key, value) => {
    const next = {
      ui: get().ui,
      tree: get().tree,
      terminal: get().terminal,
      [key]: clamp(key, value)
    }
    persist(next)
    set(next)
    if (key === 'ui') jumpdesk.ui.setZoom(uiZoom(next))
  },
  replace: (sizes) => {
    persist(sizes)
    set({ ...sizes })
    jumpdesk.ui.setZoom(uiZoom(sizes))
  },
  reset: () => {
    persist(FONT_SIZE_DEFAULTS)
    set({ ...FONT_SIZE_DEFAULTS })
    jumpdesk.ui.setZoom(uiZoom(FONT_SIZE_DEFAULTS))
  }
}))

/** Kullanıcı değişince onun boyutları uygulanır; giriş ekranı varsayılan boyuttadır. */
onUserScope(() => {
  const sizes = read()
  useFontSizes.setState(sizes)
  jumpdesk.ui.setZoom(uiZoom(sizes))
})

/** Depodaki boyutların düz kopyası (dışa aktarma için). */
export function currentFontSizes(): FontSizes {
  const { ui, tree, terminal } = useFontSizes.getState()
  return { ui, tree, terminal }
}

/** Kayıtlı arayüz boyutu ilk çizimden önce uygulanır. */
export function applyStoredZoom(): void {
  jumpdesk.ui.setZoom(uiZoom(useFontSizes.getState()))
}

/**
 * Sunucu ağacı satırlarının ölçeği: satırlar 13 px'e göre tasarlandı, içerik bu oranla (CSS `zoom`) çizilir. Pencere
 * yakınlaştırması hesaba katıldığından ağaç boyutu arayüz boyutundan bağımsızdır.
 */
export const useTreeScale = (): number => useFontSizes((s) => unzoomed(s.tree, s) / BASE_UI_FONT)

/** xterm'e verilen yazı boyutu (CSS px); ekranda ayarlanan terminal boyutunda görünür. */
export const terminalFontSize = (sizes: Pick<FontSizes, 'ui' | 'terminal'>): number =>
  unzoomed(sizes.terminal, sizes)

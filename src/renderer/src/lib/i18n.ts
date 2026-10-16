import { useMemo } from 'react'
import { create } from 'zustand'
import { jumpdesk } from '@/lib/jumpdesk'
import { onUserScope, readUserItem, writeUserItem } from '@/lib/user-storage'
import { EN } from '@/i18n/en'

/**
 * Arayüz dili. Kaynak metinler Türkçedir ve doğrudan anahtar olarak kullanılır: `t('Yeni Bağlantı')` İngilizcede
 * sözlükteki karşılığını, Türkçede metnin kendisini döndürür. Parametreler `{ad}` biçiminde yazılır:
 * `t('{n} sunucuya bağlan', { n })`. Sayıya göre değişen İngilizce karşılıklar sözlükte işlev olarak tanımlanır.
 */
export type Language = 'en' | 'tr'

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'tr', label: 'Türkçe' }
]

export type Params = Record<string, string | number>
export type Dictionary = Record<string, string | ((params: Params) => string)>

export const isLanguage = (v: unknown): v is Language => v === 'en' || v === 'tr'

const KEY = 'language'

interface LanguageStore {
  language: Language
}

/** Başlangıç dili: ortam değişkeni (test) ya da son kullanılan dil; hiç seçilmediyse İngilizce. */
export const useLanguage = create<LanguageStore>(() => ({ language: jumpdesk.language }))

const fill = (text: string, params?: Params): string =>
  params
    ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m))
    : text

/** Sözlükte karşılığı olmayan metinler (testler bunları okuyup eksik çeviri olarak raporlar). */
const misses = new Set<string>()
;(globalThis as { __jumpdeskI18nMisses?: Set<string> }).__jumpdeskI18nMisses = misses

/** Metni geçerli dile çevirir; React dışındaki kod (depolar, bildirimler) doğrudan kullanır. */
export function t(source: string, params?: Params): string {
  if (useLanguage.getState().language === 'tr') return fill(source, params)
  const entry = EN[source]
  if (entry === undefined) {
    misses.add(source)
    return fill(source, params)
  }
  return typeof entry === 'function' ? entry(params ?? {}) : fill(entry, params)
}

/**
 * Bileşenlerde `const t = useT()`: dil değişince bileşen yeniden çizilir ve işlevin kimliği değişir (`useMemo`
 * bağımlılığı olarak kullanılabilir).
 */
export function useT(): typeof t {
  const language = useLanguage((s) => s.language)
  return useMemo(() => {
    void language
    return (source: string, params?: Params) => t(source, params)
  }, [language])
}

/** Tarih ve sayı biçimlendirmesi için geçerli dilin yerel ayarı. */
export function currentLocale(): string {
  return useLanguage.getState().language === 'tr' ? 'tr-TR' : 'en-US'
}

function apply(language: Language): void {
  document.documentElement.lang = language
  useLanguage.setState({ language })
}

/** Dili değiştirir: kullanıcının kayıtlarına ve (giriş ekranı ile ana süreç iletileri için) son dil olarak yazılır. */
export function setLanguage(language: Language): void {
  if (jumpdesk.languageForced) return
  writeUserItem(KEY, language)
  jumpdesk.settings.setLanguage(language)
  apply(language)
}

apply(jumpdesk.language)

/** Giriş yapan kullanıcının seçtiği dil uygulanır; seçimi yoksa geçerli dil kalır. */
onUserScope(() => {
  if (jumpdesk.languageForced) return
  const saved = readUserItem(KEY)
  if (isLanguage(saved) && saved !== useLanguage.getState().language) {
    jumpdesk.settings.setLanguage(saved)
    apply(saved)
  }
})

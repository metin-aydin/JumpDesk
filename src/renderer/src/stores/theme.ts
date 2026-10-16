import { create } from 'zustand'
import type { ThemeInfo } from '@shared/api'
import type { ThemePreference } from '@shared/types'
import { jumpdesk } from '@/lib/jumpdesk'
import {
  currentUserScope,
  onUserScope,
  provideLegacyValue,
  readUserItem,
  writeUserItem
} from '@/lib/user-storage'

const KEY = 'theme'
const PREFERENCES: ThemePreference[] = ['system', 'dark', 'light']

export const isThemePreference = (v: unknown): v is ThemePreference =>
  PREFERENCES.includes(v as ThemePreference)

interface ThemeStore {
  info: ThemeInfo
  setPreference: (p: ThemePreference) => Promise<void>
}

function apply(info: ThemeInfo): void {
  document.documentElement.classList.toggle('dark', info.resolved === 'dark')
  document.documentElement.style.colorScheme = info.resolved
}

export const useTheme = create<ThemeStore>((set) => ({
  info: { preference: 'system', resolved: 'dark' },
  setPreference: async (p) => {
    writeUserItem(KEY, p)
    const info = await jumpdesk.theme.set(p)
    apply(info)
    set({ info })
  }
}))

/** Giriş yapan kullanıcının seçtiği tema uygulanır (seçimi yoksa sistem teması); çıkışta tema değişmez. */
onUserScope(() => {
  if (!currentUserScope()) return
  const saved = readUserItem(KEY)
  const preference = isThemePreference(saved) ? saved : 'system'
  if (preference !== useTheme.getState().info.preference)
    void useTheme.getState().setPreference(preference)
})

/** Kullanıcıya özel tema kaydı olmayan eski sürümde seçilen tema, ilk giriş yapan kullanıcıya geçer. */
provideLegacyValue(KEY, () => useTheme.getState().info.preference)

export async function initTheme(): Promise<void> {
  const info = await jumpdesk.theme.get()
  apply(info)
  useTheme.setState({ info })
  jumpdesk.theme.onChange((next) => {
    apply(next)
    useTheme.setState({ info: next })
  })
}

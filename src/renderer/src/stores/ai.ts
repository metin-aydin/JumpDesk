import { create } from 'zustand'
import { aiConfigured, type AiConfig, type AiFeatures, type AiProvider } from '@shared/ai'
import { jumpdesk } from '@/lib/jumpdesk'
import { currentUserScope, onUserScope } from '@/lib/user-storage'

/**
 * Yapay zeka ayarları ana süreçte kullanıcıya özel tutulur; burada gizli alanların değeri yoktur, yalnız kayıtlı olup
 * olmadıkları bilinir.
 */
interface AiStore {
  config: AiConfig | null
  load: () => Promise<void>
  setProvider: (provider: AiProvider | null) => Promise<void>
  setField: (provider: AiProvider, key: string, value: string) => Promise<void>
  setSecret: (provider: AiProvider, key: string, value: string | null) => Promise<void>
  setFeatures: (features: Partial<AiFeatures>) => Promise<void>
}

export const useAi = create<AiStore>((set) => ({
  config: null,
  load: async () => set({ config: await jumpdesk.ai.getConfig() }),
  setProvider: async (provider) => set({ config: await jumpdesk.ai.setConfig({ provider }) }),
  setField: async (provider, key, value) =>
    set({ config: await jumpdesk.ai.setConfig({ field: { provider, key, value } }) }),
  setSecret: async (provider, key, value) =>
    set({ config: await jumpdesk.ai.setSecret(provider, key, value) }),
  setFeatures: async (features) => set({ config: await jumpdesk.ai.setConfig({ features }) })
}))

onUserScope(() => {
  useAi.setState({ config: null })
  if (currentUserScope()) void useAi.getState().load()
})

/** Autocomplete'te yapay zeka kullanılabilir mi (özellik açık ve ayarlar eksiksiz). */
export const aiAutocompleteReady = (config: AiConfig | null): boolean =>
  Boolean(config?.features.autocomplete && aiConfigured(config))

/** Sekme önizlemesi: terminaller renkli HTML, uzak masaüstü küçük resim üretir. */
export type TabPreview =
  { kind: 'html'; html: string; background: string } | { kind: 'image'; src: string }

const providers = new Map<string, () => TabPreview | null>()

export const previewRegistry = {
  set(tabId: string, provider: () => TabPreview | null): void {
    providers.set(tabId, provider)
  },
  delete(tabId: string): void {
    providers.delete(tabId)
  },
  capture(tabId: string): TabPreview | null {
    try {
      return providers.get(tabId)?.() ?? null
    } catch {
      return null
    }
  }
}

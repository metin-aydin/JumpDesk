import type { AiTurn } from '@shared/ai'

const MAX_TURNS = 10

/**
 * Oturum başına yapay zeka sohbeti: sorulan sorular ve önerilen komutlar. Yalnız bellekte tutulur; sonraki sorularda
 * bağlam olarak gönderilir.
 */
const turns = new Map<string, AiTurn[]>()

export const conversation = {
  get(tabId: string): AiTurn[] {
    return turns.get(tabId) ?? []
  },
  add(tabId: string, turn: AiTurn): void {
    turns.set(tabId, [...this.get(tabId), turn].slice(-MAX_TURNS))
  },
  clear(tabId: string): void {
    turns.delete(tabId)
  }
}

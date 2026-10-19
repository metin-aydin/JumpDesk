import type { Terminal } from '@xterm/xterm'

/** Arama eşleşmelerinin renkleri (koyu ve açık tema). */
export const SEARCH_DECORATIONS = {
  dark: {
    matchBackground: '#5c4a12',
    activeMatchBackground: '#c27c0e',
    matchOverviewRuler: '#d4a017',
    activeMatchColorOverviewRuler: '#f59e0b'
  },
  light: {
    matchBackground: '#ffe9a8',
    activeMatchBackground: '#fbbf24',
    matchOverviewRuler: '#d4a017',
    activeMatchColorOverviewRuler: '#f59e0b'
  }
}

const ACTIVE_MATCH = new Set(Object.values(SEARCH_DECORATIONS).map((d) => d.activeMatchBackground))

/**
 * Arama eklentisi etkin eşleşmeyi seçer ve rengini alt katman süslemesi olarak ekler; çizici seçim rengini alt katmanın
 * üstüne boyadığı için turuncu, seçim kalkana (terminale tıklanana) kadar görünmez. Etkin eşleşmenin süslemesi üst
 * katmana alınır, seçimin üstünde çizilir.
 */
export function raiseActiveMatch(term: Terminal): void {
  const register = term.registerDecoration.bind(term)
  term.registerDecoration = (options) =>
    register(
      options.backgroundColor && ACTIVE_MATCH.has(options.backgroundColor)
        ? { ...options, layer: 'top' }
        : options
    )
}

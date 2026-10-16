import type { Terminal } from '@xterm/xterm'

/** İstem sonundan itibaren terminal tamponunda görünen komut satırı ve her karakterin hücre konumu. */
export interface InputLine {
  text: string
  /** `text` içindeki her karakterin mutlak tampon konumu (y = baseY + satır). */
  cells: { x: number; y: number }[]
  /** İmlecin `text` içindeki konumu. */
  cursor: number
}

const MAX_LINES = 12

/** Kabuk entegrasyonunun B işaretiyle bilinen istem sonundan imlece/satır sonuna kadar olan metni okur. */
export function readInputLine(
  term: Terminal,
  promptEnd: { x: number; y: number }
): InputLine | null {
  const buf = term.buffer.active
  if (buf.type !== 'normal') return null
  const cursorY = buf.baseY + buf.cursorY
  const cursorX = buf.cursorX
  if (cursorY < promptEnd.y || cursorY - promptEnd.y > MAX_LINES) return null
  if (cursorY === promptEnd.y && cursorX < promptEnd.x) return null

  let text = ''
  const cells: { x: number; y: number }[] = []
  let cursor = -1
  let y = promptEnd.y
  let x = promptEnd.x
  const cell = buf.getNullCell()

  for (;;) {
    const line = buf.getLine(y)
    if (!line) break
    let lastNonSpace = text.length
    for (; x < term.cols; x++) {
      if (y === cursorY && x === cursorX && cursor < 0) cursor = text.length
      line.getCell(x, cell)
      if (cell.getWidth() === 0) continue
      const chars = cell.getChars() || ' '
      text += chars
      cells.push({ x, y })
      if (chars !== ' ') lastNonSpace = text.length
    }
    const next = buf.getLine(y + 1)
    if (next?.isWrapped && y + 1 <= cursorY + MAX_LINES) {
      y++
      x = 0
      continue
    }
    if (cursor < 0 && y === cursorY) cursor = text.length
    const trimTo = Math.max(lastNonSpace, cursor)
    text = text.slice(0, trimTo)
    cells.length = trimTo
    break
  }
  if (cursor < 0) cursor = text.length
  return { text, cells, cursor }
}

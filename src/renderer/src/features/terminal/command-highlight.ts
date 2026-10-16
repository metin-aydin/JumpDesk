import type { Terminal } from '@xterm/xterm'
import type { InputLine } from './input-line'

/**
 * Komut satırını yerelde yeniden boyar: aynı karakterler aynı hücrelere renkli olarak yazılır, imleç ve öznitelikler
 * DECSC/DECRC ile korunur. Uzak kabuk etkilenmez; bir sonraki yeniden çizimde kabuk düz metin yazar, biz tekrar boyarız.
 */

export interface HighlightContext {
  commandNames: Set<string>
  entries: Set<string>
}

const SGR = {
  command: '\x1b[1;92m',
  unknown: '\x1b[1;91m',
  option: '\x1b[96m',
  string: '\x1b[93m',
  variable: '\x1b[95m',
  operator: '\x1b[1;97m',
  path: '\x1b[4;94m',
  plain: '\x1b[0m'
}

type Kind = keyof typeof SGR

const OPERATORS = new Set(['|', '||', '&&', ';', '&', '>', '>>', '<', '<<', '2>', '2>&1', '|&'])
const SHELL_WORDS = new Set([
  'sudo',
  'time',
  'nohup',
  'env',
  'exec',
  'command',
  'builtin',
  'watch',
  'xargs'
])

interface Token {
  start: number
  end: number
  kind: Kind
}

export function tokenize(text: string, ctx: HighlightContext): Token[] {
  const tokens: Token[] = []
  let i = 0
  let expectCommand = true
  while (i < text.length) {
    if (text[i] === ' ' || text[i] === '\t') {
      i++
      continue
    }
    const start = i
    const op = ['2>&1', '&&', '||', '>>', '<<', '|&', '2>', '|', ';', '&', '>', '<'].find((o) =>
      text.startsWith(o, i)
    )
    if (op) {
      i += op.length
      tokens.push({ start, end: i, kind: 'operator' })
      expectCommand = op !== '>' && op !== '>>' && op !== '<' && op !== '2>' && op !== '<<'
      continue
    }
    let quoted = false
    while (i < text.length && text[i] !== ' ' && text[i] !== '\t') {
      const ch = text[i]
      if (ch === '"' || ch === "'") {
        quoted = true
        const close = text.indexOf(ch, i + 1)
        i = close < 0 ? text.length : close + 1
        continue
      }
      if (['|', ';', '&', '>', '<'].includes(ch)) break
      i++
    }
    const word = text.slice(start, i)
    let kind: Kind
    if (expectCommand) {
      const name = word.replace(/^[^=]+=.*$/, '')
      if (!name) {
        kind = 'variable'
      } else {
        kind =
          ctx.commandNames.size === 0 || ctx.commandNames.has(word) || word.includes('/')
            ? 'command'
            : 'unknown'
        expectCommand = SHELL_WORDS.has(word)
      }
    } else if (quoted && (word.startsWith('"') || word.startsWith("'"))) kind = 'string'
    else if (word.startsWith('-')) kind = 'option'
    else if (word.startsWith('$')) kind = 'variable'
    else if (
      ctx.entries.has(word) ||
      ctx.entries.has(`${word}/`) ||
      word.startsWith('/') ||
      word.startsWith('~/') ||
      word.startsWith('./')
    )
      kind = 'path'
    else kind = 'plain'
    if (OPERATORS.has(word)) kind = 'operator'
    tokens.push({ start, end: i, kind })
  }
  return tokens
}

export function paintInputLine(term: Terminal, line: InputLine, ctx: HighlightContext): void {
  if (!line.text.trim() || line.cells.length === 0) return
  const kinds: Kind[] = new Array(line.text.length).fill('plain')
  for (const t of tokenize(line.text, ctx)) for (let i = t.start; i < t.end; i++) kinds[i] = t.kind

  const baseY = term.buffer.active.baseY
  let out = '\x1b7'
  let currentY = -1
  let currentKind: Kind | null = null
  for (let i = 0; i < line.text.length; i++) {
    const cell = line.cells[i]
    if (!cell) break
    const row = cell.y - baseY
    if (row < 0 || row >= term.rows) return
    if (cell.y !== currentY) {
      out += `\x1b[${row + 1};${cell.x + 1}H`
      currentY = cell.y
      currentKind = null
    }
    if (kinds[i] !== currentKind) {
      out += `\x1b[0m${SGR[kinds[i]]}`
      currentKind = kinds[i]
    }
    out += line.text[i]
  }
  out += '\x1b[0m\x1b8'
  term.write(out)
}

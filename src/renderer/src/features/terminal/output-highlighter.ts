/**
 * Terminal çıktısındaki düz metne anahtar kelime ve IP vurgusu ekler. Kaçış dizilerine dokunmaz, programın
 * kendisi ön plan rengi verdiği bölgeleri değiştirmez; parçalar arası durum (yarım kalan kaçış dizisi, SGR
 * rengi) korunur. Tam ekran uygulamalarda (alternatif tampon) çağıran tarafından devre dışı bırakılır.
 */

interface Rule {
  re: RegExp
  sgr: string
}

const RULES: Rule[] = [
  {
    re: /\b(?:ERROR|ERR|FATAL|FAIL(?:ED|URE)?|CRITICAL|PANIC|EXCEPTION|DENIED|REFUSED|Traceback)\b/gi,
    sgr: '91'
  },
  { re: /\b(?:WARN(?:ING)?|DEPRECATED)\b/gi, sgr: '93' },
  { re: /\b(?:SUCCESS(?:FUL(?:LY)?)?|PASS(?:ED)?|OK)\b|\bactive \(running\)/g, sgr: '92' },
  { re: /\b(?:INFO|NOTICE)\b/g, sgr: '96' },
  {
    re: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?::\d{1,5}|\/\d{1,2})?\b/g,
    sgr: '95'
  }
]

const COMBINED = new RegExp(RULES.map((r) => `(${r.re.source})`).join('|'), 'gi')

type State = 'text' | 'esc' | 'csi' | 'osc' | 'osc-esc' | 'str'

export class OutputHighlighter {
  private state: State = 'text'
  private csi = ''
  private fgSet = false

  private highlight(text: string): string {
    if (this.fgSet || text.length < 2) return text
    return text.replace(COMBINED, (match, ...groups: unknown[]) => {
      const index = groups.slice(0, RULES.length).findIndex((g) => g !== undefined)
      const rule = RULES[index]
      if (!rule) return match
      if (
        index <= 3 &&
        !new RegExp(`^(?:${rule.re.source})$`, rule.re.flags.replace('g', '')).test(match)
      )
        return match
      return `\x1b[${rule.sgr}m${match}\x1b[39m`
    })
  }

  private applySgr(params: string): void {
    const parts = params === '' ? ['0'] : params.split(/[;:]/)
    for (let i = 0; i < parts.length; i++) {
      const n = Number(parts[i] || 0)
      if (n === 0 || n === 39) this.fgSet = false
      else if ((n >= 30 && n <= 37) || (n >= 90 && n <= 97)) this.fgSet = true
      else if (n === 38) {
        this.fgSet = true
        i += parts[i + 1] === '5' ? 2 : 4
      } else if (n === 48) i += parts[i + 1] === '5' ? 2 : 4
    }
  }

  process(input: string): string {
    let out = ''
    let text = ''
    const flush = (): void => {
      if (text) out += this.highlight(text)
      text = ''
    }

    for (let i = 0; i < input.length; i++) {
      const ch = input[i]
      switch (this.state) {
        case 'text':
          if (ch === '\x1b') {
            flush()
            this.state = 'esc'
            out += ch
          } else {
            text += ch
          }
          break
        case 'esc':
          out += ch
          if (ch === '[') {
            this.state = 'csi'
            this.csi = ''
          } else if (ch === ']') this.state = 'osc'
          else if (ch === 'P' || ch === '_' || ch === '^' || ch === 'X') this.state = 'str'
          else this.state = 'text'
          break
        case 'csi':
          out += ch
          if (ch >= '@' && ch <= '~') {
            if (ch === 'm') this.applySgr(this.csi)
            this.state = 'text'
          } else this.csi += ch
          break
        case 'osc':
        case 'str':
          out += ch
          if (ch === '\x07') this.state = 'text'
          else if (ch === '\x1b') this.state = 'osc-esc'
          break
        case 'osc-esc':
          out += ch
          this.state = ch === '\\' ? 'text' : 'osc'
          break
      }
    }
    flush()
    return out
  }
}

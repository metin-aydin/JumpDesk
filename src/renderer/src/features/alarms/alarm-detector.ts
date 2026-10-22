import { compileRule, useAlarms, type AlarmRule } from '@/stores/alarms'

const MAX_PARTIAL = 4096
/** Alarm satırıyla birlikte saklanan önceki satır sayısı. */
const CONTEXT_LINES = 8
/** Gönderilen komutun yankısı bu süre içinde tanınır (yavaş sunucuda yankı ve satır sonu gecikebilir). */
const ECHO_IGNORE_MS = 15_000

type EscapeState = 'text' | 'esc' | 'esc-int' | 'csi' | 'str' | 'str-esc'

/**
 * CR ile üst üste yazılan satırın son hali (satır sonundaki CR atılır); bash istemi pencere boyutu değişince aynı satıra
 * yeniden çizilir. Alarm panelinde bu gösterilir; eşleştirme ise satırın tamamıyla yapılır, çünkü readline uzun
 * komutun yankısını kaydırırken de CR kullanır.
 */
const visibleLine = (raw: string): string => {
  const text = raw.replace(/\r+$/, '')
  return text.slice(text.lastIndexOf('\r') + 1).trim()
}

/** Boşluklar karşılaştırmada yok sayılır: kabuk uzun komutun yankısını satır kaydırırken araya boşluk ve CR koyar. */
const squash = (text: string): string => text.replace(/\s+/g, '')

/**
 * Terminal çıktısını satırlara bölüp etkin alarm kurallarıyla karşılaştırır. Kaçış dizileri parçalar arası durumla
 * ayıklanır; OSC/DCS gövdeleri (ör. kabuk entegrasyonunun base64 verisi) hiçbir zaman metne karışmaz. Kullanıcının az
 * önce gönderdiği komutun yankısı (ör. `grep Exception app.log`), kabuk onu birden çok satıra kaydırsa da alarm
 * sayılmaz. Bir satır en çok bir kurala eşlenir.
 */
export class AlarmDetector {
  private partial = ''
  private state: EscapeState = 'text'
  private compiled: { rule: AlarmRule; re: RegExp }[] = []
  /** Beklenen yankılar; `pos`, birden çok satıra bölünen yankının şimdiye kadar görülen uzunluğu. */
  private echoes: { text: string; pos: number; until: number }[] = []
  /** Bu zamandan önce eşleşmeler bildirilmez (bağlantının ilk saniyeleri); çıktı yine de izlenir. */
  private quietUntil = Infinity
  /** Bağlantı bekleme süresinin bittiği an; `release` bu andan önce bitiremez. */
  private warmupEnds = Infinity
  /** Bağlanınca çalışacak komutlar henüz gönderilmedi; o zamana kadar eşleşmeler bildirilmez. */
  private held = false
  /** Son görülen satırlar (görünen hâlleriyle); eşleşen satırın bağlamı olarak bildirilir. */
  private recent: string[] = []
  private readonly unsubscribe: () => void

  constructor(
    private readonly onMatch: (rule: AlarmRule, line: string, context: string[]) => void
  ) {
    this.compile(useAlarms.getState().rules)
    this.unsubscribe = useAlarms.subscribe((s, prev) => {
      if (s.rules !== prev.rules) this.compile(s.rules)
    })
  }

  private compile(rules: AlarmRule[]): void {
    this.compiled = rules
      .filter((r) => r.enabled)
      .map((rule) => ({ rule, re: compileRule(rule) }))
      .filter((c): c is { rule: AlarmRule; re: RegExp } => c.re !== null)
  }

  /**
   * Alarmlar verilen süre sonra bildirilmeye başlar. O zamana kadar gelen çıktı (karşılama mesajı, girişte çalışan
   * betikler) kaçış dizisi durumu ve satır takibi için okunur ama alarm sayılmaz.
   */
  startAfter(ms: number): void {
    this.warmupEnds = Date.now() + ms
    this.quietUntil = this.held ? Infinity : this.warmupEnds
  }

  /** Alarmlar `release` çağrılana kadar bildirilmez (bağlanınca çalışacak snippetler bekleniyor). */
  hold(): void {
    this.held = true
    this.quietUntil = Infinity
  }

  /**
   * Bekletme biter: alarmlar verilen süre sonra (bağlantı bekleme süresi daha geç bitiyorsa o zaman) bildirilmeye
   * başlar.
   */
  release(ms: number): void {
    if (!this.held) return
    this.held = false
    this.quietUntil = Math.max(this.warmupEnds, Date.now() + ms)
  }

  /** Gönderilen komut satırı; yankısı birkaç saniye içinde gelirse yok sayılır. */
  ignoreEcho(command: string): void {
    const text = squash(command)
    const now = Date.now()
    this.echoes = this.echoes.filter((e) => e.until > now)
    if (text) this.echoes.push({ text, pos: 0, until: now + ECHO_IGNORE_MS })
  }

  /**
   * Satır komutun yankısı mı: komutun tamamını içeriyor, ya da kabuğun birden çok satıra böldüğü yankının sıradaki
   * parçası (ilk parça istemle başlayıp komutun başıyla biter, sonrakiler kaldığı yerden sürer). Yankı tamamlanınca
   * kayıt düşer; komutun çıktısı (ör. `echo "…Exception…"`) komut metninin bir parçası olsa da yankı sayılmaz.
   */
  private isEcho(line: string): boolean {
    const now = Date.now()
    this.echoes = this.echoes.filter((e) => e.until > now)
    const sq = squash(line)
    if (!sq) return false
    for (let i = 0; i < this.echoes.length; i++) {
      const echo = this.echoes[i]
      if (echo.pos === 0) {
        if (sq.includes(echo.text)) {
          this.echoes.splice(i, 1)
          return true
        }
        const at = sq.indexOf(echo.text.slice(0, Math.min(16, echo.text.length)))
        if (at >= 0 && echo.text.startsWith(sq.slice(at))) {
          echo.pos = sq.length - at
          return true
        }
        continue
      }
      const rest = echo.text.slice(echo.pos)
      if (rest.startsWith(sq) || sq.startsWith(rest)) {
        echo.pos += sq.length
        if (echo.pos >= echo.text.length) this.echoes.splice(i, 1)
        return true
      }
    }
    return false
  }

  /** Görünen metin: CSI, OSC, DCS ve tek karakterli kaçış dizileri atılır; yarım kalan dizi sonraki parçada sürer. */
  private visible(input: string): string {
    let out = ''
    for (let i = 0; i < input.length; i++) {
      const ch = input[i]
      switch (this.state) {
        case 'text':
          if (ch === '\x1b') this.state = 'esc'
          else out += ch
          break
        case 'esc':
          if (ch === '[') this.state = 'csi'
          else if (ch === ']' || ch === 'P' || ch === '_' || ch === '^' || ch === 'X')
            this.state = 'str'
          else if (ch >= ' ' && ch <= '/') this.state = 'esc-int'
          else this.state = 'text'
          break
        case 'esc-int':
          if (ch >= '0' && ch <= '~') this.state = 'text'
          break
        case 'csi':
          if (ch >= '@' && ch <= '~') this.state = 'text'
          break
        case 'str':
          if (ch === '\x07') this.state = 'text'
          else if (ch === '\x1b') this.state = 'str-esc'
          break
        case 'str-esc':
          // ESC \ diziyi bitirir; başka bir karakter yeni bir kaçış dizisi başlatır.
          if (ch === '\\') this.state = 'text'
          else {
            this.state = 'esc'
            i--
          }
          break
      }
    }
    return out
  }

  feed(text: string): void {
    const visible = this.visible(text)
    if (this.compiled.length === 0) {
      this.partial = ''
      return
    }
    const lines = (this.partial + visible).split('\n')
    this.partial = (lines.pop() ?? '').slice(-MAX_PARTIAL)
    if (Date.now() < this.quietUntil) return
    for (const raw of lines) {
      const line = raw.replace(/\r/g, '').trimEnd()
      if (!line) continue
      const context = this.remember(visibleLine(raw) || line.trim())
      if (this.echoes.length && this.isEcho(line)) continue
      const hit = this.compiled.find((c) => c.re.test(line))
      if (!hit) continue
      // Panelde satırın görünen son hali gösterilir (eşleşme oradaysa); üst üste çizilen istemler gösterilmez.
      const shown = visibleLine(raw)
      this.onMatch(hit.rule, shown && hit.re.test(shown) ? shown : line.trim(), context)
    }
  }

  /**
   * Satırı son satırlara ekler ve ondan önceki satırları döndürür. Geri silme (BS) önceki karakteri siler (readline
   * satırı Ctrl+U ya da düzeltmeyle böyle yeniden çizer), diğer kontrol karakterleri atılır.
   */
  private remember(line: string): string[] {
    const before = this.recent.slice()
    let text = ''
    for (const ch of line) {
      if (ch === '\b') text = text.slice(0, -1)
      // eslint-disable-next-line no-control-regex -- kontrol karakterleri bilerek atılır
      else if (!/[\x00-\x1f\x7f]/.test(ch) || ch === '\t') text += ch
    }
    this.recent.push(text)
    if (this.recent.length > CONTEXT_LINES) this.recent.shift()
    return before
  }

  dispose(): void {
    this.unsubscribe()
  }
}

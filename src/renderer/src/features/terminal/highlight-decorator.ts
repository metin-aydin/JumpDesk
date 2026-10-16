import type { IBufferCell, IDecoration, IDisposable, Terminal } from '@xterm/xterm'
import { compileHighlight, useHighlights, type HighlightRule } from '@/stores/highlights'

interface CompiledRule {
  re: RegExp
  fg: string | undefined
  bg: string | undefined
}

/** Metindeki bir UTF-16 biriminin geldiği hücre. */
interface CellRef {
  row: number
  col: number
  width: number
}

const SCAN_DELAY_MS = 40
/** Bu uzunluğu aşan mantıksal satırlar (ör. tek satırlık dev JSON) taranmaz. */
const MAX_LINE_LENGTH = 8000

/**
 * Vurgu kurallarını terminal arabelleğine xterm süslemeleri (decoration) olarak uygular; terminale giden veri
 * değiştirilmez. Kaydırma geçmişine çıkan satırlar bir kez taranır ve süslemeleri satırla birlikte kayar. Etkin
 * sayfadaki satırlar (programlar yeniden yazabilir) her yazmadan sonra yeniden taranır. Tam ekran programlarda
 * (alternatif ekran) her yazmada görünen ekran baştan taranır. Kurallar, boyut ya da ekran değişince her şey yeniden
 * kurulur.
 */
export class HighlightDecorator {
  private rules: CompiledRule[] = []
  /** Kaydırma geçmişindeki, artık değişmeyecek satırların süslemeleri (satır sırasıyla). */
  private settled: IDecoration[] = []
  /** Etkin sayfadaki satırların süslemeleri; her taramada yeniden kurulur. */
  private page: IDecoration[] = []
  /** Önceki taramada etkin sayfanın ilk satırı. */
  private pageTop: { line: number; isDisposed: boolean; dispose(): void } | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private full = true
  /** Terminal görünmüyorsa tarama ertelenir; görünür olunca bekleyen tarama yapılır. */
  private active = true
  private pending = false
  private cell: IBufferCell | undefined
  private readonly disposables: IDisposable[] = []

  constructor(private readonly term: Terminal) {
    this.compile(useHighlights.getState().rules)
    const unsubscribe = useHighlights.subscribe((s, prev) => {
      if (s.rules === prev.rules) return
      this.compile(s.rules)
      this.rebuild()
    })
    this.disposables.push(
      { dispose: unsubscribe },
      term.onWriteParsed(() => this.schedule()),
      term.onResize(() => this.rebuild()),
      term.buffer.onBufferChange(() => this.rebuild())
    )
    this.schedule()
  }

  private compile(rules: HighlightRule[]): void {
    this.rules = []
    for (const r of rules) {
      const re = r.enabled && (r.fg || r.bg) ? compileHighlight(r) : null
      if (re) this.rules.push({ re, fg: r.fg ?? undefined, bg: r.bg ?? undefined })
    }
  }

  private rebuild(): void {
    this.full = true
    this.schedule()
  }

  /** Görünmeyen terminalde süslemeler gerekmez; çıktı ve boyut değişikliklerinin taraması ekrana gelince yapılır. */
  setActive(active: boolean): void {
    if (active === this.active) return
    this.active = active
    if (active && this.pending) {
      this.pending = false
      this.schedule()
    }
  }

  private schedule(): void {
    if (!this.active) {
      this.pending = true
      return
    }
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.scan()
    }, SCAN_DELAY_MS)
  }

  private clearAll(): void {
    for (const d of this.settled) d.dispose()
    for (const d of this.page) d.dispose()
    this.settled = []
    this.page = []
    this.pageTop?.dispose()
    this.pageTop = null
  }

  private scan(): void {
    const buf = this.term.buffer.active
    const full = this.full
    this.full = false
    if (full || this.rules.length === 0) this.clearAll()
    if (this.rules.length === 0) return

    for (const d of this.page) d.dispose()
    this.page = []
    const last = buf.baseY + this.term.rows - 1

    if (buf.type === 'alternate') {
      this.scanRange(buf.baseY, last, -Infinity)
      return
    }

    const top = buf.baseY
    let from =
      full || !this.pageTop || this.pageTop.isDisposed ? 0 : Math.min(this.pageTop.line, top)
    while (from > 0 && buf.getLine(from)?.isWrapped) from--
    // Mantıksal satır sayfanın üstünden başlıyorsa önceki taramada kalıcı sayılan parçası yeniden kurulur.
    while (this.settled.length && this.settled[this.settled.length - 1].marker.line >= from)
      this.settled.pop()!.dispose()
    while (this.settled.length && this.settled[0].isDisposed) this.settled.shift()

    this.scanRange(from, last, top)
    this.pageTop?.dispose()
    this.pageTop = this.marker(top) ?? null
  }

  /** `settledBefore`'dan önceki satırlara konan süslemeler kalıcı sayılır. */
  private scanRange(from: number, to: number, settledBefore: number): void {
    const buf = this.term.buffer.active
    const end = Math.min(to, buf.length - 1)
    let y = from
    while (y <= end) {
      const rows = [y]
      let next = y + 1
      while (next < buf.length && buf.getLine(next)?.isWrapped) rows.push(next++)
      this.scanLogical(rows, settledBefore)
      y = next
    }
  }

  private scanLogical(rows: number[], settledBefore: number): void {
    const buf = this.term.buffer.active
    let quick = ''
    for (let i = 0; i < rows.length; i++)
      quick += buf.getLine(rows[i])?.translateToString(i === rows.length - 1) ?? ''
    if (!quick.trim() || quick.length > MAX_LINE_LENGTH) return
    if (!this.rules.some((r) => this.test(r.re, quick))) return

    const { text, cells } = this.readCells(rows)
    const taken = new Uint8Array(text.length)
    for (const rule of this.rules) {
      rule.re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = rule.re.exec(text))) {
        if (m[0].length === 0) {
          rule.re.lastIndex++
          continue
        }
        const start = m.index
        const stop = start + m[0].length
        let free = true
        for (let i = start; i < stop && free; i++) free = taken[i] === 0
        if (!free) continue
        taken.fill(1, start, stop)
        this.decorateSpan(cells, start, stop, rule, settledBefore)
      }
    }
  }

  private test(re: RegExp, text: string): boolean {
    re.lastIndex = 0
    const hit = re.test(text)
    re.lastIndex = 0
    return hit
  }

  /** Hücreleri tek tek okuyarak metni ve her karakterin hücresini çıkarır (geniş karakterler, emoji). */
  private readCells(rows: number[]): { text: string; cells: CellRef[] } {
    const buf = this.term.buffer.active
    let text = ''
    const cells: CellRef[] = []
    for (const row of rows) {
      const line = buf.getLine(row)
      if (!line) continue
      for (let col = 0; col < line.length; col++) {
        this.cell = line.getCell(col, this.cell)
        const cell = this.cell
        if (!cell) continue
        const width = cell.getWidth()
        if (width === 0) continue
        const chars = cell.getChars() || ' '
        text += chars
        for (let i = 0; i < chars.length; i++) cells.push({ row, col, width })
      }
    }
    return { text, cells }
  }

  private decorateSpan(
    cells: CellRef[],
    start: number,
    stop: number,
    rule: CompiledRule,
    settledBefore: number
  ): void {
    let row = -1
    let x = 0
    let right = 0
    const flush = (): void => {
      if (row >= 0) this.decorate(row, x, right - x, rule, settledBefore)
    }
    for (let i = start; i < stop; i++) {
      const c = cells[i]
      if (!c) continue
      if (c.row !== row) {
        flush()
        row = c.row
        x = c.col
        right = c.col + c.width
      }
      right = Math.max(right, c.col + c.width)
    }
    flush()
  }

  private marker(line: number): ReturnType<Terminal['registerMarker']> | undefined {
    const buf = this.term.buffer.active
    return this.term.registerMarker(line - (buf.baseY + buf.cursorY))
  }

  private decorate(
    row: number,
    x: number,
    width: number,
    rule: CompiledRule,
    settledBefore: number
  ): void {
    if (width <= 0) return
    const marker = this.marker(row)
    if (!marker) return
    const deco = this.term.registerDecoration({
      marker,
      x,
      width,
      backgroundColor: rule.bg,
      foregroundColor: rule.fg,
      layer: 'bottom'
    })
    if (!deco) {
      marker.dispose()
      return
    }
    deco.onDispose(() => marker.dispose())
    if (row < settledBefore) this.settled.push(deco)
    else this.page.push(deco)
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.clearAll()
    for (const d of this.disposables) d.dispose()
  }
}

import type { IBufferCell, IDecoration, IDisposable, IMarker, Terminal } from '@xterm/xterm'
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

/** Vurgu içeren bir mantıksal satırın (sarılan satırlarıyla birlikte) süslemeleri. */
interface LineDecorations {
  /** Mantıksal satırın ilk satırına bağlı işaretçi; satır kaydıkça konumu güncellenir. */
  marker: IMarker
  /** Tarandığı andaki metni: etkin sayfada satır değişmemişse süslemeler yeniden kurulmaz. */
  text: string
  /** Satırın her parçasının işaretçisi (ilk satırınki dahil); süslemeler bunlara bağlıdır. */
  rowMarkers: IMarker[]
  decorations: IDecoration[]
}

const SCAN_DELAY_MS = 40
/** Bu uzunluğu aşan mantıksal satırlar (ör. tek satırlık dev JSON) taranmaz. */
const MAX_LINE_LENGTH = 8000

/**
 * Vurgu kurallarını terminal arabelleğine xterm süslemeleri (decoration) olarak uygular; terminale giden veri
 * değiştirilmez. Yalnız görünen alan ile bir ekran üstü ve altı süslenir: xterm her işaretçi için arabellek kırpma
 * dinleyicisi tuttuğundan tüm geçmişi süslemek, geri kaydırma doluyken her yeni satırda binlerce dinleyici çalıştırır.
 * Kaydırma geçmişindeki satırlar değişmediği için bir kez taranır; etkin sayfadaki satırlar (programlar yeniden
 * yazabilir) her taramada metinleri karşılaştırılarak yenilenir. Tam ekran programlarda (alternatif ekran) görünen ekran
 * aynı yolla taranır. Kurallar, boyut ya da ekran değişince her şey yeniden kurulur.
 */
export class HighlightDecorator {
  private rules: CompiledRule[] = []
  /** Süslenmiş mantıksal satırlar (geçmiş ve etkin sayfa). */
  private lines: LineDecorations[] = []
  /** Kaydırma geçmişinde taranmış aralığın ilk ve son satırı (mantıksal satır sınırlarında). */
  private scannedFrom: IMarker | null = null
  private scannedTo: IMarker | null = null
  /** Önceki taramada etkin sayfanın ilk satırı; o zamandan beri geçmişe kayan satırlar yeniden denetlenir. */
  private pageTop: IMarker | null = null
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
      term.onScroll(() => this.schedule()),
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

  private disposeLine(line: LineDecorations): void {
    for (const d of line.decorations) d.dispose()
    for (const m of line.rowMarkers) m.dispose()
  }

  private clearAll(): void {
    for (const line of this.lines) this.disposeLine(line)
    this.lines = []
    this.resetScanned()
    this.pageTop?.dispose()
    this.pageTop = null
  }

  private resetScanned(): void {
    this.scannedFrom?.dispose()
    this.scannedTo?.dispose()
    this.scannedFrom = null
    this.scannedTo = null
  }

  private scan(): void {
    const buf = this.term.buffer.active
    if (this.full || this.rules.length === 0) this.clearAll()
    this.full = false
    if (this.rules.length === 0) return

    const rows = this.term.rows
    const last = Math.min(buf.baseY + rows - 1, buf.length - 1)
    const pageStart = buf.type === 'alternate' ? buf.baseY : this.logicalStart(buf.baseY)
    // Geçmişte süslü tutulan pencere: görünen alanın bir ekran üstünden bir ekran altına (en çok sayfanın üstüne).
    let from = 0
    let to = -1
    if (buf.type === 'normal' && pageStart > 0) {
      from = this.logicalStart(Math.max(0, buf.viewportY - rows))
      to = this.logicalEnd(Math.min(pageStart - 1, buf.viewportY + 2 * rows - 1), pageStart)
    }

    // Kırpılan satırların süslemeleri xterm'de kendiliğinden silinir; pencere dışındakiler bırakılır.
    const kept: LineDecorations[] = []
    for (const line of this.lines) {
      const y = line.marker.line
      if (line.marker.isDisposed || y < 0) this.disposeLine(line)
      else if (y >= pageStart || (y >= from && y <= to)) kept.push(line)
      else this.disposeLine(line)
    }
    this.lines = kept
    const byStart = new Map<number, LineDecorations>()
    for (const line of this.lines) byStart.set(line.marker.line, line)

    // Etkin sayfa: metni değişen satırlar yeniden kurulur.
    this.refreshRange(pageStart, last, byStart)

    if (to < from) {
      this.resetScanned()
    } else {
      const scannedFrom = this.alive(this.scannedFrom)
      const scannedTo = this.alive(this.scannedTo)
      if (scannedFrom === null || scannedTo === null || scannedTo < from || scannedFrom > to) {
        this.refreshRange(from, to, byStart)
      } else {
        if (from < scannedFrom) this.refreshRange(from, scannedFrom - 1, byStart)
        if (to > scannedTo) this.refreshRange(scannedTo + 1, to, byStart)
        // Önceki taramadan beri sayfadan geçmişe kayan satırlar son hâlleriyle denetlenir.
        const previousTop = this.alive(this.pageTop)
        if (previousTop !== null && previousTop < pageStart)
          this.refreshRange(Math.max(from, previousTop), Math.min(to, pageStart - 1), byStart)
      }
      this.resetScanned()
      this.scannedFrom = this.marker(from) ?? null
      this.scannedTo = this.marker(to) ?? null
    }
    this.pageTop?.dispose()
    this.pageTop = buf.type === 'normal' ? (this.marker(pageStart) ?? null) : null
  }

  private alive(marker: IMarker | null): number | null {
    return marker && !marker.isDisposed && marker.line >= 0 ? marker.line : null
  }

  /** Satırın ait olduğu mantıksal satırın ilk satırı. */
  private logicalStart(y: number): number {
    const buf = this.term.buffer.active
    while (y > 0 && buf.getLine(y)?.isWrapped) y--
    return y
  }

  /** Satırın ait olduğu mantıksal satırın son satırı (`limit`ten önce). */
  private logicalEnd(y: number, limit: number): number {
    const buf = this.term.buffer.active
    while (y + 1 < limit && buf.getLine(y + 1)?.isWrapped) y++
    return y
  }

  /** Aralıktaki mantıksal satırları tarar; metni değişmemiş süslü satırlar olduğu gibi kalır. */
  private refreshRange(from: number, to: number, byStart: Map<number, LineDecorations>): void {
    const buf = this.term.buffer.active
    const end = Math.min(to, buf.length - 1)
    let y = this.logicalStart(Math.max(0, from))
    while (y <= end) {
      const rows = [y]
      let next = y + 1
      while (next < buf.length && buf.getLine(next)?.isWrapped) rows.push(next++)
      this.refreshLogical(rows, byStart)
      y = next
    }
  }

  private refreshLogical(rows: number[], byStart: Map<number, LineDecorations>): void {
    const buf = this.term.buffer.active
    let quick = ''
    for (let i = 0; i < rows.length; i++)
      quick += buf.getLine(rows[i])?.translateToString(i === rows.length - 1) ?? ''
    const existing = byStart.get(rows[0])
    if (existing && existing.text === quick) return
    if (existing) {
      this.disposeLine(existing)
      this.lines.splice(this.lines.indexOf(existing), 1)
      byStart.delete(rows[0])
    }
    if (!quick.trim() || quick.length > MAX_LINE_LENGTH) return
    if (!this.rules.some((r) => this.test(r.re, quick))) return

    const { text, cells } = this.readCells(rows)
    const taken = new Uint8Array(text.length)
    const markers = new Map<number, IMarker>()
    const decorations: IDecoration[] = []
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
        this.decorateSpan(cells, start, stop, rule, markers, decorations)
      }
    }
    const first = markers.get(rows[0]) ?? this.marker(rows[0])
    if (!first) {
      for (const d of decorations) d.dispose()
      for (const mk of markers.values()) mk.dispose()
      return
    }
    markers.set(rows[0], first)
    const line: LineDecorations = {
      marker: first,
      text: quick,
      rowMarkers: [...markers.values()],
      decorations
    }
    this.lines.push(line)
    byStart.set(rows[0], line)
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
    markers: Map<number, IMarker>,
    decorations: IDecoration[]
  ): void {
    let row = -1
    let x = 0
    let right = 0
    const flush = (): void => {
      if (row >= 0) this.decorate(row, x, right - x, rule, markers, decorations)
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

  private marker(line: number): IMarker | undefined {
    const buf = this.term.buffer.active
    return this.term.registerMarker(line - (buf.baseY + buf.cursorY))
  }

  /** Aynı satırdaki süslemeler tek işaretçiyi paylaşır. */
  private decorate(
    row: number,
    x: number,
    width: number,
    rule: CompiledRule,
    markers: Map<number, IMarker>,
    decorations: IDecoration[]
  ): void {
    if (width <= 0) return
    let marker = markers.get(row)
    if (!marker) {
      marker = this.marker(row)
      if (!marker) return
      markers.set(row, marker)
    }
    const deco = this.term.registerDecoration({
      marker,
      x,
      width,
      backgroundColor: rule.bg,
      foregroundColor: rule.fg,
      layer: 'bottom'
    })
    if (deco) decorations.push(deco)
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.clearAll()
    for (const d of this.disposables) d.dispose()
  }
}

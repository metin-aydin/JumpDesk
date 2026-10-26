/**
 * zsh'nin artımlı geçmiş araması (`history-incremental-search-backward`, Ctrl+R) gibi çalışan arama: eşleşen komut
 * komut satırına yazılır, imleç eşleşmenin başında durur; arama satırı ("bck-i-search: …_") komut satırının altında
 * gösterilir. Her adım (yazılan karakter, Ctrl+R/Ctrl+S) yığına eklenir; geri silme bir önceki adıma döner, tümü
 * silinince başlangıçtaki satıra ve boş aramaya dönülür. Geçmişteki her komut en yeni hâliyle bir kez aranır;
 * başlangıçtaki satırla aynı olan komut atlanır.
 */

export type SearchDirection = 'backward' | 'forward'

interface SearchStep {
  query: string
  /** Gösterilen girdi: geçmişteki sırası; `history.length` başlangıçtaki komut satırıdır. */
  entry: number
  /** Eşleşmenin girdideki başlangıcı (eşleşme yoksa son bulunanın; başlangıçta imleç). */
  pos: number
  failing: boolean
  direction: SearchDirection
}

export class HistorySearch {
  private readonly steps: SearchStep[]
  /** Eskiden yeniye, yinelenmeyen komutlar. */
  private readonly history: string[]

  constructor(
    history: readonly string[],
    private readonly original: { text: string; cursor: number },
    /** Önceki aramanın metni; boş aramada Ctrl+R onu yeniden arar. */
    private readonly previousQuery = ''
  ) {
    const seen = new Set([original.text])
    const newestFirst: string[] = []
    for (let i = history.length - 1; i >= 0; i--) {
      if (seen.has(history[i])) continue
      seen.add(history[i])
      newestFirst.push(history[i])
    }
    this.history = newestFirst.reverse()
    this.steps = [
      {
        query: '',
        entry: this.history.length,
        pos: original.cursor,
        failing: false,
        direction: 'backward'
      }
    ]
  }

  private get top(): SearchStep {
    return this.steps[this.steps.length - 1]
  }

  private textOf(entry: number): string {
    return entry === this.history.length ? this.original.text : (this.history[entry] ?? '')
  }

  get query(): string {
    return this.top.query
  }

  /** Komut satırında gösterilecek metin ve imleç konumu. */
  get line(): { text: string; cursor: number } {
    return { text: this.textOf(this.top.entry), cursor: this.top.pos }
  }

  /** Komut satırında altı çizilecek eşleşme (`line.text` içinde). */
  get mark(): { start: number; end: number } | null {
    const { query, pos, failing } = this.top
    return query && !failing ? { start: pos, end: pos + query.length } : null
  }

  /** zsh'deki gibi arama satırı: "bck-i-search: abc_", eşleşme yoksa başında "failing". */
  get status(): string {
    const { failing, direction, query } = this.top
    return `${failing ? 'failing ' : ''}${direction === 'backward' ? 'bck' : 'fwd'}-i-search: ${query}_`
  }

  /** Aramaya karakter ekler; eşleşme önce gösterilen konumda, sonra arama yönündeki girdilerde aranır. */
  type(chars: string): void {
    for (const ch of chars) {
      const top = this.top
      const query = top.query + ch
      const found = top.failing ? null : this.find(query, top.entry, top.pos, top.direction)
      this.push(query, top.direction, found)
    }
  }

  /** Aynı aramanın bir sonraki eşleşmesi (Ctrl+R geriye, Ctrl+S ileriye). Yapılacak bir şey yoksa false. */
  next(direction: SearchDirection): boolean {
    const top = this.top
    if (!top.query) {
      if (!this.previousQuery) return false
      this.push(
        this.previousQuery,
        direction,
        this.find(this.previousQuery, top.entry, top.pos, direction)
      )
      return true
    }
    if (top.failing && top.direction === direction) return false
    const from = direction === 'backward' ? top.pos - 1 : top.pos + 1
    this.push(top.query, direction, this.find(top.query, top.entry, from, direction))
    return true
  }

  /** Aramayı bırakır: komut satırı başlangıçtaki hâline döner (Ctrl+G). */
  cancel(): void {
    this.steps.length = 1
  }

  /** Bir önceki adıma döner; başlangıçtaysa false. */
  back(): boolean {
    if (this.steps.length === 1) return false
    this.steps.pop()
    return true
  }

  private push(
    query: string,
    direction: SearchDirection,
    found: { entry: number; pos: number } | null
  ): void {
    const top = this.top
    this.steps.push(
      found
        ? { query, direction, failing: false, ...found }
        : { query, direction, failing: true, entry: top.entry, pos: top.pos }
    )
  }

  /** `entry` girdisinde `from` konumundan (dahil) arama yönünde, sonra yön boyunca diğer girdilerde arar. */
  private find(
    query: string,
    entry: number,
    from: number,
    direction: SearchDirection
  ): { entry: number; pos: number } | null {
    const step = direction === 'backward' ? -1 : 1
    for (let e = entry; e >= 0 && e <= this.history.length; e += step) {
      const text = this.textOf(e)
      let pos: number
      if (e === entry) {
        if (from < 0) continue
        pos = direction === 'backward' ? text.lastIndexOf(query, from) : text.indexOf(query, from)
      } else {
        pos = direction === 'backward' ? text.lastIndexOf(query) : text.indexOf(query)
      }
      if (pos >= 0) return { entry: e, pos }
    }
    return null
  }
}

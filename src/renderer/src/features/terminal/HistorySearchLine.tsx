import type { GhostAnchor } from './GhostText'

export interface HistorySearchView {
  anchor: GhostAnchor
  /** Arama satırının görünümdeki satırı (komut satırının altı). */
  row: number
  /** "bck-i-search: abc_" */
  text: string
  /** Komut satırında eşleşen hücreler (görünümdeki sütun/satır, genişlik hücre sayısı). */
  underline: { x: number; y: number; w: number }[]
}

/**
 * Ctrl+R geçmiş aramasının satırı: komut satırının altında, terminal hücrelerine oturan metin (zsh'deki gibi).
 * Terminal tamponuna yazılmaz; kabuk komut satırını yeniden çizse de bozulmaz. Eşleşen kısmın altı çizilir.
 */
export function HistorySearchLine({
  view,
  color,
  background
}: {
  view: HistorySearchView
  color: string
  background: string
}): React.JSX.Element {
  const { anchor, row } = view
  const { cellWidth: w, cellHeight: h } = anchor
  const chars = [...view.text].slice(0, anchor.cols)
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-[1] overflow-hidden"
      style={{
        left: anchor.left,
        top: anchor.top,
        width: anchor.cols * w,
        height: anchor.rows * h
      }}
    >
      <div
        data-history-search={view.text}
        data-row={row}
        className="absolute flex whitespace-pre"
        style={{
          left: 0,
          top: row * h,
          width: anchor.cols * w,
          height: h,
          background,
          color,
          fontFamily: anchor.fontFamily,
          fontSize: anchor.fontSize,
          lineHeight: `${h}px`
        }}
      >
        {chars.map((ch, k) => (
          <span key={k} className="flex-none" style={{ width: w }}>
            {ch}
          </span>
        ))}
      </div>
      {view.underline.map((u) => (
        <div
          key={`${u.x},${u.y}`}
          data-history-search-mark
          className="absolute"
          style={{
            left: u.x * w,
            top: (u.y + 1) * h - Math.max(1, Math.round(h / 14)) - 1,
            width: u.w * w,
            height: Math.max(1, Math.round(h / 14)),
            background: color
          }}
        />
      ))}
    </div>
  )
}

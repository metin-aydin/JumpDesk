/** İmlecin terminal ekranındaki hücresi ve ekranın terminal kabına göre konumu (CSS piksel). */
export interface GhostAnchor {
  left: number
  top: number
  cellWidth: number
  cellHeight: number
  cols: number
  rows: number
  /** İmlecin görünümdeki sütunu ve satırı. */
  x: number
  y: number
  fontFamily: string
  fontSize: number
}

/**
 * Seçili önerinin henüz yazılmamış kısmı, komut satırında imleçten başlayarak soluk çizilir (Tab ya da → ile kabul
 * edilince yazılacak metin). Her karakter bir hücreye oturur; satır sonunda alt satıra geçer, ekranın altında kesilir.
 * Metin terminal tamponuna yazılmaz, yalnız üstüne bindirilir.
 */
export function GhostText({
  text,
  anchor,
  color
}: {
  text: string
  anchor: GhostAnchor
  color: string
}): React.JSX.Element | null {
  const chars = [...text]
  const lines: { x: number; y: number; chars: string[] }[] = []
  let x = anchor.x
  let y = anchor.y
  let i = 0
  while (i < chars.length && y < anchor.rows) {
    if (x >= anchor.cols) {
      x = 0
      y++
      continue
    }
    const n = Math.min(anchor.cols - x, chars.length - i)
    lines.push({ x, y, chars: chars.slice(i, i + n) })
    i += n
    x += n
  }
  if (!lines.length) return null
  const { cellWidth: w, cellHeight: h } = anchor
  return (
    <div
      aria-hidden
      data-ghost-text={text}
      className="pointer-events-none absolute z-[1] overflow-hidden whitespace-pre"
      style={{
        left: anchor.left,
        top: anchor.top,
        width: anchor.cols * w,
        height: anchor.rows * h,
        fontFamily: anchor.fontFamily,
        fontSize: anchor.fontSize,
        lineHeight: `${h}px`,
        color,
        opacity: 0.45
      }}
    >
      {lines.map((line) => (
        <div
          key={line.y}
          className="absolute flex"
          style={{ left: line.x * w, top: line.y * h, height: h }}
        >
          {line.chars.map((ch, k) => (
            <span key={k} className="flex-none" style={{ width: w }}>
              {ch}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

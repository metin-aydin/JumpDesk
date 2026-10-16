export type TileMode = 'vertical' | 'horizontal' | 'grid'

/** Kapsayıcıya göre yüzde cinsinden dikdörtgen. */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export type Handle =
  | { kind: 'row'; row: number; rect: Rect }
  | { kind: 'col'; row: number; before: string; after: string; rect: Rect }

export interface TileLayout {
  rows: string[][]
  rects: Map<string, Rect>
  handles: Handle[]
}

export function tileRows(ids: string[], mode: TileMode): string[][] {
  if (mode === 'vertical') return [ids]
  if (mode === 'horizontal') return ids.map((id) => [id])
  const cols = Math.ceil(Math.sqrt(ids.length))
  const rows: string[][] = []
  for (let i = 0; i < ids.length; i += cols) rows.push(ids.slice(i, i + cols))
  return rows
}

/**
 * Satır yükseklikleri `rowGrow`, satır içi genişlikler `colGrow` oranlarıyla bölünür; varsayılan oran 1 (eşit boy).
 */
export function computeTileLayout(
  ids: string[],
  mode: TileMode,
  rowGrow: Record<number, number>,
  colGrow: Record<string, number>
): TileLayout {
  const rows = tileRows(ids, mode)
  const rects = new Map<string, Rect>()
  const handles: Handle[] = []
  const rowTotal = rows.reduce((sum, _r, i) => sum + (rowGrow[i] ?? 1), 0)

  let top = 0
  rows.forEach((row, r) => {
    const height = ((rowGrow[r] ?? 1) / rowTotal) * 100
    const colTotal = row.reduce((sum, id) => sum + (colGrow[id] ?? 1), 0)
    let left = 0
    row.forEach((id, c) => {
      const width = ((colGrow[id] ?? 1) / colTotal) * 100
      rects.set(id, { left, top, width, height })
      if (c > 0)
        handles.push({
          kind: 'col',
          row: r,
          before: row[c - 1],
          after: id,
          rect: { left, top, width: 0, height }
        })
      left += width
    })
    if (r > 0) handles.push({ kind: 'row', row: r, rect: { left: 0, top, width: 100, height: 0 } })
    top += height
  })
  return { rows, rects, handles }
}

/** Yerleşim dikdörtgeninin yüzde konumlu stili. */
export const pct = (r: Rect): { left: string; top: string; width: string; height: string } => ({
  left: `${r.left}%`,
  top: `${r.top}%`,
  width: `${r.width}%`,
  height: `${r.height}%`
})

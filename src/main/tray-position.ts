export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const GAP = 6

/**
 * Tepsi açılır penceresinin konumu: simgenin altında (macOS menü çubuğu, üstteki görev çubuğu) ya da üstünde (alttaki
 * görev çubuğu), simgeye ortalı ve ekranın çalışma alanına sığdırılmış. Simge konumu bilinmiyorsa (Linux) çalışma
 * alanının sağ üst köşesi.
 */
export function popupPosition(
  tray: Rect | null,
  workArea: Rect,
  size: { width: number; height: number }
): { x: number; y: number } {
  const clampX = (x: number): number =>
    Math.round(
      Math.min(Math.max(x, workArea.x + GAP), workArea.x + workArea.width - size.width - GAP)
    )
  const clampY = (y: number): number =>
    Math.round(
      Math.min(Math.max(y, workArea.y + GAP), workArea.y + workArea.height - size.height - GAP)
    )
  if (!tray || tray.width === 0 || tray.height === 0)
    return { x: clampX(workArea.x + workArea.width - size.width), y: clampY(workArea.y) }
  const x = clampX(tray.x + tray.width / 2 - size.width / 2)
  const iconMiddle = tray.y + tray.height / 2
  const below = iconMiddle < workArea.y + workArea.height / 2
  return { x, y: clampY(below ? tray.y + tray.height + GAP : tray.y - size.height - GAP) }
}

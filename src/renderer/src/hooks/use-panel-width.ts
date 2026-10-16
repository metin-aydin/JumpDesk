import { useState } from 'react'
import { readUserItem, writeUserItem } from '@/lib/user-storage'

/**
 * Kenarından sürüklenerek boyutlandırılan panelin genişliği; bırakınca kullanıcının kayıtlarına yazılır. `edge`:
 * tutamacın panelin hangi kenarında olduğu (sol ağaçta sağ kenar, sağ panelde sol kenar).
 */
export function usePanelWidth(
  storageKey: string,
  fallback: number,
  min: number,
  max: number,
  edge: 'left' | 'right'
): { width: number; resizing: boolean; startResize: (e: React.PointerEvent) => void } {
  const clamp = (w: number): number => Math.min(max, Math.max(min, Math.round(w)))
  const [width, setWidth] = useState(() => {
    const v = Number(readUserItem(storageKey))
    return v >= min && v <= max ? v : fallback
  })
  const [resizing, setResizing] = useState(false)

  const startResize = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const sign = edge === 'right' ? 1 : -1
    const next = (x: number): number => clamp(startW + sign * (x - startX))
    const onMove = (ev: PointerEvent): void => setWidth(next(ev.clientX))
    const onUp = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      setResizing(false)
      writeUserItem(storageKey, String(next(ev.clientX)))
    }
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return { width, resizing, startResize }
}

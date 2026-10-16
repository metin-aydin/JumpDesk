import { useEffect, useLayoutEffect, useRef } from 'react'
import { placeTabHost } from './tab-hosts'

/**
 * Sekme içeriğinin kalıcı kabını kendi yerine yerleştirir. İçerik React ağacında başka yerde çizildiği için yuvaya
 * React olayı ulaşmaz; panele basınca yapılacak iş (ör. paneli etkinleştirmek) yerel dinleyiciyle yakalanır.
 */
export function HostSlot({
  tabId,
  onPointerDownCapture
}: {
  tabId: string
  onPointerDownCapture?: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const handler = useRef(onPointerDownCapture)
  useEffect(() => {
    handler.current = onPointerDownCapture
  })
  useLayoutEffect(() => {
    if (ref.current) placeTabHost(tabId, ref.current)
  }, [tabId])
  useEffect(() => {
    const slot = ref.current
    if (!slot) return
    const onDown = (): void => handler.current?.()
    slot.addEventListener('pointerdown', onDown, true)
    return () => slot.removeEventListener('pointerdown', onDown, true)
  }, [])
  return <div ref={ref} className="flex min-h-0 min-w-0 flex-1 flex-col" />
}

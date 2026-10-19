import { create } from 'zustand'

/** Alarma gidilince gruptaki diğer panellerin soluk kaldığı süre. */
export const SPOTLIGHT_MS = 2000
/** Yeni alarmda yarı saydam kırmızı katmanın gelip gitme süresi: dört kez (`animate-alarm-flash`). */
export const ALARM_FLASH_MS = 2000

interface SpotlightStore {
  /** Alarma gidilen oturum; gruptaki diğer paneller soluklaşır. Süre dolunca null. */
  tabId: string | null
  /**
   * Yeni alarm gelen oturumlar; üzerlerinde kırmızı katman gelip gider. Değer her alarmda artar (animasyon baştan
   * başlar).
   */
  flashes: Record<string, number>
}

export const useSpotlight = create<SpotlightStore>(() => ({ tabId: null, flashes: {} }))

let spotlightTimer: ReturnType<typeof setTimeout> | null = null
const flashTimers = new Map<string, ReturnType<typeof setTimeout>>()
let flashCount = 0

/** Oturumu kısa süre öne çıkarır: aynı gruptaki diğer paneller belirgin biçimde soluklaşır. */
export function spotlight(tabId: string): void {
  if (spotlightTimer) clearTimeout(spotlightTimer)
  useSpotlight.setState({ tabId })
  spotlightTimer = setTimeout(() => {
    spotlightTimer = null
    useSpotlight.setState({ tabId: null })
  }, SPOTLIGHT_MS)
}

/** Oturumun üzerindeki alarm katmanını hemen kaldırır. */
export function stopAlarmFlash(tabId: string): void {
  const timer = flashTimers.get(tabId)
  if (!timer) return
  clearTimeout(timer)
  flashTimers.delete(tabId)
  useSpotlight.setState((s) => {
    const flashes = { ...s.flashes }
    delete flashes[tabId]
    return { flashes }
  })
}

/** Yeni alarm gelen oturumun üzerinde yarı saydam kırmızı katmanı dört kez gösterir (oturum ekrandaysa görünür). */
export function flashAlarm(tabId: string): void {
  const previous = flashTimers.get(tabId)
  if (previous) clearTimeout(previous)
  flashCount += 1
  useSpotlight.setState((s) => ({ flashes: { ...s.flashes, [tabId]: flashCount } }))
  flashTimers.set(
    tabId,
    setTimeout(() => {
      flashTimers.delete(tabId)
      useSpotlight.setState((s) => {
        const flashes = { ...s.flashes }
        delete flashes[tabId]
        return { flashes }
      })
    }, ALARM_FLASH_MS)
  )
}

import { createContext, useContext } from 'react'

/**
 * Açılır menü, ipucu ve pencerelerin çizileceği kap. Ayrı penceredeki içerik bu bağlamla o pencerenin gövdesini
 * verir; verilmezse ana pencerenin gövdesi kullanılır.
 */
export const PortalContainerContext = createContext<HTMLElement | undefined>(undefined)

export const usePortalContainer = (): HTMLElement | undefined => useContext(PortalContainerContext)

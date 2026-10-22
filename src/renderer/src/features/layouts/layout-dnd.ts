import { useState } from 'react'
import { create } from 'zustand'
import { useLayouts, type SavedLayout } from '@/stores/layouts'

/** Sürüklenen düzenin kimliğini taşıyan veri türü (ana ekrandaki kartlar ve sol ağaçtaki satırlar). */
const DRAG_TYPE = 'application/x-jumpdesk-layout'

/** Sürüklenmekte olan düzen; klasördeki düzen sürüklenirken klasör dışına bırakma alanı gösterilir. */
export const useLayoutDrag = create<{ dragging: SavedLayout | null }>(() => ({ dragging: null }))

const draggedLayout = (e: React.DragEvent): string | null =>
  e.dataTransfer.types.includes(DRAG_TYPE) ? e.dataTransfer.getData(DRAG_TYPE) || '' : null

/** Sürüklenebilir düzen öğesinin olayları. */
export function layoutDragProps(
  layout: SavedLayout
): Pick<React.HTMLAttributes<HTMLElement>, 'draggable' | 'onDragStart' | 'onDragEnd'> {
  return {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData(DRAG_TYPE, layout.id)
      e.dataTransfer.effectAllowed = 'move'
      useLayoutDrag.setState({ dragging: layout })
    },
    onDragEnd: () => useLayoutDrag.setState({ dragging: null })
  }
}

/**
 * Düzen bırakılabilen alan: bırakılan düzen verilen klasöre taşınır (`null` klasörden çıkarır). Üzerine gelince `over`
 * olur; iç içe alanlarda en içteki alan olayı alır.
 */
export function useDropTarget(folder: string | null): {
  over: boolean
  props: Pick<React.HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'>
} {
  const [over, setOver] = useState(false)
  return {
    over,
    props: {
      onDragOver: (e) => {
        if (draggedLayout(e) === null) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      },
      onDrop: (e) => {
        const id = draggedLayout(e)
        setOver(false)
        if (!id) return
        e.preventDefault()
        e.stopPropagation()
        useLayouts.getState().moveToFolder(id, folder)
        useLayoutDrag.setState({ dragging: null })
      }
    }
  }
}

'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

interface ContextMenuPosition {
  x: number
  y: number
}

interface ContextMenuSize {
  width: number
  height: number
}

interface UseContextMenuOptions extends ContextMenuSize {
  offset?: number
  closeOnScroll?: boolean
}

type ContextMenuEvent = Pick<MouseEvent, 'clientX' | 'clientY' | 'preventDefault' | 'stopPropagation'> | ReactMouseEvent

export function clampContextMenuPosition(
  x: number,
  y: number,
  { width, height }: ContextMenuSize,
  offset = 12
): ContextMenuPosition {
  if (typeof window === 'undefined') {
    return { x, y }
  }

  return {
    x: Math.max(offset, Math.min(x, window.innerWidth - width - offset)),
    y: Math.max(offset, Math.min(y, window.innerHeight - height - offset)),
  }
}

export function useContextMenu<T extends object>({
  width,
  height,
  offset = 12,
  closeOnScroll = true,
}: UseContextMenuOptions): {
  menu: (T & ContextMenuPosition) | null
  menuRef: RefObject<HTMLDivElement>
  closeMenu: () => void
  openMenuAt: (payload: T, x: number, y: number, sizeOverride?: Partial<ContextMenuSize>) => void
  openMenuFromEvent: (event: ContextMenuEvent, payload: T, sizeOverride?: Partial<ContextMenuSize>) => void
  setMenu: Dispatch<SetStateAction<(T & ContextMenuPosition) | null>>
} {
  const menuRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<(T & ContextMenuPosition) | null>(null)

  const closeMenu = useCallback(() => {
    setMenu(null)
  }, [])

  const openMenuAt = useCallback((
    payload: T,
    x: number,
    y: number,
    sizeOverride?: Partial<ContextMenuSize>
  ) => {
    const nextSize = {
      width: sizeOverride?.width ?? width,
      height: sizeOverride?.height ?? height,
    }
    const position = clampContextMenuPosition(x, y, nextSize, offset)
    setMenu({
      ...payload,
      ...position,
    })
  }, [height, offset, width])

  const openMenuFromEvent = useCallback((
    event: ContextMenuEvent,
    payload: T,
    sizeOverride?: Partial<ContextMenuSize>
  ) => {
    event.preventDefault()
    event.stopPropagation()
    openMenuAt(payload, event.clientX, event.clientY, sizeOverride)
  }, [openMenuAt])

  useEffect(() => {
    if (!menu) return

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      closeMenu()
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    const handleWindowChange = () => {
      closeMenu()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', handleWindowChange)

    if (closeOnScroll) {
      window.addEventListener('scroll', handleWindowChange, true)
    }

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', handleWindowChange)

      if (closeOnScroll) {
        window.removeEventListener('scroll', handleWindowChange, true)
      }
    }
  }, [closeMenu, closeOnScroll, menu])

  return {
    menu,
    menuRef,
    closeMenu,
    openMenuAt,
    openMenuFromEvent,
    setMenu,
  }
}

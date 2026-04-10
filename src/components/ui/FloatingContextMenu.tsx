'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import type { ReactNode, RefObject } from 'react'

interface FloatingContextMenuProps {
  open: boolean
  x: number
  y: number
  menuRef: RefObject<HTMLDivElement>
  className: string
  children: ReactNode
}

export function FloatingContextMenu({
  open,
  x,
  y,
  menuRef,
  className,
  children,
}: FloatingContextMenuProps) {
  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          className={className}
          style={{ left: x, top: y }}
          initial={{ opacity: 0, scale: 0.96, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -4 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

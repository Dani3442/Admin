'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InfoPopoverProps {
  label?: string
  title?: string
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}

export function InfoPopover({
  label = 'Показать подсказку',
  title,
  children,
  align = 'left',
  className,
}: InfoPopoverProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition',
          'hover:border-slate-300 hover:text-slate-600 hover:bg-slate-50'
        )}
      >
        <Info className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'absolute top-10 z-40 w-[320px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl',
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            {title && <div className="mb-2 text-sm font-semibold text-slate-800">{title}</div>}
            <div className="space-y-2 text-sm text-slate-600">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

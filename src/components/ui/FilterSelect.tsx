'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterSelectOption {
  value: string
  label: string
}

interface FilterSelectProps {
  value: string
  onChange: (value: string) => void
  options: FilterSelectOption[]
  placeholder: string
  className?: string
  triggerClassName?: string
  panelClassName?: string
}

export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  triggerClassName,
  panelClassName,
}: FilterSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const openedAtRef = useRef(0)
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 240 })

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  )

  const syncPosition = useCallback(() => {
    const element = containerRef.current
    if (!element) return

    const rect = element.getBoundingClientRect()
    setPosition({
      top: rect.bottom + 8,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 260) - 12)),
      width: Math.max(rect.width, 240),
    })
  }, [])

  const openSelect = useCallback(() => {
    openedAtRef.current = Date.now()
    syncPosition()
    setIsOpen(true)
  }, [syncPosition])

  useEffect(() => {
    if (!isOpen) return

    const handleWindowChange = () => syncPosition()
    const handlePointerDown = (event: PointerEvent) => {
      if (Date.now() - openedAtRef.current < 120) return

      const target = event.target as Node
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }

      setIsOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    window.addEventListener('resize', handleWindowChange)
    window.addEventListener('scroll', handleWindowChange, true)
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('resize', handleWindowChange)
      window.removeEventListener('scroll', handleWindowChange, true)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, syncPosition])

  const panel = isOpen
    ? createPortal(
        <div
          ref={panelRef}
          onPointerDown={(event) => event.stopPropagation()}
          className={cn(
            'fixed z-[85] overflow-hidden rounded-[22px] border border-slate-200 bg-white p-2 shadow-[0_22px_60px_-32px_rgba(15,23,42,0.45)]',
            panelClassName
          )}
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <div className="max-h-72 overflow-y-auto pr-1">
            {options.map((option) => {
              const active = option.value === value

              return (
                <button
                  key={option.value || '__empty'}
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  <Check className={cn('h-4 w-4 flex-shrink-0 transition-opacity', active ? 'opacity-100' : 'opacity-0')} />
                </button>
              )
            })}
          </div>
        </div>,
        document.body
      )
    : null

  return (
    <>
      <div ref={containerRef} className={cn('relative', className)}>
        <button
          type="button"
          onClick={() => (isOpen ? setIsOpen(false) : openSelect())}
          className={cn(
            'flex h-11 w-full items-center justify-between gap-3 rounded-[20px] border border-slate-200 bg-white px-3.5 text-left text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50',
            isOpen && 'border-brand-300 bg-brand-50/60 ring-2 ring-brand-100',
            triggerClassName
          )}
        >
          <span className={cn('truncate', !selectedOption && 'text-slate-400')}>
            {selectedOption?.label || placeholder}
          </span>
          <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-180 text-brand-600')} />
        </button>
      </div>
      {panel}
    </>
  )
}

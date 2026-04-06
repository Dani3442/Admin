'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  setMonth,
  setYear,
} from 'date-fns'
import { ru } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn, formatDateInputValue, parseDateInputValue } from '@/lib/utils'

interface DatePickerProps {
  value: Date | null
  onChange: (date: Date | null) => void
  onCommit?: (date: Date | null) => void
  onCancel?: () => void
  autoFocus?: boolean
  placeholder?: string
  inputClassName?: string
  panelClassName?: string
  showTriggerButton?: boolean
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, monthIndex) => ({
  value: monthIndex,
  label: format(new Date(2026, monthIndex, 1), 'LLLL', { locale: ru }),
}))

export function DatePicker({
  value,
  onChange,
  onCommit,
  onCancel,
  autoFocus = false,
  placeholder = 'ДД.ММ.ГГГГ',
  inputClassName,
  panelClassName,
  showTriggerButton = true,
}: DatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const openedAtRef = useRef(0)

  const initialDate = value ? new Date(value) : new Date()
  const today = new Date()
  const [displayValue, setDisplayValue] = useState(formatDateInputValue(value))
  const [viewDate, setViewDate] = useState(initialDate)
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320 })

  useEffect(() => {
    setDisplayValue(formatDateInputValue(value))
    if (value) setViewDate(new Date(value))
  }, [value])

  const yearOptions = useMemo(() => {
    const centerYear = value?.getFullYear() ?? viewDate.getFullYear()
    return Array.from({ length: 41 }, (_, index) => centerYear - 20 + index)
  }, [value, viewDate])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [viewDate])

  const syncPosition = useCallback(() => {
    const element = containerRef.current
    if (!element) return

    const rect = element.getBoundingClientRect()
    setPosition({
      top: rect.bottom + 8,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 316)),
      width: Math.max(rect.width, 240),
    })
  }, [])

  const openCalendar = useCallback(() => {
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
      if (
        containerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return
      }
      setIsOpen(false)
    }

    window.addEventListener('resize', handleWindowChange)
    window.addEventListener('scroll', handleWindowChange, true)
    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('resize', handleWindowChange)
      window.removeEventListener('scroll', handleWindowChange, true)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isOpen, syncPosition])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const applyDate = useCallback((nextDate: Date | null, shouldCommit = false) => {
    onChange(nextDate)
    setDisplayValue(formatDateInputValue(nextDate))
    if (nextDate) setViewDate(new Date(nextDate))

    if (shouldCommit) {
      onCommit?.(nextDate)
      setIsOpen(false)
    }
  }, [onChange, onCommit])

  const commitInput = useCallback(() => {
    const parsed = parseDateInputValue(displayValue)

    if (!displayValue.trim()) {
      applyDate(null, true)
      return
    }

    if (parsed) {
      applyDate(parsed, true)
      return
    }

    setDisplayValue(formatDateInputValue(value))
    setIsOpen(false)
  }, [applyDate, displayValue, value])

  const cancelEditing = useCallback(() => {
    setDisplayValue(formatDateInputValue(value))
    setIsOpen(false)
    onCancel?.()
  }, [onCancel, value])

  const calendar = isOpen ? createPortal(
    <div
      ref={panelRef}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        'fixed z-[80] rounded-xl border border-slate-200 bg-white p-3 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.45)]',
        panelClassName
      )}
      style={{ top: position.top, left: position.left, width: Math.max(position.width, 308) }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setViewDate((current) => addMonths(current, -1))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex flex-1 items-center gap-2">
          <select
            value={viewDate.getMonth()}
            onChange={(event) => setViewDate((current) => setMonth(current, Number(event.target.value)))}
            className="h-9 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-brand-400 focus:bg-white"
          >
            {MONTH_OPTIONS.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          <select
            value={viewDate.getFullYear()}
            onChange={(event) => setViewDate((current) => setYear(current, Number(event.target.value)))}
            className="h-9 w-24 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-brand-400 focus:bg-white"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setViewDate((current) => addMonths(current, 1))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((weekday) => (
          <div key={weekday} className="py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isSelected = value ? isSameDay(day, value) : false
          const isToday = isSameDay(day, today)
          const isCurrentMonth = isSameMonth(day, viewDate)

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => applyDate(day, true)}
              title={isToday ? 'Сегодня' : undefined}
              className={cn(
                'h-9 rounded-lg text-sm font-semibold transition-colors',
                isSelected && 'bg-brand-600 text-white shadow-sm',
                !isSelected && isToday && 'border border-brand-200 bg-brand-50 text-brand-700',
                !isSelected && isCurrentMonth && 'text-slate-700 hover:bg-brand-50 hover:text-brand-700',
                !isCurrentMonth && 'text-slate-300 hover:bg-slate-50'
              )}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => applyDate(new Date(), true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          Сегодня
        </button>
        <button
          type="button"
          onClick={() => applyDate(null, true)}
          className="inline-flex items-center gap-2 rounded-lg border border-red-100 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
        >
          <X className="h-3.5 w-3.5" />
          Очистить
        </button>
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      <div ref={containerRef} className="relative">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={displayValue}
            placeholder={placeholder}
            onPointerDown={(event) => event.stopPropagation()}
            onFocus={openCalendar}
            onClick={openCalendar}
            onChange={(event) => setDisplayValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitInput()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                cancelEditing()
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                openCalendar()
              }
            }}
            className={cn(
              'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100',
              inputClassName
            )}
          />
          {showTriggerButton && (
            <button
              type="button"
              onClick={() => (isOpen ? commitInput() : openCalendar())}
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            >
              <CalendarDays className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {calendar}
    </>
  )
}

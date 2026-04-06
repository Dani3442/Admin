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
}: DatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const initialDate = value ? new Date(value) : new Date()
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
      top: rect.bottom + 10,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 344)),
      width: Math.max(rect.width, 280),
    })
  }, [])

  const openCalendar = useCallback(() => {
    syncPosition()
    setIsOpen(true)
  }, [syncPosition])

  useEffect(() => {
    if (!isOpen) return

    const handleWindowChange = () => syncPosition()
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        containerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return
      }
      commitInput()
    }

    window.addEventListener('resize', handleWindowChange)
    window.addEventListener('scroll', handleWindowChange, true)
    document.addEventListener('mousedown', handlePointerDown)

    return () => {
      window.removeEventListener('resize', handleWindowChange)
      window.removeEventListener('scroll', handleWindowChange, true)
      document.removeEventListener('mousedown', handlePointerDown)
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
      className={cn(
        'fixed z-[80] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)]',
        panelClassName
      )}
      style={{ top: position.top, left: position.left, width: Math.max(position.width, 336) }}
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <button
          type="button"
          onClick={() => setViewDate((current) => addMonths(current, -1))}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex flex-1 items-center gap-2">
          <select
            value={viewDate.getMonth()}
            onChange={(event) => setViewDate((current) => setMonth(current, Number(event.target.value)))}
            className="h-10 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-brand-400 focus:bg-white"
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
            className="h-10 w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-brand-400 focus:bg-white"
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
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((weekday) => (
          <div key={weekday} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isSelected = value ? isSameDay(day, value) : false
          const isCurrentMonth = isSameMonth(day, viewDate)

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => applyDate(day, true)}
              className={cn(
                'h-11 rounded-xl text-sm font-semibold transition-colors',
                isSelected && 'bg-brand-600 text-white shadow-sm',
                !isSelected && isCurrentMonth && 'text-slate-700 hover:bg-brand-50 hover:text-brand-700',
                !isCurrentMonth && 'text-slate-300 hover:bg-slate-50'
              )}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => applyDate(new Date(), true)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <CalendarDays className="h-4 w-4" />
          Сегодня
        </button>
        <button
          type="button"
          onClick={() => applyDate(null, true)}
          className="inline-flex items-center gap-2 rounded-xl border border-red-100 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          <X className="h-4 w-4" />
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
              'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100',
              inputClassName
            )}
          />
          <button
            type="button"
            onClick={() => (isOpen ? commitInput() : openCalendar())}
            className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        </div>
      </div>
      {calendar}
    </>
  )
}

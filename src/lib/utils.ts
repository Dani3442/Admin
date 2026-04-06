import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays, isAfter, isBefore, addDays, parse, isValid, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { ProductStatus, Priority } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  try {
    return format(new Date(date), 'dd.MM.yyyy', { locale: ru })
  } catch {
    return '—'
  }
}

export function formatDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return ''
  try {
    return format(new Date(date), 'dd.MM.yyyy', { locale: ru })
  } catch {
    return ''
  }
}

export function parseDateInputValue(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const normalized = trimmed.replace(/\//g, '.').replace(/-/g, '.')
  const formats = ['dd.MM.yyyy', 'd.M.yyyy', 'yyyy.MM.dd']

  for (const pattern of formats) {
    const parsed = parse(normalized, pattern, new Date())
    if (isValid(parsed)) return parsed
  }

  return null
}

export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return '—'
  try {
    return format(new Date(date), 'dd MMM', { locale: ru })
  } catch {
    return '—'
  }
}

export function getDaysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null
  return differenceInDays(new Date(date), new Date())
}

export function isOverdue(date: Date | string | null | undefined): boolean {
  if (!date) return false
  return isBefore(new Date(date), new Date())
}

export function isAtRisk(date: Date | string | null | undefined, thresholdDays = 7): boolean {
  if (!date) return false
  const d = new Date(date)
  const now = new Date()
  return isAfter(d, now) && differenceInDays(d, now) <= thresholdDays
}

export function shiftDate(date: Date, days: number): Date {
  return addDays(date, days)
}

export function getStatusColor(status: ProductStatus | string): string {
  const map: Record<string, string> = {
    PLANNED: 'text-slate-500 bg-slate-100',
    IN_PROGRESS: 'text-blue-600 bg-blue-50',
    AT_RISK: 'text-amber-600 bg-amber-50',
    DELAYED: 'text-red-600 bg-red-50',
    COMPLETED: 'text-emerald-600 bg-emerald-50',
    CANCELLED: 'text-slate-400 bg-slate-100',
  }
  return map[status] || 'text-slate-500 bg-slate-100'
}

export function getStatusLabel(status: ProductStatus | string): string {
  const map: Record<string, string> = {
    PLANNED: 'Планируется',
    IN_PROGRESS: 'В работе',
    AT_RISK: 'Под риском',
    DELAYED: 'Задержка',
    COMPLETED: 'Завершён',
    CANCELLED: 'Отменён',
  }
  return map[status] || status
}

export function getPriorityColor(priority: Priority | string): string {
  const map: Record<string, string> = {
    CRITICAL: 'text-red-600 bg-red-50 border-red-200',
    HIGH: 'text-orange-600 bg-orange-50 border-orange-200',
    MEDIUM: 'text-blue-600 bg-blue-50 border-blue-200',
    LOW: 'text-slate-500 bg-slate-50 border-slate-200',
  }
  return map[priority] || 'text-slate-500 bg-slate-50'
}

export function getPriorityLabel(priority: Priority | string): string {
  const map: Record<string, string> = {
    CRITICAL: 'Критичный',
    HIGH: 'Высокий',
    MEDIUM: 'Средний',
    LOW: 'Низкий',
  }
  return map[priority] || priority
}

export function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    ADMIN: 'Администратор',
    DIRECTOR: 'Руководитель',
    PRODUCT_MANAGER: 'Менеджер продукта',
    EMPLOYEE: 'Сотрудник',
    VIEWER: 'Только просмотр',
  }
  return map[role] || role
}

export function abbreviate(name: string, maxLen = 30): string {
  return name.length > maxLen ? name.slice(0, maxLen) + '…' : name
}

/**
 * Detects date overlaps between consecutive stages.
 * Returns a Set of stage IDs that participate in overlaps.
 * An overlap occurs when stage N's dateValue > stage N+1's dateValue (by stageOrder).
 */
export function detectStageOverlaps(
  stages: Array<{ id: string; stageOrder: number; dateValue: Date | null; isCompleted: boolean }>
): { overlappingIds: Set<string>; overlaps: Array<{ fromId: string; toId: string; fromName?: string; toName?: string }> } {
  const sorted = [...stages]
    .filter((s) => s.dateValue && !s.isCompleted)
    .sort((a, b) => a.stageOrder - b.stageOrder)

  const overlappingIds = new Set<string>()
  const overlaps: Array<{ fromId: string; toId: string; fromName?: string; toName?: string }> = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i]
    const next = sorted[i + 1]
    if (curr.dateValue && next.dateValue) {
      const currDate = startOfDay(new Date(curr.dateValue))
      const nextDate = startOfDay(new Date(next.dateValue))
      if (currDate > nextDate) {
        overlappingIds.add(curr.id)
        overlappingIds.add(next.id)
        overlaps.push({
          fromId: curr.id,
          toId: next.id,
          fromName: (curr as any).stageName,
          toName: (next as any).stageName,
        })
      }
    }
  }

  return { overlappingIds, overlaps }
}

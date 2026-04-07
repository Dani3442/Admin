import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays, isAfter, isBefore, addDays, parse, isValid, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { EmployeeType, ProductStatus, Priority, VerificationStatus } from '@/types'

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

export function maskDateInputValue(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)

  if (digits.length <= 2) return day
  if (digits.length <= 4) return `${day}.${month}`
  return `${day}.${month}.${year}`
}

export function parseDateInputValue(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const normalized = trimmed.replace(/\//g, '.').replace(/-/g, '.')
  if (!/^\d{2}\.\d{2}\.\d{4}$/.test(normalized)) return null
  const formats = ['dd.MM.yyyy', 'd.M.yyyy', 'yyyy.MM.dd']

  for (const pattern of formats) {
    const parsed = parse(normalized, pattern, new Date())
    if (isValid(parsed) && format(parsed, 'dd.MM.yyyy') === normalized) return parsed
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

export function getEmployeeTypeLabel(type: EmployeeType | string): string {
  const map: Record<string, string> = {
    INTERNAL: 'Штатный сотрудник',
    CONTRACTOR: 'Подрядчик',
    PARTNER: 'Партнёр',
  }
  return map[type] || type
}

export function getVerificationStatusLabel(status: VerificationStatus | string): string {
  const map: Record<string, string> = {
    VERIFIED: 'Верифицирован',
    PENDING: 'На проверке',
    UNVERIFIED: 'Не верифицирован',
  }
  return map[status] || status
}

export function getVerificationStatusColor(status: VerificationStatus | string): string {
  const map: Record<string, string> = {
    VERIFIED: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    PENDING: 'text-amber-700 bg-amber-50 border-amber-200',
    UNVERIFIED: 'text-slate-600 bg-slate-50 border-slate-200',
  }
  return map[status] || 'text-slate-600 bg-slate-50 border-slate-200'
}

export function getAccessLevelLabel(role: string): string {
  const map: Record<string, string> = {
    ADMIN: 'Полный доступ ко всей системе',
    DIRECTOR: 'Управление бизнес-логикой и просмотр всех данных',
    PRODUCT_MANAGER: 'Операционный доступ к продуктам и этапам',
    EMPLOYEE: 'Базовый рабочий доступ',
    VIEWER: 'Только просмотр без изменений',
  }
  return map[role] || 'Доступ определяется ролью'
}

export function getUserDisplayName(user: { name?: string | null; lastName?: string | null }) {
  const parts = [user.name?.trim(), user.lastName?.trim()].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : 'Без имени'
}

export function getUserInitials(user: { name?: string | null; lastName?: string | null }) {
  const nameInitial = user.name?.trim().charAt(0) || ''
  const lastNameInitial = user.lastName?.trim().charAt(0) || ''
  const initials = `${nameInitial}${lastNameInitial}`.trim()
  return initials || 'U'
}

export function abbreviate(name: string, maxLen = 30): string {
  return name.length > maxLen ? name.slice(0, maxLen) + '…' : name
}

export interface StageOverlapIssue {
  kind: 'out_of_order' | 'same_day_cluster'
  stageIds: string[]
  fromId?: string
  toId?: string
  fromName?: string
  toName?: string
  names: string[]
  dateLabel?: string
}

export function formatStageOverlap(overlap: StageOverlapIssue) {
  if (overlap.kind === 'same_day_cluster') {
    return `Одинаковая дата у этапов: ${overlap.names.map((name) => `«${name}»`).join(', ')}`
  }

  return `Пересечение: «${overlap.fromName || 'Этап'}» → «${overlap.toName || 'Этап'}»`
}

export function detectStageOverlaps(
  stages: Array<{ id: string; stageOrder: number; dateValue: Date | null; isCompleted: boolean; stageName?: string; overlapAccepted?: boolean }>
): { overlappingIds: Set<string>; overlaps: StageOverlapIssue[] } {
  const sorted = [...stages]
    .filter((s) => s.dateValue && !s.isCompleted)
    .sort((a, b) => a.stageOrder - b.stageOrder)

  const overlappingIds = new Set<string>()
  const overlaps: StageOverlapIssue[] = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i]
    const next = sorted[i + 1]
    if (curr.dateValue && next.dateValue) {
      const currDate = startOfDay(new Date(curr.dateValue))
      const nextDate = startOfDay(new Date(next.dateValue))
      if (currDate > nextDate) {
        const isAccepted = Boolean(curr.overlapAccepted && next.overlapAccepted)
        if (isAccepted) continue

        overlappingIds.add(curr.id)
        overlappingIds.add(next.id)
        overlaps.push({
          kind: 'out_of_order',
          stageIds: [curr.id, next.id],
          fromId: curr.id,
          toId: next.id,
          fromName: curr.stageName,
          toName: next.stageName,
          names: [curr.stageName || 'Этап', next.stageName || 'Этап'],
        })
      }
    }
  }

  const dateGroups = new Map<string, typeof sorted>()
  for (const stage of sorted) {
    if (!stage.dateValue) continue
    const dateKey = format(new Date(stage.dateValue), 'yyyy-MM-dd')
    const bucket = dateGroups.get(dateKey) || []
    bucket.push(stage)
    dateGroups.set(dateKey, bucket)
  }

  for (const [dateKey, group] of dateGroups.entries()) {
    if (group.length < 3) continue
    if (group.every((stage) => stage.overlapAccepted)) continue

    for (const stage of group) {
      overlappingIds.add(stage.id)
    }

    overlaps.push({
      kind: 'same_day_cluster',
      stageIds: group.map((stage) => stage.id),
      names: group.map((stage) => stage.stageName || 'Этап'),
      dateLabel: format(new Date(dateKey), 'dd.MM.yyyy'),
    })
  }

  return { overlappingIds, overlaps }
}

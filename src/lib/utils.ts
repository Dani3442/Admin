import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, differenceInDays, isAfter, isBefore, addDays, parse, isValid } from 'date-fns'
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

export function formatDurationDays(days: number | null | undefined): string {
  if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) {
    return ''
  }

  const normalized = Math.max(1, Math.floor(days))
  const mod10 = normalized % 10
  const mod100 = normalized % 100

  if (mod10 === 1 && mod100 !== 11) {
    return `${normalized} день`
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${normalized} дня`
  }

  return `${normalized} дней`
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
    PLANNED: 'text-muted-foreground bg-muted/75 border border-border/70',
    IN_PROGRESS: 'text-blue-600 bg-blue-50 border border-blue-200 dark:text-blue-300',
    AT_RISK: 'text-amber-600 bg-amber-50 border border-amber-200 dark:text-amber-300',
    DELAYED: 'text-red-600 bg-red-50 border border-red-200 dark:text-red-300',
    COMPLETED: 'text-emerald-600 bg-emerald-50 border border-emerald-200 dark:text-emerald-300',
    CANCELLED: 'text-muted-foreground bg-muted/75 border border-border/70',
  }
  return map[status] || 'text-muted-foreground bg-muted/75 border border-border/70'
}

export function getStatusLabel(status: ProductStatus | string): string {
  const map: Record<string, string> = {
    PLANNED: 'Планируется',
    IN_PROGRESS: 'В работе',
    AT_RISK: 'Под риском',
    DELAYED: 'Задержка',
    COMPLETED: 'Выполнено',
    CANCELLED: 'Отменён',
  }
  return map[status] || status
}

export function getPriorityColor(priority: Priority | string): string {
  const map: Record<string, string> = {
    CRITICAL: 'text-red-700 bg-red-50 border border-red-200 dark:text-red-300',
    HIGH: 'text-amber-700 bg-amber-50 border border-amber-200 dark:text-amber-300',
    MEDIUM: 'text-blue-700 bg-blue-50 border border-blue-200 dark:text-blue-300',
    LOW: 'text-muted-foreground bg-muted/75 border border-border/70',
  }
  return map[priority] || 'text-muted-foreground bg-muted/75 border border-border/70'
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
    VERIFIED: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300',
    PENDING: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300',
    UNVERIFIED: 'text-muted-foreground bg-muted/75 border-border/70',
  }
  return map[status] || 'text-muted-foreground bg-muted/75 border-border/70'
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

// SQLite-compatible types (plain strings instead of Prisma enums)

export type UserRole = 'ADMIN' | 'DIRECTOR' | 'PRODUCT_MANAGER' | 'EMPLOYEE' | 'VIEWER'
export type ProductStatus = 'PLANNED' | 'IN_PROGRESS' | 'AT_RISK' | 'DELAYED' | 'COMPLETED' | 'CANCELLED'
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type StageStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'BLOCKED'
export type AutomationActionType =
  | 'SHIFT_ALL_FOLLOWING'
  | 'SHIFT_FINAL_DATE_ONLY'
  | 'MARK_AS_RISK'
  | 'RECALCULATE_BY_DURATIONS'
  | 'NOTIFY_ONLY'

export interface UserSession {
  id: string
  email: string
  name: string
  role: UserRole
}

export interface ProductWithStages {
  id: string
  name: string
  category: string | null
  sku: string | null
  country: string | null
  competitorUrl: string | null
  status: ProductStatus
  priority: Priority
  finalDate: Date | null
  responsibleId: string | null
  productTemplateId: string | null
  riskScore: number
  progressPercent: number
  notes: string | null
  sortOrder: number
  isPinned: boolean
  isFavorite: boolean
  isArchived: boolean
  createdAt: Date
  updatedAt: Date
  responsible?: { id: string; name: string; email: string } | null
  stages: ProductStageWithTemplate[]
  _count?: { comments: number }
}

export interface ProductStageWithTemplate {
  id: string
  productId: string
  stageTemplateId: string
  stageOrder: number
  stageName: string
  dateValue: Date | null
  dateRaw: string | null
  dateEnd: Date | null
  status: StageStatus
  isCompleted: boolean
  isCritical: boolean
  participatesInAutoshift: boolean
  affectsFinalDate: boolean
  responsibleId: string | null
  comment: string | null
  priority: Priority
  plannedDate: Date | null
  actualDate: Date | null
  daysDeviation: number | null
  createdAt: Date
  updatedAt: Date
  stageTemplate?: {
    id: string; name: string; order: number
    durationText: string | null; durationDays: number | null; isCritical: boolean
  }
  responsible?: { id: string; name: string } | null
}

export interface StageTemplateData {
  id: string; name: string; order: number
  durationText: string | null; durationDays: number | null
  isCritical: boolean; affectsFinalDate: boolean; participatesInAutoshift: boolean
}

export interface ProductTemplateStageData {
  id: string
  stageTemplateId: string
  stageOrder: number
  stageName: string
  plannedDate: Date | null
}

export interface ProductTemplateData {
  id: string
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  stages: ProductTemplateStageData[]
}

export interface DashboardMetrics {
  total: number; inProgress: number; completed: number
  atRisk: number; delayed: number; planned: number
  completionRate: number; avgDaysDeviation: number
  overdueCount: number; dueSoon7: number; dueSoon14: number; dueSoon30: number
}

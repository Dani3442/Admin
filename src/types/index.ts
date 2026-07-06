// SQLite-compatible types (plain strings instead of Prisma enums)

export type UserRole = 'ADMIN' | 'DIRECTOR' | 'PRODUCT_MANAGER' | 'EMPLOYEE' | 'VIEWER'
export type EmployeeType = 'INTERNAL' | 'CONTRACTOR' | 'PARTNER'
export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED'
export type ProductStatus = 'PLANNED' | 'IN_PROGRESS' | 'AT_RISK' | 'DELAYED' | 'COMPLETED' | 'CANCELLED'
export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type StageStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'BLOCKED'
export type TelegramRecipientType = 'user' | 'chat' | 'responsible'
export type TelegramEventType = 'substage_completed' | 'stage_completed' | 'stage_started'
export type StageStartTrigger = 'PRODUCT_CREATED' | 'PREVIOUS_STAGE_COMPLETED' | 'STAGE_STARTED' | 'STAGE_COMPLETED'
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
  lastName?: string | null
  role: UserRole
  avatar?: string | null
}

export interface UserProfileData {
  id: string
  email: string
  name: string
  lastName: string | null
  role: UserRole
  avatar: string | null
  jobTitle: string | null
  department: string | null
  employeeType: EmployeeType
  verificationStatus: VerificationStatus
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  _count: {
    assignedProducts: number
    comments: number
    stageAssignments: number
  }
  assignedProducts?: Array<{
    id: string
    name: string
    status: ProductStatus
    finalDate: Date | null
  }>
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
  closedAt: Date | null
  closedById: string | null
  closureComment: string | null
  archivedAt: Date | null
  archivedById: string | null
  archiveReason: string | null
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
  closedBy?: { id: string; name: string; email?: string } | null
  archivedBy?: { id: string; name: string; email?: string } | null
  stages: ProductStageWithTemplate[]
  _count?: { comments: number }
}

export interface ProductStageWithTemplate {
  id: string
  productId: string
  stageTemplateId: string
  stageOrder: number
  stageName: string
  description?: string | null
  dateValue: Date | null
  dateRaw: string | null
  dateEnd: Date | null
  durationDays?: number | null
  status: StageStatus
  isCompleted: boolean
  isCritical: boolean
  participatesInAutoshift: boolean
  affectsFinalDate: boolean
  responsibleId: string | null
  comment: string | null
  priority: Priority
  startDate?: Date | null
  endDate?: Date | null
  plannedDate: Date | null
  autoStartAt?: Date | null
  startTrigger?: StageStartTrigger
  startDelayDays?: number
  startReferenceStageOrder?: number | null
  actualDate: Date | null
  daysDeviation: number | null
  createdAt: Date
  updatedAt: Date
  stageTemplate?: {
    id: string; name: string; order: number
    durationText: string | null; durationDays: number | null; isCritical: boolean
  }
  responsible?: { id: string; name: string } | null
  subStages?: ProductSubStageData[]
  telegramNotificationSettings?: TelegramNotificationSettingData[]
}

export interface ProductSubStageData {
  id: string
  stageId: string
  name: string
  description: string | null
  responsibleId?: string | null
  status: StageStatus
  startDate: Date | null
  endDate: Date | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
  telegramNotificationSettings?: TelegramNotificationSettingData[]
}

export interface ProductTemplateSubStageData {
  id: string
  productTemplateStageId?: string
  name: string
  description: string | null
  responsibleId: string | null
  notifyOnStart: boolean
  notifyOnComplete: boolean
  telegramRecipientType?: TelegramRecipientType | null
  telegramRecipientId?: string | null
  telegramMessageTemplate?: string | null
  telegramCustomMessage?: string | null
  sortOrder: number
}

export interface TelegramRecipientData {
  id: string
  type: TelegramRecipientType
  name: string
  telegramId: string | null
  telegramUsername: string | null
  chatId: string | null
  userId?: string | null
}

export interface TelegramNotificationSettingData {
  id: string
  productId: string
  stageId: string | null
  subStageId: string | null
  templateSettingId?: string | null
  isOverride?: boolean
  eventType: TelegramEventType
  recipientType: TelegramRecipientType
  recipientId: string | null
  messageTemplate: string | null
  customMessage: string | null
  isEnabled: boolean
  sentAt: Date | null
  lastError: string | null
  recipient?: TelegramRecipientData | null
}

export interface TelegramTemplateNotificationSettingData {
  id: string
  productTemplateId: string
  productTemplateStageId: string | null
  eventType: TelegramEventType
  recipientType: TelegramRecipientType
  recipientId: string | null
  messageTemplate: string | null
  customMessage: string | null
  isEnabled: boolean
  recipient?: TelegramRecipientData | null
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
  durationDays: number | null
  stageTemplateDurationDays?: number | null
  participatesInAutoshift: boolean
  startTrigger?: StageStartTrigger
  startDelayDays?: number
  startReferenceStageOrder?: number | null
  subStages?: ProductTemplateSubStageData[]
  telegramNotificationSettings?: TelegramTemplateNotificationSettingData[]
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

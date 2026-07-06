export const STAGE_START_TRIGGERS = [
  'PRODUCT_CREATED',
  'PREVIOUS_STAGE_COMPLETED',
  'STAGE_STARTED',
  'STAGE_COMPLETED',
] as const

export type StageStartTrigger = (typeof STAGE_START_TRIGGERS)[number]

export function normalizeStageStartTrigger(value: unknown, stageOrder = 0): StageStartTrigger {
  if (typeof value === 'string' && STAGE_START_TRIGGERS.includes(value as StageStartTrigger)) {
    return value as StageStartTrigger
  }

  return stageOrder === 0 ? 'PRODUCT_CREATED' : 'PREVIOUS_STAGE_COMPLETED'
}

export function normalizeStageStartDelayDays(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return 0

  return Math.max(0, Math.floor(numberValue))
}

export function normalizeStageStartReferenceOrder(value: unknown) {
  if (value === null || value === undefined || value === '') return null

  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue < 0) return null

  return numberValue
}

export function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + normalizeStageStartDelayDays(days))
  return next
}

export function getInitialStageAutoStartAt(input: {
  productCreatedAt: Date
  stageOrder: number
  startTrigger?: unknown
  startDelayDays?: unknown
  plannedDate?: Date | null
}) {
  const trigger = normalizeStageStartTrigger(input.startTrigger, input.stageOrder)
  const delayDays = normalizeStageStartDelayDays(input.startDelayDays)

  if (input.stageOrder === 0) return input.productCreatedAt
  if (trigger === 'PRODUCT_CREATED') return addDays(input.productCreatedAt, delayDays)

  return input.plannedDate ?? null
}

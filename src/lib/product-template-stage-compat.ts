import { randomUUID } from 'crypto'
import {
  supportsProductTemplateStageAutoshiftColumn,
  supportsProductTemplateStageDurationDaysColumn,
  hasDbColumn,
} from './schema-compat'
import {
  normalizeStageStartDelayDays,
  normalizeStageStartReferenceOrder,
  normalizeStageStartTrigger,
} from './stage-start-rules'

type ProductTemplateStageCompatCreateInput = {
  productTemplateId: string
  stageTemplateId: string
  stageOrder: number
  stageName: string
  plannedDate?: Date | null
  durationDays?: number | null
  participatesInAutoshift?: boolean
  startTrigger?: string
  startDelayDays?: number | null
  startReferenceStageOrder?: number | null
}

type ProductTemplateStageDbClient = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>
}

export async function createProductTemplateStageCompat(
  db: ProductTemplateStageDbClient,
  input: ProductTemplateStageCompatCreateInput
) {
  const [hasDurationDaysColumn, hasAutoshiftColumn] = await Promise.all([
    supportsProductTemplateStageDurationDaysColumn(),
    supportsProductTemplateStageAutoshiftColumn(),
  ])
  const hasStartRulesColumns = await hasDbColumn('product_template_stages', 'startTrigger')

  const data = {
    id: randomUUID(),
    productTemplateId: input.productTemplateId,
    stageTemplateId: input.stageTemplateId,
    stageOrder: input.stageOrder,
    stageName: input.stageName,
    plannedDate: input.plannedDate ?? null,
    durationDays: input.durationDays ?? null,
    participatesInAutoshift: input.participatesInAutoshift ?? true,
    startTrigger: normalizeStageStartTrigger(input.startTrigger, input.stageOrder),
    startDelayDays: normalizeStageStartDelayDays(input.startDelayDays),
    startReferenceStageOrder: normalizeStageStartReferenceOrder(input.startReferenceStageOrder),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const columns = [
    'id',
    'productTemplateId',
    'stageTemplateId',
    'stageOrder',
    'stageName',
    'plannedDate',
    'createdAt',
    'updatedAt',
  ]

  const values: unknown[] = [
    data.id,
    data.productTemplateId,
    data.stageTemplateId,
    data.stageOrder,
    data.stageName,
    data.plannedDate,
    data.createdAt,
    data.updatedAt,
  ]

  if (hasDurationDaysColumn) {
    columns.splice(6, 0, 'durationDays')
    values.splice(6, 0, data.durationDays)
  }

  if (hasAutoshiftColumn) {
    columns.splice(hasDurationDaysColumn ? 7 : 6, 0, 'participatesInAutoshift')
    values.splice(hasDurationDaysColumn ? 7 : 6, 0, data.participatesInAutoshift)
  }

  if (hasStartRulesColumns) {
    const insertIndex = columns.indexOf('createdAt')
    columns.splice(insertIndex, 0, 'startTrigger', 'startDelayDays', 'startReferenceStageOrder')
    values.splice(insertIndex, 0, data.startTrigger, data.startDelayDays, data.startReferenceStageOrder)
  }

  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
  const quotedColumns = columns.map((column) => `"${column}"`).join(', ')

  await db.$executeRawUnsafe(
    `INSERT INTO "product_template_stages" (${quotedColumns}) VALUES (${placeholders})`,
    ...values
  )

  return data
}

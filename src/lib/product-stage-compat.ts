import { randomUUID } from 'crypto'
import {
  supportsProductStageAffectsFinalDateColumn,
  supportsProductStageAutoshiftColumn,
  supportsProductStageOverlapAcceptedColumn,
} from './schema-compat'

type ProductStageCompatCreateInput = {
  productId: string
  stageTemplateId: string
  stageOrder: number
  stageName: string
  dateValue?: Date | null
  dateRaw?: string | null
  dateEnd?: Date | null
  status?: string
  isCompleted?: boolean
  isCritical?: boolean
  participatesInAutoshift?: boolean
  affectsFinalDate?: boolean
  responsibleId?: string | null
  comment?: string | null
  priority?: string
  plannedDate?: Date | null
  actualDate?: Date | null
  daysDeviation?: number | null
  overlapAccepted?: boolean
}

type ProductStageDbClient = {
  productStage: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>
  }
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>
}

export async function createProductStageCompat(
  db: ProductStageDbClient,
  input: ProductStageCompatCreateInput
) {
  const [hasAffectsFinalDateColumn, hasAutoshiftColumn, hasOverlapAcceptedColumn] = await Promise.all([
    supportsProductStageAffectsFinalDateColumn(),
    supportsProductStageAutoshiftColumn(),
    supportsProductStageOverlapAcceptedColumn(),
  ])

  const data = {
    id: randomUUID(),
    productId: input.productId,
    stageTemplateId: input.stageTemplateId,
    stageOrder: input.stageOrder,
    stageName: input.stageName,
    dateValue: input.dateValue ?? null,
    dateRaw: input.dateRaw ?? null,
    dateEnd: input.dateEnd ?? null,
    status: input.status ?? 'NOT_STARTED',
    isCompleted: input.isCompleted ?? false,
    isCritical: input.isCritical ?? false,
    participatesInAutoshift: input.participatesInAutoshift ?? true,
    affectsFinalDate: input.affectsFinalDate ?? true,
    responsibleId: input.responsibleId ?? null,
    comment: input.comment ?? null,
    priority: input.priority ?? 'MEDIUM',
    plannedDate: input.plannedDate ?? null,
    actualDate: input.actualDate ?? null,
    daysDeviation: input.daysDeviation ?? null,
    overlapAccepted: input.overlapAccepted ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const columns = [
    'id',
    'productId',
    'stageTemplateId',
    'stageOrder',
    'stageName',
    'dateValue',
    'dateRaw',
    'dateEnd',
    'status',
    'isCompleted',
    'isCritical',
    'responsibleId',
    'comment',
    'priority',
    'plannedDate',
    'actualDate',
    'daysDeviation',
    'createdAt',
    'updatedAt',
  ]

  const values: unknown[] = [
    data.id,
    data.productId,
    data.stageTemplateId,
    data.stageOrder,
    data.stageName,
    data.dateValue,
    data.dateRaw,
    data.dateEnd,
    data.status,
    data.isCompleted,
    data.isCritical,
    data.responsibleId,
    data.comment,
    data.priority,
    data.plannedDate,
    data.actualDate,
    data.daysDeviation,
    data.createdAt,
    data.updatedAt,
  ]

  if (hasAutoshiftColumn) {
    columns.push('participatesInAutoshift')
    values.push(data.participatesInAutoshift)
  }

  if (hasAffectsFinalDateColumn) {
    const insertIndex = columns.indexOf('responsibleId')
    columns.splice(insertIndex, 0, 'affectsFinalDate')
    values.splice(insertIndex, 0, data.affectsFinalDate)
  }

  if (hasOverlapAcceptedColumn) {
    columns.push('overlapAccepted')
    values.push(data.overlapAccepted)
  }

  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
  const quotedColumns = columns.map((column) => `"${column}"`).join(', ')

  await db.$executeRawUnsafe(
    `INSERT INTO "product_stages" (${quotedColumns}) VALUES (${placeholders})`,
    ...values
  )

  return data
}

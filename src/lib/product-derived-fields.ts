import { prisma } from './prisma'

const AUTO_COMPLETED_COMMENT = 'Автоматически завершено после закрытия всех этапов'
const AUTO_ARCHIVED_REASON = 'Автоматически отправлено в архив после завершения всех этапов'

type DerivedStage = {
  stageOrder: number
  isCompleted: boolean
  dateValue: Date | null
  plannedDate?: Date | null
}

export function getProgressPercentFromStages(stages: DerivedStage[]) {
  if (stages.length === 0) return 0

  const completedCount = stages.filter((stage) => stage.isCompleted).length
  return Math.round((completedCount / stages.length) * 100)
}

export function getFinalDateFromStages(stages: DerivedStage[]) {
  let finalDate: Date | null = null

  for (const stage of stages) {
    const stageDate = stage.dateValue ?? stage.plannedDate ?? null
    if (!stageDate || Number.isNaN(stageDate.getTime())) continue

    if (!finalDate || stageDate.getTime() > finalDate.getTime()) {
      finalDate = stageDate
    }
  }

  return finalDate
}

export async function recalculateProductDerivedFields(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      status: true,
      isArchived: true,
      closedAt: true,
      closureComment: true,
      archivedAt: true,
      archiveReason: true,
      stages: {
        orderBy: { stageOrder: 'asc' },
        select: {
          stageOrder: true,
          isCompleted: true,
          dateValue: true,
          plannedDate: true,
        },
      },
    },
  })

  if (!product) return null

  const progressPercent = getProgressPercentFromStages(product.stages)
  const finalDate = getFinalDateFromStages(product.stages)
  const isFullyCompleted =
    product.stages.length > 0 &&
    product.stages.every((stage) => stage.isCompleted)
  const wasAutomaticallyClosed =
    product.closureComment === AUTO_COMPLETED_COMMENT ||
    product.archiveReason === AUTO_ARCHIVED_REASON
  const shouldReopenCompletedProduct =
    !isFullyCompleted &&
    product.status === 'COMPLETED' &&
    (!product.isArchived || wasAutomaticallyClosed)

  const lifecycleUpdates = isFullyCompleted
    ? {
        status: 'COMPLETED',
        isArchived: true,
        closedAt: product.closedAt ?? new Date(),
        closureComment:
          product.closureComment ??
          AUTO_COMPLETED_COMMENT,
        archivedAt: product.archivedAt ?? new Date(),
        archiveReason:
          product.archiveReason ??
          AUTO_ARCHIVED_REASON,
        riskScore: 0,
      }
    : shouldReopenCompletedProduct
      ? {
          status: 'IN_PROGRESS',
          isArchived: false,
          closedAt: null,
          closedById: null,
          closureComment: null,
          archivedAt: null,
          archivedById: null,
          archiveReason: null,
        }
    : {}

  return prisma.product.update({
    where: { id: productId },
    data: {
      progressPercent,
      finalDate,
      ...lifecycleUpdates,
    },
    select: {
      id: true,
      finalDate: true,
      progressPercent: true,
      riskScore: true,
      status: true,
      isArchived: true,
      closedAt: true,
      closureComment: true,
      archivedAt: true,
      archiveReason: true,
    },
  })
}

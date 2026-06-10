import { prisma } from './prisma'

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

  return prisma.product.update({
    where: { id: productId },
    data: {
      progressPercent,
      finalDate,
    },
    select: {
      id: true,
      finalDate: true,
      progressPercent: true,
      riskScore: true,
      status: true,
    },
  })
}

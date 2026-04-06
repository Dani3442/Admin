import { prisma } from './prisma'
import { addDays, differenceInDays } from 'date-fns'

export async function applyAutomation(
  productId: string,
  changedStageOrder: number,
  oldDate: Date | null,
  newDate: Date | null,
  userId: string
): Promise<{ affected: number; shiftDays: number; action: string } | null> {
  if (!oldDate || !newDate) return null
  const shiftDays = differenceInDays(newDate, oldDate)
  if (shiftDays === 0) return null

  const automation = await prisma.automation.findFirst({
    where: {
      OR: [{ productId }, { isTemplate: true }],
      isActive: true,
    },
    orderBy: { productId: 'desc' },
  })

  if (!automation) return null

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { stages: { orderBy: { stageOrder: 'asc' } } },
  })
  if (!product) return null

  const laterStages = product.stages.filter(
    (s) => s.stageOrder > changedStageOrder && s.participatesInAutoshift
  )
  const excludeOrders: number[] = JSON.parse(automation.excludeStageOrders || '[]')

  let affected = 0

  switch (automation.actionType) {
    case 'SHIFT_ALL_FOLLOWING':
      for (const stage of laterStages) {
        if (excludeOrders.includes(stage.stageOrder)) continue
        if (!stage.dateValue) continue
        const newStageDate = addDays(stage.dateValue, shiftDays)
        await prisma.productStage.update({
          where: { id: stage.id },
          data: { dateValue: newStageDate, plannedDate: newStageDate },
        })
        await prisma.changeHistory.create({
          data: {
            productId, productStageId: stage.id, field: 'dateValue',
            oldValue: stage.dateValue.toISOString(), newValue: newStageDate.toISOString(),
            changedById: userId, reason: `Авто-сдвиг: ${automation.name}`,
          },
        })
        affected++
      }
      if (product.finalDate) {
        await prisma.product.update({
          where: { id: productId },
          data: { finalDate: addDays(product.finalDate, shiftDays) },
        })
      }
      break

    case 'SHIFT_FINAL_DATE_ONLY':
      if (product.finalDate) {
        await prisma.product.update({
          where: { id: productId },
          data: { finalDate: addDays(product.finalDate, shiftDays) },
        })
        affected = 1
      }
      break

    case 'MARK_AS_RISK':
      await prisma.product.update({
        where: { id: productId },
        data: { status: 'AT_RISK', riskScore: 80 },
      })
      affected = 1
      break

    case 'RECALCULATE_BY_DURATIONS':
      let currentDate = newDate
      for (const stage of laterStages) {
        if (excludeOrders.includes(stage.stageOrder)) continue
        const template = await prisma.stageTemplate.findFirst({
          where: { order: stage.stageOrder },
        })
        const durationDays = template?.durationDays || 1
        currentDate = addDays(currentDate, durationDays)
        await prisma.productStage.update({
          where: { id: stage.id },
          data: { dateValue: currentDate, plannedDate: currentDate },
        })
        affected++
      }
      break
  }

  return { affected, shiftDays, action: automation.actionType }
}

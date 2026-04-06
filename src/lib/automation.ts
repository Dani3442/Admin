import { prisma } from './prisma'
import { addDays, differenceInDays } from 'date-fns'

const DEFAULT_SHIFT_AUTOMATION = {
  name: 'Сдвиг всех следующих этапов',
  description: 'При изменении даты любого этапа — сдвигает все последующие этапы на такое же количество дней',
  isTemplate: true,
  isActive: true,
  actionType: 'SHIFT_ALL_FOLLOWING',
  config: JSON.stringify({ shiftType: 'cascade', includeWeekends: false }),
  excludeStageOrders: '[]',
} as const

export async function ensureDefaultShiftFollowingAutomation() {
  const existing = await prisma.automation.findFirst({
    where: {
      isTemplate: true,
      actionType: DEFAULT_SHIFT_AUTOMATION.actionType,
    },
    orderBy: { createdAt: 'asc' },
  })

  if (existing) return existing

  return prisma.automation.create({
    data: DEFAULT_SHIFT_AUTOMATION,
  })
}

function selectEffectiveAutomation(
  automations: Array<{
    id: string
    productId: string | null
    isTemplate: boolean
    isActive: boolean
    actionType: string
    excludeStageOrders: string
    name: string
  }>
) {
  const priority = [
    'SHIFT_ALL_FOLLOWING',
    'RECALCULATE_BY_DURATIONS',
    'SHIFT_FINAL_DATE_ONLY',
    'MARK_AS_RISK',
    'NOTIFY_ONLY',
  ]

  for (const actionType of priority) {
    const productSpecific = automations.find((automation) => automation.actionType === actionType && automation.productId)
    if (productSpecific) return productSpecific

    const template = automations.find((automation) => automation.actionType === actionType && automation.isTemplate)
    if (template) return template
  }

  return null
}

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

  await ensureDefaultShiftFollowingAutomation()

  const automations = await prisma.automation.findMany({
    where: {
      OR: [{ productId }, { isTemplate: true }],
      isActive: true,
    },
    orderBy: [{ productId: 'desc' }, { createdAt: 'asc' }],
  })

  const automation = selectEffectiveAutomation(automations)

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

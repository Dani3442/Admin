import { prisma } from '@/lib/prisma'
import { dispatchTelegramNotifications } from '@/lib/telegram'
import { recalculateProductDerivedFields } from '@/lib/product-derived-fields'
import { recalculateProductRisk } from '@/lib/risk'
import {
  addDays,
  normalizeStageStartDelayDays,
  normalizeStageStartReferenceOrder,
  normalizeStageStartTrigger,
} from '@/lib/stage-start-rules'
import { getParallelStartRuleUpdates } from '@/lib/stage-parallel-rules'

type WorkflowDb = typeof prisma

function isDueForAutoStart(stage: {
  stageOrder: number
  autoStartAt: Date | null
}) {
  if (stage.stageOrder === 0 && !stage.autoStartAt) return true
  if (!stage.autoStartAt) return false

  return stage.autoStartAt.getTime() <= Date.now()
}

function datesEqual(left: Date | null, right: Date | null) {
  if (!left && !right) return true
  if (!left || !right) return false

  return left.getTime() === right.getTime()
}

export async function scheduleStageAutoStartDates(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      createdAt: true,
      stages: {
        orderBy: [{ stageOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          stageOrder: true,
          status: true,
          isCompleted: true,
          startDate: true,
          endDate: true,
          autoStartAt: true,
          stageName: true,
          durationDays: true,
          startTrigger: true,
          startDelayDays: true,
          startReferenceStageOrder: true,
        },
      },
    },
  })

  if (!product) return

  const startRuleUpdates = getParallelStartRuleUpdates(product.stages)
  const stages = product.stages.map((stage) => {
    const startRuleUpdate = startRuleUpdates.get(stage.id)
    return startRuleUpdate ? { ...stage, ...startRuleUpdate } : stage
  })

  for (const stage of product.stages) {
    const startRuleUpdate = startRuleUpdates.get(stage.id)
    if (!startRuleUpdate) continue

    if (
      stage.startTrigger === startRuleUpdate.startTrigger &&
      stage.startDelayDays === startRuleUpdate.startDelayDays &&
      stage.startReferenceStageOrder === startRuleUpdate.startReferenceStageOrder
    ) {
      continue
    }

    await prisma.productStage.update({
      where: { id: stage.id },
      data: startRuleUpdate,
      select: { id: true },
    })
  }

  const stageByOrder = new Map(stages.map((stage) => [stage.stageOrder, stage]))

  for (const stage of stages) {
    if (stage.isCompleted || stage.status === 'COMPLETED' || stage.status === 'IN_PROGRESS') continue

    const trigger = normalizeStageStartTrigger(stage.startTrigger, stage.stageOrder)
    const delayDays = normalizeStageStartDelayDays(stage.startDelayDays)
    const referenceOrder = normalizeStageStartReferenceOrder(stage.startReferenceStageOrder)
    let anchorDate: Date | null = null

    if (stage.stageOrder === 0 || trigger === 'PRODUCT_CREATED') {
      anchorDate = product.createdAt
    } else if (trigger === 'PREVIOUS_STAGE_COMPLETED') {
      anchorDate = stageByOrder.get(stage.stageOrder - 1)?.endDate ?? null
    } else if (trigger === 'STAGE_STARTED') {
      const referenceStage = referenceOrder === null ? null : stageByOrder.get(referenceOrder)
      anchorDate = referenceStage?.startDate ?? null
    } else if (trigger === 'STAGE_COMPLETED') {
      const referenceStage = referenceOrder === null ? null : stageByOrder.get(referenceOrder)
      anchorDate = referenceStage?.endDate ?? null
    }

    const nextAutoStartAt = anchorDate ? addDays(anchorDate, delayDays) : null
    if (datesEqual(stage.autoStartAt, nextAutoStartAt)) continue

    await prisma.productStage.update({
      where: { id: stage.id },
      data: { autoStartAt: nextAutoStartAt },
      select: { id: true },
    })
  }
}

async function startSubStagesForStage(db: WorkflowDb, input: { productId: string; stageId: string }) {
  const subStages = await db.productSubStage.findMany({
    where: {
      stageId: input.stageId,
      status: 'NOT_STARTED',
    },
    select: { id: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })

  for (const subStage of subStages) {
    await db.productSubStage.update({
      where: { id: subStage.id },
      data: {
        status: 'IN_PROGRESS',
        startDate: new Date(),
      },
      select: { id: true },
    })

  }
}

export async function startStageWorkflow(input: {
  productId: string
  stageId: string
}) {
  const stage = await prisma.productStage.findUnique({
    where: { id: input.stageId },
    select: {
      id: true,
      productId: true,
      status: true,
      isCompleted: true,
      product: { select: { isArchived: true } },
    },
  })

  if (!stage || stage.productId !== input.productId || stage.product.isArchived) return false
  if (stage.isCompleted || stage.status === 'COMPLETED' || stage.status === 'IN_PROGRESS') return false

  await prisma.productStage.update({
    where: { id: stage.id },
    data: {
      status: 'IN_PROGRESS',
      isCompleted: false,
      startDate: new Date(),
    },
    select: { id: true },
  })

  await startSubStagesForStage(prisma, {
    productId: input.productId,
    stageId: stage.id,
  })

  await dispatchTelegramNotifications({
    productId: input.productId,
    stageId: stage.id,
    eventType: 'stage_started',
  })

  await scheduleStageAutoStartDates(input.productId)

  return true
}

export async function processDueStageStartsForProduct(productId: string) {
  const startedStageIds: string[] = []
  let guard = 0

  while (guard < 100) {
    guard += 1
    await scheduleStageAutoStartDates(productId)

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        isArchived: true,
        stages: {
          orderBy: [{ stageOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            stageOrder: true,
            status: true,
            isCompleted: true,
            autoStartAt: true,
          },
        },
      },
    })

    if (!product || product.isArchived) return startedStageIds

    const dueStage = product.stages.find((stage) => {
      if (stage.isCompleted || stage.status === 'COMPLETED' || stage.status === 'IN_PROGRESS') return false
      return isDueForAutoStart(stage)
    })

    if (!dueStage) break

    const didStart = await startStageWorkflow({
      productId: productId,
      stageId: dueStage.id,
    })
    if (!didStart) break
    startedStageIds.push(dueStage.id)
  }

  return startedStageIds
}

export async function completeStageIfAllSubStagesDone(input: {
  productId: string
  stageId: string
}) {
  const stage = await prisma.productStage.findUnique({
    where: { id: input.stageId },
    select: {
      id: true,
      productId: true,
      status: true,
      isCompleted: true,
      subStages: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  })

  if (!stage || stage.productId !== input.productId || stage.isCompleted || stage.status === 'COMPLETED') {
    return false
  }

  if (stage.subStages.length === 0 || stage.subStages.some((subStage) => subStage.status !== 'COMPLETED')) {
    return false
  }

  await prisma.productStage.update({
    where: { id: stage.id },
    data: {
      status: 'COMPLETED',
      isCompleted: true,
      endDate: new Date(),
      actualDate: new Date(),
    },
    select: { id: true },
  })

  await dispatchTelegramNotifications({
    productId: input.productId,
    stageId: stage.id,
    eventType: 'stage_completed',
  })

  await recalculateProductDerivedFields(input.productId)
  await recalculateProductRisk(input.productId)
  await scheduleStageAutoStartDates(input.productId)
  await processDueStageStartsForProduct(input.productId)

  return true
}

export async function completeStageWorkflow(input: {
  productId: string
  stageId: string
}) {
  const stage = await prisma.productStage.findUnique({
    where: { id: input.stageId },
    select: {
      id: true,
      productId: true,
      status: true,
      isCompleted: true,
      product: { select: { isArchived: true } },
    },
  })

  if (!stage || stage.productId !== input.productId || stage.product.isArchived) return false
  if (stage.isCompleted || stage.status === 'COMPLETED') return false

  await prisma.productStage.update({
    where: { id: stage.id },
    data: {
      status: 'COMPLETED',
      isCompleted: true,
      endDate: new Date(),
      actualDate: new Date(),
    },
    select: { id: true },
  })

  await dispatchTelegramNotifications({
    productId: input.productId,
    stageId: stage.id,
    eventType: 'stage_completed',
  })

  await recalculateProductDerivedFields(input.productId)
  await recalculateProductRisk(input.productId)
  await scheduleStageAutoStartDates(input.productId)
  await processDueStageStartsForProduct(input.productId)

  return true
}

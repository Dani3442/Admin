import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyAutomation, ensureDefaultShiftFollowingAutomation } from '@/lib/automation'
import { recalculateProductRisk } from '@/lib/risk'
import {
  supportsProductStageAutoshiftColumn,
  supportsProductStageOverlapAcceptedColumn,
  supportsStageTemplateAffectsFinalDateColumn,
} from '@/lib/schema-compat'
import { recalculateProductDerivedFields } from '@/lib/product-derived-fields'
import { createProductStageCompat } from '@/lib/product-stage-compat'
import { getOverlapAcceptedMap, persistOverlapAccepted } from '@/lib/overlap-acceptance'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'

async function normalizeProductStageOrders(
  tx: {
    productStage: {
      findMany: (args: Record<string, unknown>) => Promise<Array<{
        id: string
        stageTemplateId: string
        stageOrder: number
        createdAt: Date
      }>>
      update: (args: Record<string, unknown>) => Promise<unknown>
      aggregate: (args: Record<string, unknown>) => Promise<{ _max: { stageOrder: number | null } }>
    }
    stageTemplate: {
      findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string; order: number }>>
    }
  },
  productId: string
) {
  const [productStages, stageTemplates] = await Promise.all([
    tx.productStage.findMany({
      where: { productId },
      select: {
        id: true,
        stageTemplateId: true,
        stageOrder: true,
        createdAt: true,
      },
      orderBy: [{ stageOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    tx.stageTemplate.findMany({
      select: { id: true, order: true },
      orderBy: { order: 'asc' },
    }),
  ])

  const templateOrder = new Map(stageTemplates.map((stage) => [stage.id, stage.order]))

  const knownStages = productStages
    .filter((stage) => templateOrder.has(stage.stageTemplateId))
    .sort((left, right) => {
      const byTemplateOrder = (templateOrder.get(left.stageTemplateId) ?? left.stageOrder) - (templateOrder.get(right.stageTemplateId) ?? right.stageOrder)
      if (byTemplateOrder !== 0) return byTemplateOrder
      if (left.stageOrder !== right.stageOrder) return left.stageOrder - right.stageOrder
      return left.createdAt.getTime() - right.createdAt.getTime()
    })

  const customStages = productStages
    .filter((stage) => !templateOrder.has(stage.stageTemplateId))
    .sort((left, right) => {
      if (left.stageOrder !== right.stageOrder) return left.stageOrder - right.stageOrder
      return left.createdAt.getTime() - right.createdAt.getTime()
    })

  const normalizedStages = [...knownStages, ...customStages]

  for (const [index, stage] of normalizedStages.entries()) {
    await tx.productStage.update({
      where: { id: stage.id },
      data: { stageOrder: -(index + 1) },
    })
  }

  for (const [index, stage] of normalizedStages.entries()) {
    await tx.productStage.update({
      where: { id: stage.id },
      data: { stageOrder: index },
    })
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureDefaultShiftFollowingAutomation()
  const hasStageTemplateAffectsFinalDateColumn = await supportsStageTemplateAffectsFinalDateColumn()
  const stages = hasStageTemplateAffectsFinalDateColumn
    ? await prisma.stageTemplate.findMany({
        select: {
          id: true,
          name: true,
          order: true,
          durationText: true,
          durationDays: true,
          isCritical: true,
          affectsFinalDate: true,
        },
        orderBy: { order: 'asc' },
      })
    : await prisma.stageTemplate.findMany({
        select: {
          id: true,
          name: true,
          order: true,
          durationText: true,
          durationDays: true,
          isCritical: true,
        },
        orderBy: { order: 'asc' },
      })
  return NextResponse.json(stages.map((stage) => ({ ...stage, participatesInAutoshift: true })))
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = (session.user as any).id
  const rateLimit = consumeRateLimit({
    key: `api:stages:update:${userId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 60,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const body = await req.json()
  const { stageId, stageIds, updates, applyAutomations = true, swapWithStageId, productId, stageTemplateId, stageOrder, stageName } = body
  const [hasAutoshiftColumn, hasOverlapAcceptedColumn, hasStageTemplateAffectsFinalDateColumn] = await Promise.all([
    supportsProductStageAutoshiftColumn(),
    supportsProductStageOverlapAcceptedColumn(),
    supportsStageTemplateAffectsFinalDateColumn(),
  ])
  const stageResponseSelect: Record<string, boolean> = {
    id: true,
    stageTemplateId: true,
    stageOrder: true,
    stageName: true,
    dateValue: true,
    dateRaw: true,
    dateEnd: true,
    status: true,
    isCompleted: true,
    isCritical: true,
    affectsFinalDate: true,
    responsibleId: true,
    comment: true,
    priority: true,
    plannedDate: true,
    actualDate: true,
    daysDeviation: true,
    createdAt: true,
    updatedAt: true,
  }

  if (hasAutoshiftColumn) {
    stageResponseSelect.participatesInAutoshift = true
  }

  if (hasOverlapAcceptedColumn) {
    stageResponseSelect.overlapAccepted = true
  }

  if (Array.isArray(stageIds) && stageIds.length > 0) {
    const bulkUpdates = { ...(updates || {}) }
    const requestedOverlapAccepted = bulkUpdates.overlapAccepted
    if (!hasOverlapAcceptedColumn) {
      delete bulkUpdates.overlapAccepted
    }

    const stagesToUpdate = await prisma.productStage.findMany({
      where: { id: { in: stageIds } },
      select: { id: true, productId: true },
    })

    if (stagesToUpdate.length !== stageIds.length) {
      return NextResponse.json({ error: 'One or more stages not found' }, { status: 404 })
    }

    const targetProductId = stagesToUpdate[0]?.productId
    if (!targetProductId || stagesToUpdate.some((stage) => stage.productId !== targetProductId)) {
      return NextResponse.json({ error: 'Stages must belong to the same product' }, { status: 400 })
    }

    if (Object.keys(bulkUpdates).length > 0) {
      await prisma.productStage.updateMany({
        where: { id: { in: stageIds } },
        data: bulkUpdates,
      })
    }

    if (typeof requestedOverlapAccepted === 'boolean') {
      await persistOverlapAccepted(targetProductId, stageIds, requestedOverlapAccepted, userId)
    }

    await recalculateProductDerivedFields(targetProductId)
    await recalculateProductRisk(targetProductId)

    const updatedProduct = await prisma.product.findUnique({
      where: { id: targetProductId },
      select: {
        id: true,
        finalDate: true,
        progressPercent: true,
        riskScore: true,
        status: true,
      },
    })

    const stages = await prisma.productStage.findMany({
      where: { productId: targetProductId },
      orderBy: { stageOrder: 'asc' },
      select: stageResponseSelect,
    })

    const overlapAcceptedMap = await getOverlapAcceptedMap(targetProductId)
    const overlapAcceptedByStageId = overlapAcceptedMap as Map<string, boolean>

    return NextResponse.json({
      stages: stages.map((stage) => ({
        ...stage,
        participatesInAutoshift: hasAutoshiftColumn ? (stage as any).participatesInAutoshift ?? true : true,
        overlapAccepted: hasOverlapAcceptedColumn
          ? (stage as any).overlapAccepted ?? false
          : overlapAcceptedByStageId.get((stage as any).id) ?? false,
      })),
      product: updatedProduct,
    })
  }

  let existingStage = stageId
    ? await prisma.productStage.findUnique({
        where: { id: stageId },
        select: {
          id: true,
          productId: true,
          stageOrder: true,
          stageTemplateId: true,
          stageName: true,
          dateValue: true,
        },
      })
    : null
  let createdMissingStage = false

  if (!existingStage && productId && stageTemplateId && typeof stageOrder === 'number') {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, isArchived: true },
    })
    if (!product || product.isArchived) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    existingStage = await prisma.productStage.findFirst({
      where: {
        productId,
        stageTemplateId,
        stageOrder,
      },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        productId: true,
        stageOrder: true,
        stageTemplateId: true,
        stageName: true,
        dateValue: true,
      },
    })

    if (!existingStage) {
      const templateMatches = await prisma.productStage.findMany({
        where: {
          productId,
          stageTemplateId,
        },
        orderBy: [{ createdAt: 'asc' }],
        select: {
          id: true,
          productId: true,
          stageOrder: true,
          stageTemplateId: true,
          stageName: true,
          dateValue: true,
        },
      })

      if (templateMatches.length === 1) {
        existingStage = templateMatches[0]
      } else if (templateMatches.length > 1) {
        existingStage = [...templateMatches].sort((left, right) => {
          const leftDistance = Math.abs(left.stageOrder - stageOrder)
          const rightDistance = Math.abs(right.stageOrder - stageOrder)
          if (leftDistance !== rightDistance) return leftDistance - rightDistance
          return left.stageOrder - right.stageOrder
        })[0]
      }
    }

    if (!existingStage) {
      const stageOrderMatch = await prisma.productStage.findFirst({
        where: {
          productId,
          stageOrder,
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          productId: true,
          stageOrder: true,
          stageTemplateId: true,
          stageName: true,
          dateValue: true,
        },
      })

      if (stageOrderMatch && stageOrderMatch.stageTemplateId === stageTemplateId) {
        existingStage = stageOrderMatch
      }
    }

    if (!existingStage) {
      const template = hasStageTemplateAffectsFinalDateColumn
        ? await prisma.stageTemplate.findUnique({
            where: { id: stageTemplateId },
            select: {
              id: true,
              name: true,
              isCritical: true,
              affectsFinalDate: true,
            },
          })
        : await prisma.stageTemplate.findUnique({
            where: { id: stageTemplateId },
            select: {
              id: true,
              name: true,
              isCritical: true,
            },
          })
      if (!template) {
        return NextResponse.json({ error: 'Stage template not found' }, { status: 404 })
      }

      await prisma.$transaction(async (tx) => {
        const orderAggregate = await tx.productStage.aggregate({
          where: { productId },
          _max: { stageOrder: true },
        })
        const tempStageOrder = (orderAggregate._max.stageOrder ?? -1) + 1
        const initialDateValue = updates?.dateValue ? new Date(updates.dateValue) : null

        const createdStage = await createProductStageCompat(tx as any, {
          productId,
          stageTemplateId,
          stageOrder: tempStageOrder,
          stageName: typeof stageName === 'string' && stageName.trim() ? stageName.trim() : template.name,
          dateValue: initialDateValue,
          plannedDate: initialDateValue,
          isCritical: template.isCritical,
          affectsFinalDate: hasStageTemplateAffectsFinalDateColumn ? (template as any).affectsFinalDate ?? true : true,
          status: 'NOT_STARTED',
        })

        await normalizeProductStageOrders(tx as any, productId)

        existingStage = {
          id: (createdStage as any).id,
          productId,
          stageOrder: tempStageOrder,
          stageTemplateId,
          stageName: typeof stageName === 'string' && stageName.trim() ? stageName.trim() : template.name,
          dateValue: initialDateValue,
        }
        createdMissingStage = true
      })
    }
  }

  if (!existingStage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

  // Handle order swap (move up/down)
  if (swapWithStageId) {
    const otherStage = await prisma.productStage.findUnique({ where: { id: swapWithStageId } })
    if (!otherStage) return NextResponse.json({ error: 'Other stage not found' }, { status: 404 })

    // Use a temporary order to avoid unique constraint violation
    const tempOrder = -1
    await prisma.$transaction([
      prisma.productStage.update({ where: { id: existingStage.id }, data: { stageOrder: tempOrder } }),
      prisma.productStage.update({ where: { id: otherStage.id }, data: { stageOrder: existingStage.stageOrder } }),
      prisma.productStage.update({ where: { id: existingStage.id }, data: { stageOrder: otherStage.stageOrder } }),
    ])

    const updatedStages = await prisma.productStage.findMany({
      where: { productId: existingStage.productId },
      orderBy: { stageOrder: 'asc' },
    })
    return NextResponse.json({ stages: updatedStages })
  }

  const oldDate = createdMissingStage ? null : existingStage.dateValue
  const newDate = updates.dateValue ? new Date(updates.dateValue) : null

  // Log change
  if (oldDate && newDate && oldDate.getTime() !== newDate.getTime()) {
    await prisma.changeHistory.create({
      data: {
        productId: existingStage.productId,
        productStageId: existingStage.id,
        field: 'dateValue',
        oldValue: oldDate.toISOString(),
        newValue: newDate?.toISOString() || null,
        changedById: userId,
        reason: updates.reason || null,
      },
    })
  }

  const safeUpdates = { ...(updates || {}) }
  if (!hasOverlapAcceptedColumn) {
    delete safeUpdates.overlapAccepted
  }

  if (
    hasOverlapAcceptedColumn &&
    Object.prototype.hasOwnProperty.call(safeUpdates, 'dateValue') &&
    oldDate &&
    newDate &&
    oldDate.getTime() !== newDate.getTime()
  ) {
    safeUpdates.overlapAccepted = false
  }

  const normalizedUpdates = {
    ...safeUpdates,
  }

  const updatedStage = createdMissingStage
    ? await prisma.productStage.findUniqueOrThrow({
        where: { id: existingStage.id },
        select: {
          productId: true,
          ...stageResponseSelect,
        },
      })
    : await prisma.productStage.update({
        where: { id: existingStage.id },
        data: normalizedUpdates,
        select: {
          productId: true,
          ...stageResponseSelect,
        },
      })

  // Apply automation if date changed
  let automationResult = null
  if (applyAutomations && oldDate && newDate && oldDate.getTime() !== newDate.getTime()) {
    automationResult = await applyAutomation(
      existingStage.productId,
      existingStage.stageOrder,
      oldDate,
      newDate,
      userId
    )
  }

  if (
    !hasOverlapAcceptedColumn &&
    Object.prototype.hasOwnProperty.call(updates || {}, 'dateValue') &&
    oldDate &&
    newDate &&
    oldDate.getTime() !== newDate.getTime()
  ) {
    await persistOverlapAccepted(existingStage.productId, [existingStage.id], false, userId)
  }

  await recalculateProductDerivedFields(existingStage.productId)

  // Recalculate risk after any stage change
  await recalculateProductRisk(existingStage.productId)

  const updatedProduct = await prisma.product.findUnique({
    where: { id: existingStage.productId },
    select: {
      id: true,
      finalDate: true,
      progressPercent: true,
      riskScore: true,
      status: true,
    },
  })

  const stages = await prisma.productStage.findMany({
    where: { productId: existingStage.productId },
    orderBy: { stageOrder: 'asc' },
    select: stageResponseSelect,
  })
  const overlapAcceptedMap = await getOverlapAcceptedMap(existingStage.productId)
  const overlapAcceptedByStageId = overlapAcceptedMap as Map<string, boolean>

  return NextResponse.json({
    stage: {
      ...updatedStage,
      participatesInAutoshift: hasAutoshiftColumn ? (updatedStage as any).participatesInAutoshift ?? true : true,
      overlapAccepted: hasOverlapAcceptedColumn
        ? (updatedStage as any).overlapAccepted ?? false
        : overlapAcceptedByStageId.get((updatedStage as any).id) ?? false,
    },
    stages: stages.map((stage) => ({
      ...stage,
      participatesInAutoshift: hasAutoshiftColumn ? (stage as any).participatesInAutoshift ?? true : true,
      overlapAccepted: hasOverlapAcceptedColumn
        ? (stage as any).overlapAccepted ?? false
        : overlapAcceptedByStageId.get((stage as any).id) ?? false,
    })),
    automationResult,
    product: updatedProduct,
  })
}

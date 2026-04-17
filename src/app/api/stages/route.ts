import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyAutomation, ensureDefaultShiftFollowingAutomation } from '@/lib/automation'
import { parseDateOnly } from '@/lib/date-only'
import { recalculateProductRisk } from '@/lib/risk'
import {
  supportsProductStageAutoshiftColumn,
  supportsProductStageDurationDaysColumn,
  supportsProductStageOverlapAcceptedColumn,
  supportsStageTemplateAffectsFinalDateColumn,
} from '@/lib/schema-compat'
import { recalculateProductDerivedFields } from '@/lib/product-derived-fields'
import { createProductStageCompat } from '@/lib/product-stage-compat'
import { getOverlapAcceptedMap, persistOverlapAccepted } from '@/lib/overlap-acceptance'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { sanitizeDeepStrings, sanitizeTextValue } from '@/lib/input-security'
import { applySequentialStageDateOverride } from '@/lib/stage-schedule'

function areSameDate(left: Date | null, right: Date | null) {
  if (!left && !right) return true
  if (!left || !right) return false
  return left.getTime() === right.getTime()
}

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

  const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
  const { stageId, stageIds, updates, applyAutomations = true, swapWithStageId, productId, stageTemplateId, stageOrder, stageName } = body
  const [hasAutoshiftColumn, hasDurationDaysColumn, hasOverlapAcceptedColumn, hasStageTemplateAffectsFinalDateColumn] = await Promise.all([
    supportsProductStageAutoshiftColumn(),
    supportsProductStageDurationDaysColumn(),
    supportsProductStageOverlapAcceptedColumn(),
    supportsStageTemplateAffectsFinalDateColumn(),
  ])
  const stageResponseSelect: Record<string, any> = {
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
    stageTemplate: {
      select: hasStageTemplateAffectsFinalDateColumn
        ? {
            id: true,
            name: true,
            order: true,
            durationText: true,
            durationDays: true,
            isCritical: true,
            affectsFinalDate: true,
          }
        : {
            id: true,
            name: true,
            order: true,
            durationText: true,
            durationDays: true,
            isCritical: true,
          },
    },
  }

  if (hasAutoshiftColumn) {
    stageResponseSelect.participatesInAutoshift = true
  }

  if (hasDurationDaysColumn) {
    stageResponseSelect.durationDays = true
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

  const sanitizedStageName = sanitizeTextValue(stageName, { maxLength: 160 })

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
        const initialDateValue = parseDateOnly(updates?.dateValue)

        const createdStage = await createProductStageCompat(tx as any, {
          productId,
          stageTemplateId,
          stageOrder: tempStageOrder,
          stageName: sanitizedStageName || template.name,
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
          stageName: sanitizedStageName || template.name,
          dateValue: initialDateValue,
        }
        createdMissingStage = true
      })
    }
  }

  if (!existingStage) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
  const targetStage = existingStage

  // Handle order swap (move up/down)
  if (swapWithStageId) {
    const otherStage = await prisma.productStage.findUnique({ where: { id: swapWithStageId } })
    if (!otherStage) return NextResponse.json({ error: 'Other stage not found' }, { status: 404 })

    // Use a temporary order to avoid unique constraint violation
    const tempOrder = -1
    await prisma.$transaction([
      prisma.productStage.update({ where: { id: targetStage.id }, data: { stageOrder: tempOrder } }),
      prisma.productStage.update({ where: { id: otherStage.id }, data: { stageOrder: targetStage.stageOrder } }),
      prisma.productStage.update({ where: { id: targetStage.id }, data: { stageOrder: otherStage.stageOrder } }),
    ])

    const updatedStages = await prisma.productStage.findMany({
      where: { productId: targetStage.productId },
      orderBy: { stageOrder: 'asc' },
      select: stageResponseSelect,
    })
    const overlapAcceptedMap = await getOverlapAcceptedMap(targetStage.productId)
    const overlapAcceptedByStageId = overlapAcceptedMap as Map<string, boolean>

    return NextResponse.json({
      stages: updatedStages.map((stage) => ({
        ...stage,
        participatesInAutoshift: hasAutoshiftColumn ? (stage as any).participatesInAutoshift ?? true : true,
        overlapAccepted: hasOverlapAcceptedColumn
          ? (stage as any).overlapAccepted ?? false
          : overlapAcceptedByStageId.get((stage as any).id) ?? false,
      })),
    })
  }

  const oldDate = createdMissingStage ? null : targetStage.dateValue
  const hasExplicitDateUpdate = Object.prototype.hasOwnProperty.call(updates || {}, 'dateValue')
  const newDate = hasExplicitDateUpdate ? parseDateOnly(updates?.dateValue) : null

  // Log change
  if (hasExplicitDateUpdate && !areSameDate(oldDate, newDate)) {
    await prisma.changeHistory.create({
      data: {
        productId: targetStage.productId,
        productStageId: targetStage.id,
        field: 'dateValue',
        oldValue: oldDate?.toISOString() ?? null,
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

  if (hasOverlapAcceptedColumn && hasExplicitDateUpdate && !areSameDate(oldDate, newDate)) {
    safeUpdates.overlapAccepted = false
  }

  const normalizedUpdates = {
    ...safeUpdates,
  }

  let automationResult = null

  if (hasExplicitDateUpdate) {
    const scheduleStages = await prisma.productStage.findMany({
      where: { productId: targetStage.productId },
      orderBy: { stageOrder: 'asc' },
      select: {
        id: true,
        stageOrder: true,
        dateValue: true,
        plannedDate: true,
        ...(hasDurationDaysColumn ? { durationDays: true } : {}),
        stageTemplate: {
          select: {
            durationDays: true,
          },
        },
      },
    })

    const changedStageIndex = scheduleStages.findIndex((stage) => stage.id === targetStage.id)
    if (changedStageIndex < 0) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
    }

    const recalculatedStages = applySequentialStageDateOverride(
      scheduleStages.map((stage) => ({
        plannedDate: stage.id === targetStage.id
          ? newDate
          : stage.dateValue ?? stage.plannedDate ?? null,
        durationDays: hasDurationDaysColumn ? (stage as { durationDays?: number | null }).durationDays ?? null : null,
        stageTemplateDurationDays: stage.stageTemplate?.durationDays ?? null,
      })),
      changedStageIndex,
      newDate
    )

    await prisma.$transaction(async (tx) => {
      for (const [index, stage] of scheduleStages.entries()) {
        if (index < changedStageIndex) continue

        const nextPlannedDate = recalculatedStages[index]?.plannedDate ?? null
        const previousPlannedDate = stage.dateValue ?? stage.plannedDate ?? null
        const isChangedStage = stage.id === targetStage.id
        const nextStageData = isChangedStage
          ? {
              ...normalizedUpdates,
              dateValue: nextPlannedDate,
              plannedDate: nextPlannedDate,
            }
          : {
              dateValue: nextPlannedDate,
              plannedDate: nextPlannedDate,
            }

        await tx.productStage.update({
          where: { id: stage.id },
          data: nextStageData,
          select: { id: true },
        })

        if (!isChangedStage && !areSameDate(previousPlannedDate, nextPlannedDate)) {
          await tx.changeHistory.create({
            data: {
              productId: targetStage.productId,
              productStageId: stage.id,
              field: 'dateValue',
              oldValue: previousPlannedDate?.toISOString() ?? null,
              newValue: nextPlannedDate?.toISOString() ?? null,
              changedById: userId,
              reason: `Автопересчёт после изменения даты этапа`,
            },
          })
        }
      }
    })
  } else {
    if (!createdMissingStage) {
      await prisma.productStage.update({
        where: { id: targetStage.id },
        data: normalizedUpdates,
        select: { id: true },
      })
    }

    if (applyAutomations && oldDate && newDate && !areSameDate(oldDate, newDate)) {
      automationResult = await applyAutomation(
        targetStage.productId,
        targetStage.stageOrder,
        oldDate,
        newDate,
        userId
      )
    }
  }

  if (
    !hasOverlapAcceptedColumn &&
    hasExplicitDateUpdate &&
    !areSameDate(oldDate, newDate)
  ) {
    await persistOverlapAccepted(targetStage.productId, [targetStage.id], false, userId)
  }

  await recalculateProductDerivedFields(targetStage.productId)

  // Recalculate risk after any stage change
  await recalculateProductRisk(targetStage.productId)

  const updatedProduct = await prisma.product.findUnique({
    where: { id: targetStage.productId },
    select: {
      id: true,
      finalDate: true,
      progressPercent: true,
      riskScore: true,
      status: true,
    },
  })

  const stages = await prisma.productStage.findMany({
    where: { productId: targetStage.productId },
    orderBy: { stageOrder: 'asc' },
    select: stageResponseSelect,
  })
  const updatedStage = stages.find((stage) => (stage as any).id === targetStage.id)
  const overlapAcceptedMap = await getOverlapAcceptedMap(targetStage.productId)
  const overlapAcceptedByStageId = overlapAcceptedMap as Map<string, boolean>

  revalidatePath('/products')
  revalidatePath('/table')
  revalidatePath('/dashboard')
  revalidatePath('/timeline')
  revalidatePath('/archive')
  revalidatePath(`/products/${targetStage.productId}`)

  return NextResponse.json({
    stage: updatedStage ? {
      ...updatedStage,
      participatesInAutoshift: hasAutoshiftColumn ? (updatedStage as any).participatesInAutoshift ?? true : true,
      overlapAccepted: hasOverlapAcceptedColumn
        ? (updatedStage as any).overlapAccepted ?? false
        : overlapAcceptedByStageId.get((updatedStage as any).id) ?? false,
    } : null,
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

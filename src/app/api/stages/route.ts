import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyAutomation, ensureDefaultShiftFollowingAutomation } from '@/lib/automation'
import { recalculateProductRisk } from '@/lib/risk'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await ensureDefaultShiftFollowingAutomation()
  const stages = await prisma.stageTemplate.findMany({ orderBy: { order: 'asc' } })
  return NextResponse.json(stages)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { stageId, stageIds, updates, applyAutomations = true, swapWithStageId, productId, stageTemplateId, stageOrder, stageName } = body

  if (Array.isArray(stageIds) && stageIds.length > 0) {
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

    await prisma.productStage.updateMany({
      where: { id: { in: stageIds } },
      data: updates,
    })

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
    })

    return NextResponse.json({ stages, product: updatedProduct })
  }

  let existingStage = stageId ? await prisma.productStage.findUnique({ where: { id: stageId } }) : null

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
        stageOrder,
      },
      orderBy: { createdAt: 'asc' },
    })

    if (!existingStage) {
      const exactTemplateMatch = await prisma.productStage.findFirst({
        where: {
          productId,
          stageTemplateId,
        },
        orderBy: { createdAt: 'asc' },
      })

      if (exactTemplateMatch) {
        existingStage = exactTemplateMatch
      }
    }

    if (!existingStage) {
      const template = await prisma.stageTemplate.findUnique({
        where: { id: stageTemplateId },
      })
      if (!template) {
        return NextResponse.json({ error: 'Stage template not found' }, { status: 404 })
      }

      await prisma.$transaction(async (tx) => {
        await tx.productStage.updateMany({
          where: {
            productId,
            stageOrder: { gte: stageOrder },
          },
          data: {
            stageOrder: { increment: 1 },
          },
        })

        existingStage = await tx.productStage.create({
          data: {
            productId,
            stageTemplateId,
            stageOrder,
            stageName: typeof stageName === 'string' && stageName.trim() ? stageName.trim() : template.name,
            isCritical: template.isCritical,
            affectsFinalDate: template.affectsFinalDate,
            participatesInAutoshift: template.participatesInAutoshift,
            status: 'NOT_STARTED',
          },
        })
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

  const oldDate = existingStage.dateValue
  const newDate = updates.dateValue ? new Date(updates.dateValue) : null

  // Log change
  const userId = (session.user as any).id
  if (oldDate !== newDate && oldDate) {
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

  const normalizedUpdates = {
    ...updates,
    ...(Object.prototype.hasOwnProperty.call(updates, 'dateValue') ? { overlapAccepted: false } : {}),
  }

  const updatedStage = await prisma.productStage.update({
    where: { id: existingStage.id },
    data: normalizedUpdates,
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

  // Recalculate product progress
  const allStages = await prisma.productStage.findMany({
    where: { productId: existingStage.productId },
  })
  const completedCount = allStages.filter((s) => s.isCompleted).length
  const progress = allStages.length > 0 ? Math.round((completedCount / allStages.length) * 100) : 0

  await prisma.product.update({
    where: { id: existingStage.productId },
    data: { progressPercent: progress },
  })

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
  })

  return NextResponse.json({ stage: updatedStage, stages, automationResult, product: updatedProduct })
}

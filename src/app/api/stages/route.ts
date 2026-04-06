import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyAutomation } from '@/lib/automation'
import { recalculateProductRisk } from '@/lib/risk'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stages = await prisma.stageTemplate.findMany({ orderBy: { order: 'asc' } })
  return NextResponse.json(stages)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { stageId, updates, applyAutomations = true, swapWithStageId } = body

  const existingStage = await prisma.productStage.findUnique({ where: { id: stageId } })
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
        productStageId: stageId,
        field: 'dateValue',
        oldValue: oldDate.toISOString(),
        newValue: newDate?.toISOString() || null,
        changedById: userId,
        reason: updates.reason || null,
      },
    })
  }

  const updatedStage = await prisma.productStage.update({
    where: { id: stageId },
    data: updates,
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

  return NextResponse.json({ stage: updatedStage, automationResult })
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recalculateProductRisk } from '@/lib/risk'

async function updateProductProgress(productId: string) {
  const stages = await prisma.productStage.findMany({
    where: { productId },
    select: { isCompleted: true },
  })

  const completedCount = stages.filter((stage) => stage.isCompleted).length
  const progressPercent = stages.length > 0
    ? Math.round((completedCount / stages.length) * 100)
    : 0

  await prisma.product.update({
    where: { id: productId },
    data: { progressPercent },
  })

  return progressPercent
}

async function getProductStageSnapshot(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      stages: {
        orderBy: { stageOrder: 'asc' },
        include: { stageTemplate: true },
      },
      progressPercent: true,
      riskScore: true,
      status: true,
    },
  })

  return product
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any).role
  if (!['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const stageName = String(body.stageName || '').trim()

    if (!stageName) {
      return NextResponse.json({ error: 'Укажите название этапа' }, { status: 400 })
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        stages: {
          orderBy: { stageOrder: 'asc' },
          include: { stageTemplate: true },
        },
      },
    })

    if (!product || product.isArchived) {
      return NextResponse.json({ error: 'Продукт не найден' }, { status: 404 })
    }

    const fallbackTemplateId =
      product.stages[0]?.stageTemplateId ||
      (await prisma.stageTemplate.findFirst({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }))?.id

    if (!fallbackTemplateId) {
      return NextResponse.json({ error: 'Не найден базовый шаблон этапа' }, { status: 400 })
    }

    await prisma.productStage.create({
      data: {
        productId,
        stageTemplateId: fallbackTemplateId,
        stageOrder: product.stages.length,
        stageName,
        isCritical: false,
        affectsFinalDate: false,
        participatesInAutoshift: false,
        status: 'NOT_STARTED',
      },
    })

    const progressPercent = await updateProductProgress(productId)
    await recalculateProductRisk(productId)
    const snapshot = await getProductStageSnapshot(productId)

    return NextResponse.json({
      stages: snapshot?.stages || [],
      progressPercent,
      riskScore: snapshot?.riskScore || 0,
      status: snapshot?.status || 'PLANNED',
    })
  } catch (error) {
    console.error('[product-stages:create] Failed to add stage', error)
    return NextResponse.json({ error: 'Не удалось добавить этап' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any).role
  if (!['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const stageId = searchParams.get('stageId')

    if (!stageId) {
      return NextResponse.json({ error: 'stageId is required' }, { status: 400 })
    }

    const stage = await prisma.productStage.findUnique({
      where: { id: stageId },
      select: { id: true, productId: true },
    })

    if (!stage || stage.productId !== productId) {
      return NextResponse.json({ error: 'Этап не найден' }, { status: 404 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.comment.deleteMany({
        where: { productStageId: stageId },
      })

      await tx.changeHistory.deleteMany({
        where: { productStageId: stageId },
      })

      await tx.productStage.delete({
        where: { id: stageId },
      })

      const remainingStages = await tx.productStage.findMany({
        where: { productId },
        orderBy: { stageOrder: 'asc' },
        select: { id: true },
      })

      for (const [index, remainingStage] of remainingStages.entries()) {
        await tx.productStage.update({
          where: { id: remainingStage.id },
          data: { stageOrder: index },
        })
      }
    })

    const progressPercent = await updateProductProgress(productId)
    await recalculateProductRisk(productId)
    const snapshot = await getProductStageSnapshot(productId)

    return NextResponse.json({
      stages: snapshot?.stages || [],
      progressPercent,
      riskScore: snapshot?.riskScore || 0,
      status: snapshot?.status || 'PLANNED',
    })
  } catch (error) {
    console.error('[product-stages:delete] Failed to delete stage', error)
    return NextResponse.json({ error: 'Не удалось удалить этап' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recalculateProductRisk } from '@/lib/risk'
import { recalculateProductDerivedFields } from '@/lib/product-derived-fields'
import { createProductStageCompat } from '@/lib/product-stage-compat'
import { supportsStageTemplateAffectsFinalDateColumn } from '@/lib/schema-compat'

async function normalizeRemainingProductStages(
  tx: {
    productStage: {
      findMany: (args: Record<string, unknown>) => Promise<Array<{ id: string }>>
      update: (args: Record<string, unknown>) => Promise<unknown>
    }
  },
  productId: string
) {
  const remainingStages = await tx.productStage.findMany({
    where: { productId },
    orderBy: [{ stageOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })

  for (const [index, remainingStage] of remainingStages.entries()) {
    await tx.productStage.update({
      where: { id: remainingStage.id },
      data: { stageOrder: -(index + 1) },
    })
  }

  for (const [index, remainingStage] of remainingStages.entries()) {
    await tx.productStage.update({
      where: { id: remainingStage.id },
      data: { stageOrder: index },
    })
  }
}

async function getProductStageSnapshot(productId: string) {
  const hasStageTemplateAffectsFinalDateColumn = await supportsStageTemplateAffectsFinalDateColumn()
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      finalDate: true,
      stages: {
        orderBy: { stageOrder: 'asc' },
        select: {
          id: true,
          productId: true,
          stageTemplateId: true,
          stageOrder: true,
          stageName: true,
          dateValue: true,
          dateRaw: true,
          dateEnd: true,
          status: true,
          isCompleted: true,
          isCritical: true,
          participatesInAutoshift: true,
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
        },
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
    const dateValue = body.dateValue ? new Date(body.dateValue) : null
    const participatesInAutoshift = body.participatesInAutoshift !== false
    const hasStageTemplateAffectsFinalDateColumn = await supportsStageTemplateAffectsFinalDateColumn()

    if (!stageName) {
      return NextResponse.json({ error: 'Укажите название этапа' }, { status: 400 })
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        stages: {
          orderBy: { stageOrder: 'asc' },
          select: {
            id: true,
            productId: true,
            stageTemplateId: true,
            stageOrder: true,
            stageName: true,
            dateValue: true,
            dateRaw: true,
            dateEnd: true,
            status: true,
            isCompleted: true,
            isCritical: true,
            participatesInAutoshift: true,
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
          },
        },
      },
    })

    if (!product || product.isArchived) {
      return NextResponse.json({ error: 'Продукт не найден' }, { status: 404 })
    }

    const fallbackTemplateId =
      product.stages[0]?.stageTemplateId ||
      (
        await prisma.stageTemplate.findFirst({
          select: { id: true },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        })
      )?.id

    if (!fallbackTemplateId) {
      return NextResponse.json({ error: 'Не найден базовый шаблон этапа' }, { status: 400 })
    }

    await createProductStageCompat(prisma as any, {
      productId,
      stageTemplateId: fallbackTemplateId,
      stageOrder: product.stages.length,
      stageName,
      isCritical: false,
      affectsFinalDate: false,
      participatesInAutoshift,
      status: 'NOT_STARTED',
      dateValue,
      plannedDate: dateValue,
    })

    const derivedProduct = await recalculateProductDerivedFields(productId)
    await recalculateProductRisk(productId)
    const snapshot = await getProductStageSnapshot(productId)

    return NextResponse.json({
      stages: (snapshot?.stages || []).map((stage) => ({
        ...stage,
        participatesInAutoshift: stage.participatesInAutoshift ?? true,
      })),
      progressPercent: derivedProduct?.progressPercent ?? snapshot?.progressPercent ?? 0,
      finalDate: derivedProduct?.finalDate ?? snapshot?.finalDate ?? null,
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

      await normalizeRemainingProductStages(tx as any, productId)
    })

    const derivedProduct = await recalculateProductDerivedFields(productId)
    await recalculateProductRisk(productId)
    const snapshot = await getProductStageSnapshot(productId)

    return NextResponse.json({
      stages: (snapshot?.stages || []).map((stage) => ({
        ...stage,
        participatesInAutoshift: stage.participatesInAutoshift ?? true,
      })),
      progressPercent: derivedProduct?.progressPercent ?? snapshot?.progressPercent ?? 0,
      finalDate: derivedProduct?.finalDate ?? snapshot?.finalDate ?? null,
      riskScore: snapshot?.riskScore || 0,
      status: snapshot?.status || 'PLANNED',
    })
  } catch (error) {
    console.error('[product-stages:delete] Failed to delete stage', error)
    return NextResponse.json({ error: 'Не удалось удалить этап' }, { status: 500 })
  }
}

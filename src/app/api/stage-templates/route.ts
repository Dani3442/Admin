import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
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
}

// Create a new stage template
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { name, durationText, isCritical = false } = body
    const participatesInAutoshift = body?.participatesInAutoshift !== false

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const last = await tx.stageTemplate.findFirst({ orderBy: { order: 'desc' } })
      const newOrder = (last?.order ?? -1) + 1

      const template = await tx.stageTemplate.create({
        data: {
          name: name.trim(),
          order: newOrder,
          durationText: durationText || null,
          isCritical,
          participatesInAutoshift,
        },
      })

      const products = await tx.product.findMany({
        where: { isArchived: false },
        select: { id: true },
      })

      const productStages = []

      for (const product of products) {
        await tx.productStage.updateMany({
          where: {
            productId: product.id,
            stageOrder: { gte: newOrder },
          },
          data: {
            stageOrder: { increment: 1 },
          },
        })

        const createdStage = await tx.productStage.create({
          data: {
            productId: product.id,
            stageTemplateId: template.id,
            stageOrder: newOrder,
            stageName: template.name,
            isCritical: template.isCritical,
            affectsFinalDate: template.affectsFinalDate,
            participatesInAutoshift: template.participatesInAutoshift,
            status: 'NOT_STARTED',
          },
          select: {
            id: true,
            productId: true,
            stageTemplateId: true,
            stageOrder: true,
            stageName: true,
            dateValue: true,
            dateRaw: true,
            isCompleted: true,
            isCritical: true,
            status: true,
            participatesInAutoshift: true,
          },
        })

        productStages.push(createdStage)
      }

      return { template, productStages }
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('[stage-templates:create] Failed to create stage template', error)
    return NextResponse.json({ error: 'Не удалось создать этап' }, { status: 500 })
  }
}

// Rename or reorder stage templates
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, action, name, participatesInAutoshift } = body

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const template = await prisma.stageTemplate.findUnique({ where: { id } })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Rename
  if (action === 'rename' && name?.trim()) {
    const updated = await prisma.stageTemplate.update({
      where: { id },
      data: { name: name.trim() },
    })

    // Update name in all product stages
    await prisma.productStage.updateMany({
      where: { stageTemplateId: id },
      data: { stageName: name.trim() },
    })

    return NextResponse.json(updated)
  }

  if (action === 'toggle-autoshift') {
    const nextValue = typeof participatesInAutoshift === 'boolean'
      ? participatesInAutoshift
      : !template.participatesInAutoshift

    const updated = await prisma.stageTemplate.update({
      where: { id },
      data: { participatesInAutoshift: nextValue },
    })

    await prisma.productStage.updateMany({
      where: { stageTemplateId: id },
      data: { participatesInAutoshift: nextValue },
    })

    return NextResponse.json(updated)
  }

  // Move left or right
  if (action === 'move-left' || action === 'move-right') {
    const direction = action === 'move-left' ? 'desc' : 'asc'
    const comparison = action === 'move-left'
      ? { order: { lt: template.order } }
      : { order: { gt: template.order } }

    const neighbor = await prisma.stageTemplate.findFirst({
      where: comparison,
      orderBy: { order: action === 'move-left' ? 'desc' : 'asc' },
    })

    if (!neighbor) {
      return NextResponse.json({ error: 'Cannot move further' }, { status: 400 })
    }

    // Swap orders
    await prisma.$transaction([
      prisma.stageTemplate.update({
        where: { id: template.id },
        data: { order: neighbor.order },
      }),
      prisma.stageTemplate.update({
        where: { id: neighbor.id },
        data: { order: template.order },
      }),
      // Update product stages orders too
      prisma.productStage.updateMany({
        where: { stageTemplateId: template.id },
        data: { stageOrder: neighbor.order },
      }),
      prisma.productStage.updateMany({
        where: { stageTemplateId: neighbor.id },
        data: { stageOrder: template.order },
      }),
    ])

    const all = await prisma.stageTemplate.findMany({ orderBy: { order: 'asc' } })
    return NextResponse.json(all)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any).role
  if (!['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const template = await prisma.stageTemplate.findUnique({
      where: { id },
      select: { id: true, name: true, order: true },
    })

    if (!template) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    let affectedProductIds: string[] = []

    await prisma.$transaction(async (tx) => {
      const productStages = await tx.productStage.findMany({
        where: {
          stageTemplateId: id,
          stageOrder: template.order,
        },
        select: {
          id: true,
          productId: true,
        },
      })
      const productStageIds = productStages.map((stage) => stage.id)
      affectedProductIds = [...new Set(productStages.map((stage) => stage.productId))]

      if (productStageIds.length > 0) {
        await tx.comment.deleteMany({
          where: {
            productStageId: { in: productStageIds },
          },
        })

        await tx.changeHistory.deleteMany({
          where: {
            productStageId: { in: productStageIds },
          },
        })

        await tx.productStage.deleteMany({
          where: {
            id: { in: productStageIds },
          },
        })

        for (const productId of affectedProductIds) {
          const remainingStages = await tx.productStage.findMany({
            where: { productId },
            orderBy: [{ stageOrder: 'asc' }, { createdAt: 'asc' }],
            select: { id: true },
          })

          for (const [index, remainingStage] of remainingStages.entries()) {
            await tx.productStage.update({
              where: { id: remainingStage.id },
              data: { stageOrder: index },
            })
          }
        }
      }

      await tx.stageTemplate.delete({
        where: { id },
      })

      const remainingTemplates = await tx.stageTemplate.findMany({
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      })

      for (const [index, remainingTemplate] of remainingTemplates.entries()) {
        await tx.stageTemplate.update({
          where: { id: remainingTemplate.id },
          data: { order: index },
        })
      }
    })

    await Promise.all(
      affectedProductIds.map(async (productId) => {
        await updateProductProgress(productId)
        await recalculateProductRisk(productId)
      })
    )

    const all = await prisma.stageTemplate.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })
    return NextResponse.json(all)
  } catch (error) {
    console.error('[stage-templates:delete] Failed to delete stage template', error)
    return NextResponse.json({ error: 'Не удалось удалить этап' }, { status: 500 })
  }
}

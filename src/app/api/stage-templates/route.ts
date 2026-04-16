import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recalculateProductRisk } from '@/lib/risk'
import { createProductStageCompat } from '@/lib/product-stage-compat'
import {
  supportsStageTemplateAffectsFinalDateColumn,
} from '@/lib/schema-compat'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { sanitizeDeepStrings, sanitizeTextValue } from '@/lib/input-security'

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

async function normalizeRemainingProductStages(
  tx: any,
  productId: string
) {
  const remainingStages = await tx.productStage.findMany({
    where: { productId },
    select: { id: true },
    orderBy: [{ stageOrder: 'asc' }, { createdAt: 'asc' }],
  })

  for (let index = 0; index < remainingStages.length; index += 1) {
    await tx.productStage.update({
      where: { id: remainingStages[index].id },
      data: { stageOrder: 1000000 + index },
      select: { id: true },
    })
  }

  for (let index = 0; index < remainingStages.length; index += 1) {
    await tx.productStage.update({
      where: { id: remainingStages[index].id },
      data: { stageOrder: index },
      select: { id: true },
    })
  }
}

async function normalizeRemainingProductTemplateStages(
  tx: any
) {
  const templateStages = await tx.productTemplateStage.findMany({
    select: {
      id: true,
      productTemplateId: true,
    },
    orderBy: [
      { productTemplateId: 'asc' },
      { stageOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  })

  const grouped = new Map<string, { id: string }[]>()
  for (const stage of templateStages) {
    const bucket = grouped.get(stage.productTemplateId) ?? []
    bucket.push({ id: stage.id })
    grouped.set(stage.productTemplateId, bucket)
  }

  for (const stages of grouped.values()) {
    for (let index = 0; index < stages.length; index += 1) {
      await tx.productTemplateStage.update({
        where: { id: stages[index].id },
        data: { stageOrder: 1000000 + index },
        select: { id: true },
      })
    }

    for (let index = 0; index < stages.length; index += 1) {
      await tx.productTemplateStage.update({
        where: { id: stages[index].id },
        data: { stageOrder: index },
        select: { id: true },
      })
    }
  }
}

async function normalizeRemainingStageTemplates(
  tx: any
) {
  const templates = await tx.stageTemplate.findMany({
    select: { id: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })

  for (let index = 0; index < templates.length; index += 1) {
    await tx.stageTemplate.update({
      where: { id: templates[index].id },
      data: { order: 1000000 + index },
      select: { id: true },
    })
  }

  for (let index = 0; index < templates.length; index += 1) {
    await tx.stageTemplate.update({
      where: { id: templates[index].id },
      data: { order: index },
      select: { id: true },
    })
  }
}

async function deleteRelatedStageRecords(
  tx: {
    comment: {
      deleteMany: (args: Record<string, unknown>) => Promise<unknown>
    }
    changeHistory: {
      deleteMany: (args: Record<string, unknown>) => Promise<unknown>
    }
  },
  productStageIds: string[]
) {
  if (productStageIds.length === 0) return

  const silentlyIgnoreMissingColumn = (error: unknown, columnName: string) => {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes(columnName) && (
      message.includes('does not exist') ||
      message.includes('Unknown argument') ||
      message.includes('Unknown field')
    )
  }

  try {
    await tx.comment.deleteMany({
      where: {
        productStageId: { in: productStageIds },
      },
    })
  } catch (error) {
    if (!silentlyIgnoreMissingColumn(error, 'productStageId')) {
      throw error
    }
  }

  try {
    await tx.changeHistory.deleteMany({
      where: {
        productStageId: { in: productStageIds },
      },
    })
  } catch (error) {
    if (!silentlyIgnoreMissingColumn(error, 'productStageId')) {
      throw error
    }
  }
}

// Create a new stage template
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = (session.user as any).id
  const createRateLimit = consumeRateLimit({
    key: `api:stage-templates:create:${userId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!createRateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(createRateLimit.retryAfterSeconds) } })
  }

  try {
    const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
    const name = sanitizeTextValue(body?.name, { maxLength: 160 })
    const durationText = sanitizeTextValue(body?.durationText, { maxLength: 160 }) || null
    const isCritical = body?.isCritical === true
    const hasStageTemplateAffectsFinalDateColumn = await supportsStageTemplateAffectsFinalDateColumn()

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const last = await tx.stageTemplate.findFirst({
        select: { order: true },
        orderBy: { order: 'desc' },
      })
      const newOrder = (last?.order ?? -1) + 1

      const template = hasStageTemplateAffectsFinalDateColumn
        ? await tx.stageTemplate.create({
            data: {
              name: name.trim(),
              order: newOrder,
              durationText,
              isCritical,
            },
            select: {
              id: true,
              name: true,
              order: true,
              durationText: true,
              durationDays: true,
              isCritical: true,
              affectsFinalDate: true,
              createdAt: true,
            },
          })
        : await tx.stageTemplate.create({
            data: {
              name: name.trim(),
              order: newOrder,
              durationText,
              isCritical,
            },
            select: {
              id: true,
              name: true,
              order: true,
              durationText: true,
              durationDays: true,
              isCritical: true,
              createdAt: true,
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

        const createdStage = await createProductStageCompat(tx as any, {
          productId: product.id,
          stageTemplateId: template.id,
          stageOrder: newOrder,
          stageName: template.name,
          isCritical: template.isCritical,
          affectsFinalDate: hasStageTemplateAffectsFinalDateColumn ? (template as any).affectsFinalDate ?? true : true,
          participatesInAutoshift: body?.participatesInAutoshift !== false,
          status: 'NOT_STARTED',
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

  const userId = (session.user as any).id
  const updateRateLimit = consumeRateLimit({
    key: `api:stage-templates:update:${userId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 30,
    windowMs: 60 * 1000,
  })
  if (!updateRateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(updateRateLimit.retryAfterSeconds) } })
  }

  const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
  const id = sanitizeTextValue(body?.id, { maxLength: 128 })
  const action = sanitizeTextValue(body?.action, { maxLength: 32 })
  const name = sanitizeTextValue(body?.name, { maxLength: 160 })
  const participatesInAutoshift = body?.participatesInAutoshift
  const hasStageTemplateAffectsFinalDateColumn = await supportsStageTemplateAffectsFinalDateColumn()

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const template = await prisma.stageTemplate.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      order: true,
    },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Rename
  if (action === 'rename' && name?.trim()) {
    await prisma.stageTemplate.update({
      where: { id },
      data: { name: name.trim() },
      select: { id: true },
    })

    // Update name in all product stages
    await prisma.productStage.updateMany({
      where: { stageTemplateId: id },
      data: { stageName: name.trim() },
    })

    return NextResponse.json({ ...template, name: name.trim(), participatesInAutoshift: true })
  }

  if (action === 'toggle-autoshift') {
    const nextValue = typeof participatesInAutoshift === 'boolean'
      ? participatesInAutoshift
      : true

    await prisma.productStage.updateMany({
      where: { stageTemplateId: id },
      data: { participatesInAutoshift: nextValue },
    })

    return NextResponse.json({ ...template, participatesInAutoshift: nextValue })
  }

  // Move left or right
  if (action === 'move-left' || action === 'move-right') {
    const direction = action === 'move-left' ? 'desc' : 'asc'
    const comparison = action === 'move-left'
      ? { order: { lt: template.order } }
      : { order: { gt: template.order } }

    const neighbor = await prisma.stageTemplate.findFirst({
      where: comparison,
      select: { id: true, order: true },
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
        select: { id: true },
      }),
      prisma.stageTemplate.update({
        where: { id: neighbor.id },
        data: { order: template.order },
        select: { id: true },
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

    const all = hasStageTemplateAffectsFinalDateColumn
      ? await prisma.stageTemplate.findMany({
          select: {
            id: true,
            name: true,
            order: true,
            durationText: true,
            durationDays: true,
            isCritical: true,
            affectsFinalDate: true,
            createdAt: true,
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
            createdAt: true,
          },
          orderBy: { order: 'asc' },
        })
    return NextResponse.json(all.map((stage) => ({ ...stage, participatesInAutoshift: true })))
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

  const userId = (session.user as any).id
  const deleteRateLimit = consumeRateLimit({
    key: `api:stage-templates:delete:${userId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!deleteRateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(deleteRateLimit.retryAfterSeconds) } })
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
        },
        select: {
          id: true,
          productId: true,
        },
      })
      const productStageIds = productStages.map((stage) => stage.id)
      affectedProductIds = [...new Set(productStages.map((stage) => stage.productId))]

      if (productStageIds.length > 0) {
        await deleteRelatedStageRecords(tx as any, productStageIds)

        await tx.productStage.deleteMany({
          where: {
            id: { in: productStageIds },
          },
        })

        for (const productId of affectedProductIds) {
          await normalizeRemainingProductStages(tx as any, productId)
        }
      }

      await tx.productTemplateStage.deleteMany({
        where: {
          stageTemplateId: id,
        },
      })

      await normalizeRemainingProductTemplateStages(tx as any)

      await tx.stageTemplate.delete({
        where: { id },
        select: { id: true },
      })

      await normalizeRemainingStageTemplates(tx as any)
    }, {
      timeout: 20000,
      maxWait: 10000,
    })

    await Promise.allSettled(
      affectedProductIds.map(async (productId) => {
        await updateProductProgress(productId)
        await recalculateProductRisk(productId)
      })
    )

    revalidatePath('/products')
    revalidatePath('/table')
    revalidatePath('/dashboard')
    revalidatePath('/timeline')
    revalidatePath('/archive')
    revalidatePath('/products/new')
    for (const productId of affectedProductIds) {
      revalidatePath(`/products/${productId}`)
    }

    const all = await prisma.stageTemplate.findMany({
      select: {
        id: true,
        name: true,
        order: true,
        durationText: true,
        isCritical: true,
        createdAt: true,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json(all.map((stage) => ({ ...stage, participatesInAutoshift: true })))
  } catch (error) {
    console.error('[stage-templates:delete] Failed to delete stage template', error)
    const details = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === 'production' ? 'Не удалось удалить этап' : details,
        details,
      },
      { status: 500 }
    )
  }
}

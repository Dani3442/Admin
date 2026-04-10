import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getFinalDateFromStages } from '@/lib/product-derived-fields'
import { getOverlapAcceptedMap } from '@/lib/overlap-acceptance'
import { supportsProductLifecycleColumns } from '@/lib/schema-compat'
import { getVisibleProductWhere } from '@/lib/product-access'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'

function getProductSelect(hasProductLifecycleColumns: boolean) {
  return {
    id: true,
    name: true,
    category: true,
    sku: true,
    country: true,
    competitorUrl: true,
    status: true,
    priority: true,
    finalDate: true,
    responsibleId: true,
    productTemplateId: true,
    riskScore: true,
    progressPercent: true,
    notes: true,
    sortOrder: true,
    isPinned: true,
    isFavorite: true,
    isArchived: true,
    createdAt: true,
    updatedAt: true,
    ...(hasProductLifecycleColumns
      ? {
          closedAt: true,
          closedById: true,
          closureComment: true,
          archivedAt: true,
          archivedById: true,
          archiveReason: true,
          closedBy: { select: { id: true, name: true } },
          archivedBy: { select: { id: true, name: true } },
        }
      : {}),
    responsible: { select: { id: true, name: true } },
    stages: {
      orderBy: { stageOrder: 'asc' as const },
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
          select: {
            id: true,
            name: true,
            order: true,
            durationText: true,
            durationDays: true,
            isCritical: true,
            affectsFinalDate: true,
          },
        },
        responsible: { select: { id: true, name: true } },
        comments: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' as const },
        },
      },
    },
    comments: {
      where: { productStageId: null },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' as const },
    },
    automations: true,
    changeHistory: {
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' as const },
      take: 50,
    },
    _count: { select: { comments: true } },
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const viewer = session.user as any
  const hasProductLifecycleColumns = await supportsProductLifecycleColumns()

  const product = await prisma.product.findFirst({
    where: getVisibleProductWhere(viewer, { id }),
    select: getProductSelect(hasProductLifecycleColumns),
  })

  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const overlapAcceptedById = await getOverlapAcceptedMap(id)

  return NextResponse.json({
    ...product,
    closedAt: hasProductLifecycleColumns ? (product as any).closedAt ?? null : null,
    closedById: hasProductLifecycleColumns ? (product as any).closedById ?? null : null,
    closureComment: hasProductLifecycleColumns ? (product as any).closureComment ?? null : null,
    archivedAt: hasProductLifecycleColumns ? (product as any).archivedAt ?? null : null,
    archivedById: hasProductLifecycleColumns ? (product as any).archivedById ?? null : null,
    archiveReason: hasProductLifecycleColumns ? (product as any).archiveReason ?? null : null,
    closedBy: hasProductLifecycleColumns ? (product as any).closedBy ?? null : null,
    archivedBy: hasProductLifecycleColumns ? (product as any).archivedBy ?? null : null,
    finalDate: getFinalDateFromStages(product.stages),
    stages: product.stages.map((stage) => ({
      ...stage,
      overlapAccepted: overlapAcceptedById.get(stage.id) ?? false,
    })),
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  const role = user.role

  if (!hasPermission(role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existingProduct = await prisma.product.findFirst({
    where: getVisibleProductWhere(user, { id }),
    select: { id: true },
  })
  if (!existingProduct) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const rateLimit = consumeRateLimit({
    key: `api:products:update:${user.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 60,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const body = await req.json()
  const action = body?.action as 'close' | 'archive' | 'restore' | undefined
  const hasProductLifecycleColumns = await supportsProductLifecycleColumns()

  if (action === 'close') {
    if (!hasProductLifecycleColumns) {
      return NextResponse.json({ error: 'Для закрытия продукта нужно применить обновление схемы базы данных' }, { status: 409 })
    }
    if (!['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const nextStatus = body?.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED'
    const closureComment = typeof body?.closureComment === 'string' ? body.closureComment.trim() : ''

    const product = await prisma.product.update({
      where: { id },
      data: {
        status: nextStatus,
        closedAt: new Date(),
        closedById: user.id,
        closureComment: closureComment || null,
      },
      include: {
        responsible: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        archivedBy: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    })

    await prisma.changeHistory.create({
      data: {
        productId: id,
        field: 'productClosed',
        oldValue: null,
        newValue: nextStatus,
        changedById: user.id,
        reason: closureComment || 'Продукт закрыт',
      },
    })

    return NextResponse.json(product)
  }

  if (action === 'archive') {
    if (!hasProductLifecycleColumns) {
      return NextResponse.json({ error: 'Для архивации продукта нужно применить обновление схемы базы данных' }, { status: 409 })
    }
    if (!['ADMIN', 'DIRECTOR'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const archiveReason = typeof body?.archiveReason === 'string' ? body.archiveReason.trim() : ''

    const product = await prisma.product.update({
      where: { id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedById: user.id,
        archiveReason: archiveReason || null,
      },
      include: {
        responsible: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        archivedBy: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    })

    await prisma.changeHistory.create({
      data: {
        productId: id,
        field: 'productArchived',
        oldValue: 'false',
        newValue: 'true',
        changedById: user.id,
        reason: archiveReason || 'Продукт отправлен в архив',
      },
    })

    return NextResponse.json(product)
  }

  if (action === 'restore') {
    if (!hasProductLifecycleColumns) {
      return NextResponse.json({ error: 'Для восстановления продукта нужно применить обновление схемы базы данных' }, { status: 409 })
    }
    if (!['ADMIN', 'DIRECTOR'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        isArchived: false,
        archivedAt: null,
        archivedById: null,
        archiveReason: null,
      },
      include: {
        responsible: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        archivedBy: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    })

    await prisma.changeHistory.create({
      data: {
        productId: id,
        field: 'productRestored',
        oldValue: 'true',
        newValue: 'false',
        changedById: user.id,
        reason: 'Продукт восстановлен из архива',
      },
    })

    return NextResponse.json(product)
  }

  const allowedFields = new Set([
    'name',
    'country',
    'category',
    'sku',
    'competitorUrl',
    'status',
    'priority',
    'finalDate',
    'responsibleId',
    'notes',
    'isPinned',
    'isFavorite',
  ])
  const data = Object.fromEntries(
    Object.entries(body).filter(([key]) => allowedFields.has(key))
  )

  if ('responsibleId' in data && data.responsibleId === '') {
    data.responsibleId = null
  }

  if ('finalDate' in data && data.finalDate) {
    data.finalDate = new Date(data.finalDate as string)
  }

  const product = await prisma.product.update({
    where: { id },
    data,
    include: {
      responsible: true,
      ...(hasProductLifecycleColumns
        ? {
            closedBy: { select: { id: true, name: true, email: true } },
            archivedBy: { select: { id: true, name: true, email: true } },
          }
        : {}),
      _count: { select: { comments: true } },
    },
  })

  await prisma.changeHistory.create({
    data: {
      productId: id,
      field: Object.keys(data).join(', '),
      newValue: JSON.stringify(data),
      changedById: (session.user as any).id,
    },
  })

  return NextResponse.json(product)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  const role = user.role
  if (!['ADMIN', 'DIRECTOR'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const rateLimit = consumeRateLimit({
    key: `api:products:delete:${user.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }
  const hasProductLifecycleColumns = await supportsProductLifecycleColumns()
  const existingProduct = await prisma.product.findFirst({
    where: getVisibleProductWhere(user, { id }),
    select: { id: true, isArchived: true },
  })

  if (!existingProduct) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!hasProductLifecycleColumns) {
    return NextResponse.json({ error: 'Для архивации продукта нужно применить обновление схемы базы данных' }, { status: 409 })
  }

  if (existingProduct.isArchived) {
    await prisma.product.delete({
      where: { id },
    })

    return NextResponse.json({ success: true, deleted: true })
  }

  await prisma.product.update({
    where: { id },
    data: {
      isArchived: true,
      archivedAt: new Date(),
      archivedById: user.id,
      archiveReason: 'Архивировано через удаление продукта',
    },
  })

  await prisma.changeHistory.create({
    data: {
      productId: id,
      field: 'productArchived',
      oldValue: 'false',
      newValue: 'true',
      changedById: user.id,
      reason: 'Архивировано через удаление продукта',
    },
  })

  return NextResponse.json({ success: true })
}

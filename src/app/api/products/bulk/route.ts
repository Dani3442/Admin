import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { supportsProductLifecycleColumns } from '@/lib/schema-compat'

function getValidatedIds(body: any) {
  return Array.isArray(body?.ids)
    ? body.ids.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
    : []
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!['ADMIN', 'DIRECTOR'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const hasProductLifecycleColumns = await supportsProductLifecycleColumns()
  if (!hasProductLifecycleColumns) {
    return NextResponse.json({ error: 'Для работы с архивом нужно применить обновление схемы базы данных' }, { status: 409 })
  }

  const body = await req.json().catch(() => null)
  const action = body?.action as 'restore' | 'deleteArchived' | undefined
  const ids = getValidatedIds(body)

  if (!action) {
    return NextResponse.json({ error: 'Не указано bulk-действие' }, { status: 400 })
  }

  if (!ids.length) {
    return NextResponse.json({ error: 'Не выбраны продукты' }, { status: 400 })
  }

  const archivedProducts = await prisma.product.findMany({
    where: {
      id: { in: ids },
      isArchived: true,
    },
    select: { id: true, name: true },
  })

  if (!archivedProducts.length) {
    return NextResponse.json({ error: 'Архивные продукты не найдены' }, { status: 404 })
  }

  const archivedIds = archivedProducts.map((product) => product.id)

  if (action === 'restore') {
    await prisma.$transaction([
      prisma.product.updateMany({
        where: { id: { in: archivedIds } },
        data: {
          isArchived: false,
          archivedAt: null,
          archivedById: null,
          archiveReason: null,
        },
      }),
      prisma.changeHistory.createMany({
        data: archivedIds.map((productId) => ({
          productId,
          field: 'productRestored',
          oldValue: 'true',
          newValue: 'false',
          changedById: user.id,
          reason: 'Продукт восстановлен из архива',
        })),
      }),
    ])

    return NextResponse.json({
      success: true,
      action,
      affectedIds: archivedIds,
    })
  }

  if (action === 'deleteArchived') {
    await prisma.product.deleteMany({
      where: {
        id: { in: archivedIds },
        isArchived: true,
      },
    })

    return NextResponse.json({
      success: true,
      action,
      affectedIds: archivedIds,
    })
  }

  return NextResponse.json({ error: 'Неподдерживаемое bulk-действие' }, { status: 400 })
}

import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      responsible: { select: { id: true, name: true, email: true } },
      stages: {
        orderBy: { stageOrder: 'asc' },
        include: {
          stageTemplate: true,
          responsible: { select: { id: true, name: true } },
          comments: {
            include: { author: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
      comments: {
        where: { productStageId: null },
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      automations: true,
      changeHistory: {
        include: { changedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      _count: { select: { comments: true } },
    },
  })

  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(product)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
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
    include: { responsible: true, _count: { select: { comments: true } } },
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
  const role = (session.user as any).role
  if (!['ADMIN', 'DIRECTOR'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.product.update({
    where: { id },
    data: { isArchived: true },
  })

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const product = await prisma.product.findUnique({
    where: { id: params.id },
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const product = await prisma.product.update({
    where: { id: params.id },
    data: body,
    include: { responsible: true, _count: { select: { comments: true } } },
  })

  await prisma.changeHistory.create({
    data: {
      productId: params.id,
      field: Object.keys(body).join(', '),
      newValue: JSON.stringify(body),
      changedById: (session.user as any).id,
    },
  })

  return NextResponse.json(product)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  if (!['ADMIN', 'DIRECTOR'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.product.update({
    where: { id: params.id },
    data: { isArchived: true },
  })

  return NextResponse.json({ success: true })
}

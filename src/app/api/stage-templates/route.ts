import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Create a new stage template
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, durationText, isCritical = false } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  // Get max order
  const last = await prisma.stageTemplate.findFirst({ orderBy: { order: 'desc' } })
  const newOrder = (last?.order ?? 0) + 1

  const template = await prisma.stageTemplate.create({
    data: {
      name: name.trim(),
      order: newOrder,
      durationText: durationText || null,
      isCritical,
    },
  })

  // Add this stage to all existing non-archived products
  const products = await prisma.product.findMany({
    where: { isArchived: false },
    select: { id: true },
  })

  if (products.length > 0) {
    await prisma.productStage.createMany({
      data: products.map((p) => ({
        productId: p.id,
        stageTemplateId: template.id,
        stageOrder: newOrder,
        stageName: template.name,
        isCritical: template.isCritical,
        affectsFinalDate: template.affectsFinalDate,
        participatesInAutoshift: template.participatesInAutoshift,
      })),
    })
  }

  return NextResponse.json(template, { status: 201 })
}

// Rename or reorder stage templates
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, action, name } = body

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

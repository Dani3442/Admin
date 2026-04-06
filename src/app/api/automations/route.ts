import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureDefaultShiftFollowingAutomation } from '@/lib/automation'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.MANAGE_AUTOMATIONS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const productId = searchParams.get('productId')

  await ensureDefaultShiftFollowingAutomation()
  const automations = await prisma.automation.findMany({
    where: productId ? { OR: [{ productId }, { isTemplate: true }] } : { isTemplate: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(automations)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.MANAGE_AUTOMATIONS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, description, productId, actionType, config, excludeStageOrders, isActive } = body

  const automation = await prisma.automation.create({
    data: {
      name,
      description,
      productId: productId || null,
      isTemplate: !productId,
      actionType,
      config: typeof config === 'object' ? JSON.stringify(config) : (config || '{}'),
      excludeStageOrders: JSON.stringify(excludeStageOrders || []),
      isActive: isActive ?? true,
    },
  })

  return NextResponse.json(automation, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.MANAGE_AUTOMATIONS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, ...updates } = body

  const automation = await prisma.automation.update({
    where: { id },
    data: updates,
  })

  return NextResponse.json(automation)
}

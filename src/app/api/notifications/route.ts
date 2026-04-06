import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)

  const [recentChanges, overdueStages, riskProducts] = await Promise.all([
    // Recent changes (last 7 days)
    prisma.changeHistory.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      include: {
        changedBy: { select: { name: true } },
        product: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),

    // Overdue stages (date in the past, not completed)
    prisma.productStage.findMany({
      where: {
        isCompleted: false,
        dateValue: { lt: now },
        product: { isArchived: false, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      },
      include: {
        product: { select: { id: true, name: true } },
      },
      orderBy: { dateValue: 'asc' },
      take: 10,
    }),

    // Products at risk or delayed
    prisma.product.findMany({
      where: {
        isArchived: false,
        status: { in: ['AT_RISK', 'DELAYED'] },
      },
      select: { id: true, name: true, status: true, riskScore: true, finalDate: true },
      orderBy: { riskScore: 'desc' },
      take: 5,
    }),
  ])

  const notifications: Array<{
    id: string
    type: 'change' | 'overdue' | 'risk'
    title: string
    description: string
    productId: string | null
    createdAt: string
  }> = []

  // Map overdue stages
  for (const stage of overdueStages) {
    const daysLate = Math.round((now.getTime() - stage.dateValue!.getTime()) / 86400000)
    notifications.push({
      id: `overdue-${stage.id}`,
      type: 'overdue',
      title: `Просрочен: ${stage.stageName}`,
      description: `${stage.product.name} — ${daysLate} дн. назад`,
      productId: stage.product.id,
      createdAt: stage.dateValue!.toISOString(),
    })
  }

  // Map risk products
  for (const product of riskProducts) {
    notifications.push({
      id: `risk-${product.id}`,
      type: 'risk',
      title: product.status === 'DELAYED' ? 'Задержка' : 'Под риском',
      description: `${product.name} (риск: ${product.riskScore}/100)`,
      productId: product.id,
      createdAt: now.toISOString(),
    })
  }

  // Map recent changes
  for (const change of recentChanges) {
    notifications.push({
      id: `change-${change.id}`,
      type: 'change',
      title: `${change.changedBy.name} изменил(а) ${change.field}`,
      description: change.product.name,
      productId: change.product.id,
      createdAt: change.createdAt.toISOString(),
    })
  }

  // Sort by priority: overdue first, then risk, then changes
  const priorityOrder = { overdue: 0, risk: 1, change: 2 }
  notifications.sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type])

  return NextResponse.json({
    notifications: notifications.slice(0, 20),
    counts: {
      overdue: overdueStages.length,
      risk: riskProducts.length,
      changes: recentChanges.length,
      total: overdueStages.length + riskProducts.length + recentChanges.length,
    },
  })
}

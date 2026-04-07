import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCommentDisplayText } from '@/lib/comment-mentions'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const currentUserId = (session.user as any).id as string

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)

  const mentionToken = `](${currentUserId})`

  const [recentChanges, overdueStages, riskProducts, recentMentions] = await Promise.all([
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
      select: {
        id: true,
        stageName: true,
        dateValue: true,
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

    prisma.comment.findMany({
      where: {
        authorId: { not: currentUserId },
        createdAt: { gte: sevenDaysAgo },
        content: { contains: mentionToken },
      },
      include: {
        author: { select: { id: true, name: true, lastName: true } },
        product: { select: { id: true, name: true } },
        productStage: { select: { stageName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ])

  const notifications: Array<{
    id: string
    type: 'mention' | 'change' | 'overdue' | 'risk'
    title: string
    description: string
    productId: string | null
    createdAt: string
    href?: string | null
  }> = []

  for (const comment of recentMentions) {
    notifications.push({
      id: `mention-${comment.id}`,
      type: 'mention',
      title: `Вас отметил(а) ${[comment.author.name, comment.author.lastName].filter(Boolean).join(' ') || comment.author.name}`,
      description: `${comment.product.name}${comment.productStage?.stageName ? ` · ${comment.productStage.stageName}` : ''} · ${getCommentDisplayText(comment.content).slice(0, 90)}`,
      productId: comment.product.id,
      createdAt: comment.createdAt.toISOString(),
      href: `/products/${comment.product.id}?tab=comments`,
    })
  }

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
  const priorityOrder = { mention: 0, overdue: 1, risk: 2, change: 3 }
  notifications.sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type])

  return NextResponse.json({
    notifications: notifications.slice(0, 20),
    counts: {
      mentions: recentMentions.length,
      overdue: overdueStages.length,
      risk: riskProducts.length,
      changes: recentChanges.length,
      total: recentMentions.length + overdueStages.length + riskProducts.length + recentChanges.length,
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCommentDisplayText } from '@/lib/comment-mentions'
import { getVisibleProductWhere } from '@/lib/product-access'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'

async function getNotificationData(currentUserId: string, viewer: { id?: string | null; role?: string | null }) {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
  const mentionToken = `](${currentUserId})`
  const visibleProductWhere = getVisibleProductWhere(viewer)

  const [recentChanges, overdueStages, riskProducts, recentMentions, notificationSeenEntries] = await Promise.all([
    prisma.changeHistory.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        field: { notIn: ['notificationsSeenAt', 'mentionsSeenAt'] },
        product: visibleProductWhere,
      },
      include: {
        changedBy: { select: { name: true } },
        product: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),

    prisma.productStage.findMany({
      where: {
        isCompleted: false,
        dateValue: { lt: now },
        product: getVisibleProductWhere(viewer, {
          isArchived: false,
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        }),
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

    prisma.product.findMany({
      where: {
        ...getVisibleProductWhere(viewer, {
          isArchived: false,
          status: { in: ['AT_RISK', 'DELAYED'] },
        }),
      },
      select: { id: true, name: true, status: true, riskScore: true, finalDate: true, updatedAt: true },
      orderBy: { riskScore: 'desc' },
      take: 5,
    }),

    prisma.comment.findMany({
      where: {
        authorId: { not: currentUserId },
        createdAt: { gte: sevenDaysAgo },
        content: { contains: mentionToken },
        product: visibleProductWhere,
      },
      include: {
        author: { select: { id: true, name: true, lastName: true } },
        product: { select: { id: true, name: true } },
        productStage: { select: { stageName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),

    prisma.changeHistory.findMany({
      where: {
        changedById: currentUserId,
        field: 'notificationsSeenAt',
        product: visibleProductWhere,
      },
      select: {
        productId: true,
        newValue: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const seenAtByProductId = new Map<string, Date>()
  for (const entry of notificationSeenEntries) {
    if (!entry.productId || seenAtByProductId.has(entry.productId)) continue
    const parsed = entry.newValue ? new Date(entry.newValue) : entry.createdAt
    if (!Number.isNaN(parsed.getTime())) {
      seenAtByProductId.set(entry.productId, parsed)
    }
  }

  const isUnread = (productId: string | null, createdAt: Date) => {
    if (!productId) return true
    const seenAt = seenAtByProductId.get(productId)
    return !seenAt || createdAt > seenAt
  }

  return {
    now,
    recentChanges,
    overdueStages,
    riskProducts,
    recentMentions,
    isUnread,
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const currentUserId = (session.user as any).id as string
  const viewer = session.user as any

  const readRateLimit = consumeRateLimit({
    key: `api:notifications:read:${currentUserId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 120,
    windowMs: 60 * 1000,
  })
  if (!readRateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(readRateLimit.retryAfterSeconds) } })
  }

  const { now, recentChanges, overdueStages, riskProducts, recentMentions, isUnread } = await getNotificationData(currentUserId, viewer)

  const unreadMentions = recentMentions.filter((comment) => isUnread(comment.product.id, comment.createdAt))
  const unreadOverdueStages = overdueStages.filter((stage) => isUnread(stage.product.id, stage.dateValue!))
  const unreadRiskProducts = riskProducts.filter((product) => isUnread(product.id, product.updatedAt))
  const unreadChanges = recentChanges.filter((change) => isUnread(change.product.id, change.createdAt))

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
      createdAt: product.updatedAt.toISOString(),
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
      mentions: unreadMentions.length,
      overdue: unreadOverdueStages.length,
      risk: unreadRiskProducts.length,
      changes: unreadChanges.length,
      total: unreadMentions.length + unreadOverdueStages.length + unreadRiskProducts.length + unreadChanges.length,
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const currentUserId = (session.user as any).id as string
  const viewer = session.user as any

  const writeRateLimit = consumeRateLimit({
    key: `api:notifications:write:${currentUserId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 60,
    windowMs: 60 * 1000,
  })
  if (!writeRateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(writeRateLimit.retryAfterSeconds) } })
  }

  const { now, recentChanges, overdueStages, riskProducts, recentMentions, isUnread } = await getNotificationData(currentUserId, viewer)

  const productIds = new Set<string>()

  for (const comment of recentMentions) {
    if (isUnread(comment.product.id, comment.createdAt)) {
      productIds.add(comment.product.id)
    }
  }

  for (const stage of overdueStages) {
    if (isUnread(stage.product.id, stage.dateValue!)) {
      productIds.add(stage.product.id)
    }
  }

  for (const product of riskProducts) {
    if (isUnread(product.id, product.updatedAt)) {
      productIds.add(product.id)
    }
  }

  for (const change of recentChanges) {
    if (isUnread(change.product.id, change.createdAt)) {
      productIds.add(change.product.id)
    }
  }

  const ids = Array.from(productIds)

  if (ids.length === 0) {
    return NextResponse.json({ success: true, updated: 0 })
  }

  await prisma.$transaction([
    prisma.changeHistory.deleteMany({
      where: {
        changedById: currentUserId,
        field: 'notificationsSeenAt',
        productId: { in: ids },
      },
    }),
    prisma.changeHistory.createMany({
      data: ids.map((productId) => ({
        productId,
        field: 'notificationsSeenAt',
        newValue: now.toISOString(),
        changedById: currentUserId,
      })),
    }),
  ])

  return NextResponse.json({ success: true, updated: ids.length })
}

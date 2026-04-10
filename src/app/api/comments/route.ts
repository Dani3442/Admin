import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCommentDisplayText } from '@/lib/comment-mentions'
import { getVisibleProductWhere } from '@/lib/product-access'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const currentUserId = (session.user as any).id as string

  const productId = req.nextUrl.searchParams.get('productId')
  if (!productId) {
    return NextResponse.json({ error: 'Missing productId' }, { status: 400 })
  }

  if (req.nextUrl.searchParams.get('markSeen') === '1') {
    await prisma.$transaction([
      prisma.changeHistory.deleteMany({
        where: {
          productId,
          changedById: currentUserId,
          field: 'mentionsSeenAt',
        },
      }),
      prisma.changeHistory.create({
        data: {
          productId,
          field: 'mentionsSeenAt',
          newValue: new Date().toISOString(),
          changedById: currentUserId,
        },
      }),
    ])
  }

  const visibleProduct = await prisma.product.findFirst({
    where: getVisibleProductWhere(session.user as any, { id: productId }),
    select: { id: true },
  })

  if (!visibleProduct) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const comments = await prisma.comment.findMany({
    where: { productId, productStageId: null },
    include: {
      author: { select: { id: true, name: true, lastName: true, avatar: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    comments: comments.map((comment) => ({
      ...comment,
      displayContent: getCommentDisplayText(comment.content),
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const viewer = session.user as any
  if (!hasPermission(viewer.role, Permission.ADD_COMMENTS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { content, productId, productStageId } = body

  if (!content?.trim() || !productId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const rateLimit = consumeRateLimit({
    key: `api:comments:create:${viewer.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 30,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const visibleProduct = await prisma.product.findFirst({
    where: getVisibleProductWhere(viewer, { id: productId }),
    select: { id: true },
  })
  if (!visibleProduct) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (productStageId) {
    const stage = await prisma.productStage.findFirst({
      where: {
        id: productStageId,
        productId,
      },
      select: { id: true },
    })

    if (!stage) {
      return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
    }
  }

  const comment = await prisma.comment.create({
    data: {
      content: content.trim(),
      authorId: (session.user as any).id,
      productId,
      productStageId: productStageId || null,
    },
    include: {
      author: { select: { id: true, name: true, lastName: true, avatar: true } },
    },
  })

  return NextResponse.json(
    {
      ...comment,
      displayContent: getCommentDisplayText(comment.content),
    },
    { status: 201 }
  )
}

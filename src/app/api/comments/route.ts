import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCommentDisplayText } from '@/lib/comment-mentions'

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

  const body = await req.json()
  const { content, productId, productStageId } = body

  if (!content?.trim() || !productId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

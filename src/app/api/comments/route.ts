import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
      author: { select: { id: true, name: true } },
    },
  })

  return NextResponse.json(comment, { status: 201 })
}

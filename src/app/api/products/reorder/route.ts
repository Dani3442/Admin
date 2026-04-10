import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = (session.user as any).id
  const rateLimit = consumeRateLimit({
    key: `api:products:reorder:${userId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  try {
    const body = await req.json()
    const orderedIds = Array.isArray(body?.orderedIds)
      ? body.orderedIds.filter((id: unknown): id is string => typeof id === 'string')
      : []

    if (!orderedIds.length) {
      return NextResponse.json({ error: 'Не передан порядок продуктов' }, { status: 400 })
    }

    const existingProducts = await prisma.product.findMany({
      where: { isArchived: false },
      select: { id: true, sortOrder: true },
      orderBy: [{ isPinned: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    const existingIds = new Set(existingProducts.map((product) => product.id))
    if (orderedIds.some((id: string) => !existingIds.has(id))) {
      return NextResponse.json({ error: 'Передан неизвестный продукт' }, { status: 400 })
    }

    const missingIds = existingProducts
      .map((product) => product.id)
      .filter((id: string) => !orderedIds.includes(id))

    const finalOrderedIds = [...orderedIds, ...missingIds]

    await prisma.$transaction(
      finalOrderedIds.map((id, index) =>
        prisma.product.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[products:reorder] Failed to reorder products', error)
    return NextResponse.json({ error: 'Не удалось сохранить порядок продуктов' }, { status: 500 })
  }
}

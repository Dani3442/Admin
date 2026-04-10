import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeAvatarValue, selfProfileSchema, userProfileSelect } from '@/lib/user-profile'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'

export async function GET() {
  const session = await auth()
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: userProfileSelect,
  })

  if (!profile) {
    return NextResponse.json({ error: 'Профиль не найден' }, { status: 404 })
  }

  return NextResponse.json(profile)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  const userId = (session?.user as any)?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rateLimit = consumeRateLimit({
    key: `api:profile:update:${userId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  try {
    const body = await req.json()
    const parsed = selfProfileSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Некорректные данные профиля' }, { status: 400 })
    }

    const profile = await prisma.user.update({
      where: { id: userId },
      data: {
        name: parsed.data.name,
        lastName: parsed.data.lastName,
        jobTitle: parsed.data.jobTitle,
        avatar: normalizeAvatarValue(parsed.data.avatar),
      },
      select: userProfileSelect,
    })

    return NextResponse.json(profile)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось обновить профиль' }, { status: 500 })
  }
}

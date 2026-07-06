import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { sanitizeDeepStrings, sanitizeTextValue } from '@/lib/input-security'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as any).id
  const rateLimit = consumeRateLimit({
    key: `api:telegram-recipients:list:${userId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 120,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const recipients = await prisma.telegramRecipient.findMany({
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          lastName: true,
          telegramConnectionStatus: true,
          telegramConnectedAt: true,
        },
      },
    },
  })

  return NextResponse.json({ recipients })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!hasPermission(user.role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rateLimit = consumeRateLimit({
    key: `api:telegram-recipients:create:${user.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 40,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
  const type = body?.type === 'chat' ? 'chat' : 'user'
  const name = sanitizeTextValue(body?.name, { maxLength: 120 })
  const telegramId = sanitizeTextValue(body?.telegramId, { maxLength: 80 }) || null
  const telegramUsername = sanitizeTextValue(body?.telegramUsername, { maxLength: 80 }) || null
  const chatId = sanitizeTextValue(body?.chatId, { maxLength: 80 }) || null
  const linkedUserId = sanitizeTextValue(body?.userId, { maxLength: 128 }) || null

  if (!name) {
    return NextResponse.json({ error: 'Укажите имя получателя' }, { status: 400 })
  }

  if (type === 'chat' && !chatId && !telegramId) {
    return NextResponse.json({ error: 'Для чата укажите chat_id' }, { status: 400 })
  }

  if (type === 'user' && !telegramId && !chatId) {
    return NextResponse.json({ error: 'Для пользователя укажите Telegram ID' }, { status: 400 })
  }

  const recipient = await prisma.$transaction(async (tx) => {
    const created = await tx.telegramRecipient.create({
      data: {
        type,
        name,
        telegramId,
        telegramUsername,
        chatId,
        userId: linkedUserId,
      },
    })

    if (linkedUserId && type === 'user') {
      await tx.user.update({
        where: { id: linkedUserId },
        data: {
          telegramId,
          telegramUsername,
          telegramChatId: chatId,
          telegramConnectionStatus: 'CONNECTED',
          telegramConnectedAt: new Date(),
        },
      })
    }

    return created
  })

  return NextResponse.json({ recipient }, { status: 201 })
}

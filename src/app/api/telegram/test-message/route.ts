import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { sanitizeDeepStrings, sanitizeTextValue } from '@/lib/input-security'
import { getTelegramRecipientChatId, sendTelegramMessage } from '@/lib/telegram'

function getFriendlyTelegramError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Не удалось отправить тестовое сообщение'

  if (/chat not found/i.test(message)) {
    return 'Telegram не нашёл чат. Откройте бота в Telegram, нажмите Start и повторите тест.'
  }

  if (/bot was blocked/i.test(message)) {
    return 'Бот заблокирован у получателя. Разблокируйте бота и повторите тест.'
  }

  if (/TELEGRAM_BOT_TOKEN/i.test(message)) {
    return 'TELEGRAM_BOT_TOKEN не задан для сервера.'
  }

  return message
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!hasPermission(user.role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rateLimit = consumeRateLimit({
    key: `api:telegram-test:send:${user.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
  const recipientId = sanitizeTextValue(body?.recipientId, { maxLength: 128 })
  const settingId = sanitizeTextValue(body?.settingId, { maxLength: 128 }) || null
  const message = sanitizeTextValue(body?.message, { preserveNewlines: true, maxLength: 2000 })

  if (!recipientId) {
    return NextResponse.json({ error: 'Выберите Telegram-получателя' }, { status: 400 })
  }

  if (!message) {
    return NextResponse.json({ error: 'Текст тестового сообщения пустой' }, { status: 400 })
  }

  const recipient = await prisma.telegramRecipient.findUnique({
    where: { id: recipientId },
    select: {
      id: true,
      type: true,
      name: true,
      telegramId: true,
      chatId: true,
    },
  })

  if (!recipient) {
    return NextResponse.json({ error: 'Telegram-получатель не найден' }, { status: 404 })
  }

  const chatId = getTelegramRecipientChatId(recipient)
  if (!chatId) {
    return NextResponse.json({ error: 'У получателя не указан Telegram ID или chat_id' }, { status: 400 })
  }

  try {
    await sendTelegramMessage(chatId, message)

    const setting = settingId
      ? await prisma.telegramNotificationSetting.update({
          where: { id: settingId },
          data: { lastError: null },
          include: { recipient: true },
        })
      : null

    return NextResponse.json({ ok: true, setting })
  } catch (error) {
    const friendlyError = getFriendlyTelegramError(error)
    const setting = settingId
      ? await prisma.telegramNotificationSetting.update({
          where: { id: settingId },
          data: { lastError: friendlyError },
          include: { recipient: true },
        }).catch(() => null)
      : null

    return NextResponse.json({ error: friendlyError, setting }, { status: 400 })
  }
}

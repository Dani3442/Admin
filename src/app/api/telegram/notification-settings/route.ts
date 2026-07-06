import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { sanitizeDeepStrings, sanitizeTextValue } from '@/lib/input-security'
import { TELEGRAM_EVENT_TYPES } from '@/lib/telegram'

function getSettingInclude() {
  return {
    recipient: true,
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!hasPermission(user.role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rateLimit = consumeRateLimit({
    key: `api:telegram-settings:save:${user.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 60,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
  const id = sanitizeTextValue(body?.id, { maxLength: 128 }) || null
  const productId = sanitizeTextValue(body?.productId, { maxLength: 128 })
  const stageId = sanitizeTextValue(body?.stageId, { maxLength: 128 }) || null
  const subStageId = sanitizeTextValue(body?.subStageId, { maxLength: 128 }) || null
  const eventType = sanitizeTextValue(body?.eventType, { maxLength: 80 })
  const recipientType = body?.recipientType === 'chat' ? 'chat' : 'user'
  const recipientId = sanitizeTextValue(body?.recipientId, { maxLength: 128 }) || null
  const messageTemplate = sanitizeTextValue(body?.messageTemplate, { maxLength: 120 }) || null
  const customMessage = sanitizeTextValue(body?.customMessage, { preserveNewlines: true, maxLength: 2000 }) || null
  const isEnabled = Boolean(body?.isEnabled)

  if (!productId || (!stageId && !subStageId)) {
    return NextResponse.json({ error: 'Укажите продукт и этап или подэтап' }, { status: 400 })
  }

  if (!TELEGRAM_EVENT_TYPES.includes(eventType as any)) {
    return NextResponse.json({ error: 'Неизвестное событие уведомления' }, { status: 400 })
  }

  if ((eventType === 'stage_completed' || eventType === 'stage_started') && !stageId) {
    return NextResponse.json({ error: 'Для уведомления этапа нужен этап' }, { status: 400 })
  }

  if (eventType === 'substage_completed' && !subStageId) {
    return NextResponse.json({ error: 'Для уведомления о завершении подэтапа нужен подэтап' }, { status: 400 })
  }

  if (isEnabled && !recipientId) {
    return NextResponse.json({ error: 'Выберите Telegram-получателя перед включением уведомления' }, { status: 400 })
  }

  if (recipientId) {
    const recipient = await prisma.telegramRecipient.findUnique({ where: { id: recipientId }, select: { id: true } })
    if (!recipient) {
      return NextResponse.json({ error: 'Telegram-получатель не найден' }, { status: 404 })
    }
  }

  const existing = id
    ? await prisma.telegramNotificationSetting.findUnique({ where: { id } })
    : await prisma.telegramNotificationSetting.findFirst({
        where: {
          productId,
          stageId: stageId || null,
          subStageId: subStageId || null,
          eventType,
        },
      })
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { productTemplateId: true },
  })

  const data = {
    productId,
    stageId,
    subStageId,
    templateSettingId: existing?.templateSettingId ?? null,
    isOverride: Boolean(existing?.templateSettingId || existing?.isOverride || product?.productTemplateId),
    eventType,
    recipientType,
    recipientId,
    messageTemplate,
    customMessage,
    isEnabled,
    sentAt: isEnabled ? existing?.sentAt ?? null : null,
    lastError: null,
  }

  const setting = existing
    ? await prisma.telegramNotificationSetting.update({
        where: { id: existing.id },
        data,
        include: getSettingInclude(),
      })
    : await prisma.telegramNotificationSetting.create({
        data,
        include: getSettingInclude(),
      })

  revalidatePath('/products')
  revalidatePath(`/products/${productId}`)

  return NextResponse.json({ setting })
}

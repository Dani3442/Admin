import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { sanitizeDeepStrings, sanitizeTextValue } from '@/lib/input-security'
import { dispatchTelegramNotifications } from '@/lib/telegram'
import { completeStageIfAllSubStagesDone } from '@/lib/stage-workflow'
import { recalculateProductDerivedFields } from '@/lib/product-derived-fields'
import { recalculateProductRisk } from '@/lib/risk'

const SUBSTAGE_UPDATE_FIELDS = new Set(['name', 'description', 'responsibleId', 'status', 'startDate', 'endDate', 'sortOrder'])

function parseOptionalDate(value: unknown) {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function getSubStageSelect() {
  return {
    id: true,
    stageId: true,
    name: true,
    description: true,
    responsibleId: true,
    status: true,
    startDate: true,
    endDate: true,
    sortOrder: true,
    createdAt: true,
    updatedAt: true,
    telegramNotificationSettings: {
      orderBy: { createdAt: 'desc' as const },
      include: { recipient: true },
    },
  }
}

async function getSubStages(stageId: string) {
  return prisma.productSubStage.findMany({
    where: { stageId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: getSubStageSelect(),
  })
}

function getSafeUpdates(updates: Record<string, unknown>) {
  const safeUpdates: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates || {})) {
    if (!SUBSTAGE_UPDATE_FIELDS.has(key)) continue
    if (key === 'name') safeUpdates.name = sanitizeTextValue(value, { maxLength: 160 })
    else if (key === 'description') safeUpdates.description = sanitizeTextValue(value, { preserveNewlines: true, maxLength: 1000 }) || null
    else if (key === 'responsibleId') safeUpdates.responsibleId = sanitizeTextValue(value, { maxLength: 128 }) || null
    else if (key === 'status') safeUpdates.status = sanitizeTextValue(value, { maxLength: 40 }) || 'NOT_STARTED'
    else if (key === 'startDate' || key === 'endDate') safeUpdates[key] = parseOptionalDate(value)
    else if (key === 'sortOrder') safeUpdates.sortOrder = Math.max(0, Number(value) || 0)
  }

  return safeUpdates
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!hasPermission(user.role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rateLimit = consumeRateLimit({
    key: `api:substages:create:${user.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 60,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
  const stageId = sanitizeTextValue(body?.stageId, { maxLength: 128 })
  const name = sanitizeTextValue(body?.name, { maxLength: 160 })
  const description = sanitizeTextValue(body?.description, { preserveNewlines: true, maxLength: 1000 }) || null
  const responsibleId = sanitizeTextValue(body?.responsibleId, { maxLength: 128 }) || null

  if (!stageId || !name) {
    return NextResponse.json({ error: 'Укажите этап и название подэтапа' }, { status: 400 })
  }

  const stage = await prisma.productStage.findUnique({
    where: { id: stageId },
    select: { id: true, productId: true, status: true, product: { select: { isArchived: true } } },
  })

  if (!stage || stage.product.isArchived) {
    return NextResponse.json({ error: 'Этап не найден' }, { status: 404 })
  }

  const orderAggregate = await prisma.productSubStage.aggregate({
    where: { stageId },
    _max: { sortOrder: true },
  })

  const subStage = await prisma.productSubStage.create({
    data: {
      stageId,
      name,
      description,
      responsibleId,
      status: stage.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'NOT_STARTED',
      startDate: stage.status === 'IN_PROGRESS' ? new Date() : null,
      sortOrder: (orderAggregate._max.sortOrder ?? -1) + 1,
    },
    select: getSubStageSelect(),
  })

  revalidatePath(`/products/${stage.productId}`)

  return NextResponse.json({
    subStage,
    subStages: await getSubStages(stageId),
  }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!hasPermission(user.role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rateLimit = consumeRateLimit({
    key: `api:substages:update:${user.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 60,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
  const subStageId = sanitizeTextValue(body?.subStageId, { maxLength: 128 })
  const safeUpdates = getSafeUpdates(body?.updates || {})

  if (!subStageId || Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: 'Нет данных для обновления подэтапа' }, { status: 400 })
  }

  const existing = await prisma.productSubStage.findUnique({
    where: { id: subStageId },
    select: {
      id: true,
      stageId: true,
      status: true,
      stage: { select: { productId: true, product: { select: { isArchived: true } } } },
    },
  })

  if (!existing || existing.stage.product.isArchived) {
    return NextResponse.json({ error: 'Подэтап не найден' }, { status: 404 })
  }

  if (safeUpdates.name === '') {
    return NextResponse.json({ error: 'Название подэтапа не может быть пустым' }, { status: 400 })
  }

  if (safeUpdates.status === 'IN_PROGRESS' && existing.status !== 'IN_PROGRESS' && !safeUpdates.startDate) {
    safeUpdates.startDate = new Date()
  }

  if (safeUpdates.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
    safeUpdates.endDate = safeUpdates.endDate || new Date()
  }

  if (safeUpdates.status && safeUpdates.status !== 'COMPLETED') {
    safeUpdates.endDate = null
  }

  const subStage = await prisma.productSubStage.update({
    where: { id: subStageId },
    data: safeUpdates,
    select: getSubStageSelect(),
  })

  if (safeUpdates.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
    await dispatchTelegramNotifications({
      productId: existing.stage.productId,
      stageId: existing.stageId,
      subStageId: existing.id,
      eventType: 'substage_completed',
    })
    await completeStageIfAllSubStagesDone({
      productId: existing.stage.productId,
      stageId: existing.stageId,
    })
  }

  if (safeUpdates.status && existing.status === 'COMPLETED' && safeUpdates.status !== 'COMPLETED') {
    await prisma.productStage.update({
      where: { id: existing.stageId },
      data: {
        status: 'IN_PROGRESS',
        isCompleted: false,
        endDate: null,
        actualDate: null,
      },
      select: { id: true },
    })
    await recalculateProductDerivedFields(existing.stage.productId)
    await recalculateProductRisk(existing.stage.productId)
  }

  const stage = await prisma.productStage.findUnique({
    where: { id: existing.stageId },
    select: {
      id: true,
      status: true,
      isCompleted: true,
      endDate: true,
      actualDate: true,
      subStages: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: getSubStageSelect(),
      },
    },
  })

  revalidatePath(`/products/${existing.stage.productId}`)

  return NextResponse.json({
    subStage,
    subStages: await getSubStages(existing.stageId),
    stage,
  })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!hasPermission(user.role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rateLimit = consumeRateLimit({
    key: `api:substages:delete:${user.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 60,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  const { searchParams } = new URL(req.url)
  const subStageId = sanitizeTextValue(searchParams.get('subStageId'), { maxLength: 128 })

  if (!subStageId) {
    return NextResponse.json({ error: 'subStageId is required' }, { status: 400 })
  }

  const existing = await prisma.productSubStage.findUnique({
    where: { id: subStageId },
    select: {
      id: true,
      stageId: true,
      stage: { select: { productId: true } },
    },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Подэтап не найден' }, { status: 404 })
  }

  await prisma.productSubStage.delete({ where: { id: subStageId } })

  const remaining = await prisma.productSubStage.findMany({
    where: { stageId: existing.stageId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })

  for (const [index, subStage] of remaining.entries()) {
    await prisma.productSubStage.update({
      where: { id: subStage.id },
      data: { sortOrder: index },
      select: { id: true },
    })
  }

  revalidatePath(`/products/${existing.stage.productId}`)

  return NextResponse.json({
    subStages: await getSubStages(existing.stageId),
  })
}

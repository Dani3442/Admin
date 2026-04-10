import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureDefaultShiftFollowingAutomation } from '@/lib/automation'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { sanitizeDeepStrings, sanitizeTextValue } from '@/lib/input-security'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.MANAGE_AUTOMATIONS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const productId = searchParams.get('productId')

  await ensureDefaultShiftFollowingAutomation()
  const automations = await prisma.automation.findMany({
    where: productId ? { OR: [{ productId }, { isTemplate: true }] } : { isTemplate: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(automations)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.MANAGE_AUTOMATIONS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = (session.user as any).id
  const createRateLimit = consumeRateLimit({
    key: `api:automations:create:${userId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!createRateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(createRateLimit.retryAfterSeconds) } })
  }

  const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
  const { productId, actionType, excludeStageOrders, isActive } = body
  const name = sanitizeTextValue(body?.name, { maxLength: 160 })
  const description = sanitizeTextValue(body?.description, { preserveNewlines: true, maxLength: 1000 }) || null
  const config = sanitizeDeepStrings(body?.config ?? {}, { preserveNewlines: true }) as unknown

  const automation = await prisma.automation.create({
    data: {
      name,
      description,
      productId: sanitizeTextValue(productId, { maxLength: 128 }) || null,
      isTemplate: !productId,
      actionType,
      config: typeof config === 'object' ? JSON.stringify(config) : String(config || '{}'),
      excludeStageOrders: JSON.stringify(excludeStageOrders || []),
      isActive: isActive ?? true,
    },
  })

  return NextResponse.json(automation, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.MANAGE_AUTOMATIONS)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = (session.user as any).id
  const updateRateLimit = consumeRateLimit({
    key: `api:automations:update:${userId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!updateRateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(updateRateLimit.retryAfterSeconds) } })
  }

  const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
  const { id, ...updates } = body

  const automation = await prisma.automation.update({
    where: { id: sanitizeTextValue(id, { maxLength: 128 }) },
    data: {
      ...updates,
      ...(typeof updates.name === 'string' ? { name: sanitizeTextValue(updates.name, { maxLength: 160 }) } : {}),
      ...(typeof updates.description === 'string'
        ? { description: sanitizeTextValue(updates.description, { preserveNewlines: true, maxLength: 1000 }) }
        : {}),
      ...(updates.productId !== undefined
        ? { productId: sanitizeTextValue(updates.productId, { maxLength: 128 }) || null }
        : {}),
      ...(updates.config !== undefined
        ? {
            config:
              typeof updates.config === 'object'
                ? JSON.stringify(sanitizeDeepStrings(updates.config, { preserveNewlines: true }))
                : updates.config,
          }
        : {}),
    },
  })

  return NextResponse.json(automation)
}

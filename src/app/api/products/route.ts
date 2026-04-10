import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createProduct } from '@/lib/product-create'
import { getVisibleProductWhere } from '@/lib/product-access'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const viewer = session.user as any

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const priority = searchParams.get('priority')
  const search = searchParams.get('search')
  const responsible = searchParams.get('responsible')
  const country = searchParams.get('country')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const includeStages = searchParams.get('includeStages') === 'true'

  const where: any = { isArchived: false }
  if (status) where.status = status
  if (priority) where.priority = priority
  if (search) where.name = { contains: search }
  if (responsible) where.responsibleId = responsible
  if (country) where.country = country

  const productListSelect = {
    id: true,
    name: true,
    category: true,
    sku: true,
    country: true,
    competitorUrl: true,
    status: true,
    priority: true,
    finalDate: true,
    responsibleId: true,
    productTemplateId: true,
    riskScore: true,
    progressPercent: true,
    notes: true,
    sortOrder: true,
    isPinned: true,
    isFavorite: true,
    isArchived: true,
    createdAt: true,
    updatedAt: true,
    responsible: { select: { id: true, name: true } },
    stages: includeStages
      ? {
          orderBy: { stageOrder: 'asc' as const },
          select: {
            id: true,
            productId: true,
            stageTemplateId: true,
            stageOrder: true,
            stageName: true,
            dateValue: true,
            dateRaw: true,
            dateEnd: true,
            status: true,
            isCompleted: true,
            isCritical: true,
            participatesInAutoshift: true,
            affectsFinalDate: true,
            responsibleId: true,
            comment: true,
            priority: true,
            plannedDate: true,
            actualDate: true,
            daysDeviation: true,
            createdAt: true,
            updatedAt: true,
            stageTemplate: {
              select: {
                id: true,
                name: true,
                order: true,
                durationText: true,
                durationDays: true,
                isCritical: true,
                affectsFinalDate: true,
              },
            },
          },
        }
      : false,
    _count: { select: { comments: true } },
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: getVisibleProductWhere(viewer, where),
      select: productListSelect,
      orderBy: [{ isPinned: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where: getVisibleProductWhere(viewer, where) }),
  ])

  return NextResponse.json({ products, total, page, limit })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const viewer = session.user as any
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rateLimit = consumeRateLimit({
    key: `api:products:create:${viewer.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  try {
    const body = await req.json()
    const product = await createProduct(body)

    return NextResponse.json({ id: product.id }, { status: 201 })
  } catch (error) {
    console.error('[products:create] Failed to create product', error)
    const message = error instanceof Error ? error.message : 'Не удалось создать продукт'
    const status = message === 'Выбранный шаблон этапов не найден' ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

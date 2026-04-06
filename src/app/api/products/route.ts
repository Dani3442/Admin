import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        responsible: { select: { id: true, name: true, email: true } },
        stages: includeStages
          ? { orderBy: { stageOrder: 'asc' }, include: { stageTemplate: true } }
          : false,
        _count: { select: { comments: true } },
      },
      orderBy: [{ riskScore: 'desc' }, { finalDate: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ])

  return NextResponse.json({ products, total, page, limit })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, country, category, sku, priority, responsibleId, notes } = body

  const stageTemplates = await prisma.stageTemplate.findMany({ orderBy: { order: 'asc' } })

  const product = await prisma.product.create({
    data: {
      name,
      country,
      category,
      sku,
      priority: priority || 'MEDIUM',
      responsibleId,
      notes,
      stages: {
        create: stageTemplates.map((t) => ({
          stageTemplateId: t.id,
          stageOrder: t.order,
          stageName: t.name,
          isCritical: t.isCritical,
          affectsFinalDate: t.affectsFinalDate,
          participatesInAutoshift: t.participatesInAutoshift,
        })),
      },
    },
    include: { stages: true, responsible: true },
  })

  return NextResponse.json(product, { status: 201 })
}

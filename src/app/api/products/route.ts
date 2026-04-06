import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
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
          ? {
              orderBy: { stageOrder: 'asc' },
              include: {
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
      },
      orderBy: [{ isPinned: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
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
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { name, country, category, sku, priority, responsibleId, notes, productTemplateId } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const product = await prisma.$transaction(async (tx) => {
      const [stageTemplates, sortOrderAggregate, selectedTemplate] = await Promise.all([
        tx.stageTemplate.findMany({
          select: {
            id: true,
            name: true,
            order: true,
            durationText: true,
            durationDays: true,
            isCritical: true,
            affectsFinalDate: true,
            createdAt: true,
          },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        }),
        tx.product.aggregate({
          where: { isArchived: false },
          _max: { sortOrder: true },
        }),
        productTemplateId
          ? tx.productTemplate.findUnique({
              where: { id: String(productTemplateId) },
              include: {
                stages: {
                  orderBy: { stageOrder: 'asc' },
                  include: {
                    stageTemplate: {
                      select: {
                        id: true,
                        isCritical: true,
                        affectsFinalDate: true,
                      },
                    },
                  },
                },
              },
            })
          : Promise.resolve(null),
      ])

      if (productTemplateId && !selectedTemplate) {
        throw new Error('Выбранный шаблон этапов не найден')
      }

      const normalizedStageTemplates = stageTemplates.map((template, index) => ({
        ...template,
        normalizedOrder: index,
      }))

      const templateStages = selectedTemplate
        ? selectedTemplate.stages.map((stage, index) => ({
            stageTemplateId: stage.stageTemplateId,
            stageOrder: index,
            stageName: stage.stageName,
            dateValue: stage.plannedDate,
            isCritical: stage.stageTemplate.isCritical,
            affectsFinalDate: stage.stageTemplate.affectsFinalDate,
            participatesInAutoshift: true,
          }))
        : normalizedStageTemplates.map((template) => ({
            stageTemplateId: template.id,
            stageOrder: template.normalizedOrder,
            stageName: template.name,
            dateValue: null,
            isCritical: template.isCritical,
            affectsFinalDate: template.affectsFinalDate,
            participatesInAutoshift: true,
          }))

      const finalDateFromTemplate = templateStages
        .map((stage) => stage.dateValue)
        .filter((date): date is Date => Boolean(date))
        .sort((left, right) => left.getTime() - right.getTime())
        .at(-1) ?? null

      return tx.product.create({
        data: {
          name: name.trim(),
          country,
          category,
          sku,
          priority: priority || 'MEDIUM',
          responsibleId,
          notes,
          productTemplateId: selectedTemplate?.id ?? null,
          sortOrder: (sortOrderAggregate._max.sortOrder ?? -1) + 1,
          finalDate: finalDateFromTemplate,
          stages: {
            create: templateStages,
          },
        },
        select: { id: true },
      })
    })

    return NextResponse.json({ id: product.id }, { status: 201 })
  } catch (error) {
    console.error('[products:create] Failed to create product', error)
    const message = error instanceof Error ? error.message : 'Не удалось создать продукт'
    const status = message === 'Выбранный шаблон этапов не найден' ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

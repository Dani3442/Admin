import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ProductsWorkspace } from '@/components/products/ProductsWorkspace'
import { recalculateAllRisks } from '@/lib/risk'
import { supportsProductTemplateStageDurationDaysColumn } from '@/lib/schema-compat'
import { getVisibleProductWhere } from '@/lib/product-access'

async function getProductsWorkspaceData(viewer: { id?: string | null; role?: string | null }, archived = false) {
  await recalculateAllRisks()
  const hasTemplateStageDurationDaysColumn = await supportsProductTemplateStageDurationDaysColumn()
  const visibleProductsWhere = getVisibleProductWhere(viewer, { isArchived: archived })

  const [listProducts, tableProducts, users, stages, productTemplates, stageSuggestions] = await Promise.all([
    prisma.product.findMany({
      where: visibleProductsWhere,
      select: {
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
        _count: { select: { comments: true, stages: true } },
        stages: {
          select: {
            id: true, stageOrder: true, isCompleted: true, dateValue: true,
            isCritical: true, status: true, stageName: true, participatesInAutoshift: true,
          },
          orderBy: { stageOrder: 'asc' },
        },
      },
      orderBy: [{ isPinned: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.product.findMany({
      where: visibleProductsWhere,
      select: {
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
        stages: {
          orderBy: { stageOrder: 'asc' },
          select: {
            id: true, stageTemplateId: true, stageOrder: true, stageName: true,
            dateValue: true, dateRaw: true, isCompleted: true,
            isCritical: true, status: true, participatesInAutoshift: true,
          },
        },
      },
      orderBy: [{ isPinned: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.stageTemplate.findMany({
      select: {
        id: true,
        name: true,
        order: true,
        durationText: true,
        isCritical: true,
        participatesInAutoshift: true,
      },
      orderBy: { order: 'asc' },
    }),
    prisma.productTemplate.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        stages: {
          orderBy: { stageOrder: 'asc' },
          select: {
            id: true,
            stageTemplateId: true,
            stageOrder: true,
            stageName: true,
            plannedDate: true,
            ...(hasTemplateStageDurationDaysColumn ? { durationDays: true } : {}),
            stageTemplate: {
              select: {
                durationDays: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.stageTemplate.findMany({
      select: { id: true, name: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  return {
    listProducts,
    tableProducts,
    users,
    stages,
    productTemplates,
    stageSuggestions,
    hasTemplateStageDurationDaysColumn,
  }
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [resolvedSearchParamsRaw, session] = await Promise.all([
    searchParams ?? Promise.resolve({}),
    auth(),
  ])
  const resolvedSearchParams = resolvedSearchParamsRaw as Record<string, string | string[] | undefined>
  const viewer = (session?.user as any) ?? null

  const rawCreate = resolvedSearchParams?.create
  const createRequested = Array.isArray(rawCreate) ? rawCreate[0] === '1' : rawCreate === '1'

  if (createRequested) {
    const rawReturnTo = resolvedSearchParams?.returnTo
    const returnTo =
      typeof rawReturnTo === 'string' && rawReturnTo.trim()
        ? rawReturnTo
        : '/products'

    redirect(`/products/new?returnTo=${encodeURIComponent(returnTo)}`)
  }

  const data = await getProductsWorkspaceData(viewer, false)

  return (
    <ProductsWorkspace
      listProducts={data.listProducts as any}
      tableProducts={data.tableProducts as any}
      users={data.users}
      stages={data.stages as any}
      productTemplates={data.productTemplates.map((template) => ({
        ...template,
        stages: template.stages.map((stage) => ({
          id: stage.id,
          stageTemplateId: stage.stageTemplateId,
          stageOrder: stage.stageOrder,
          stageName: stage.stageName,
          plannedDate: stage.plannedDate,
          durationDays: data.hasTemplateStageDurationDaysColumn ? (stage as any).durationDays ?? null : null,
          stageTemplateDurationDays: stage.stageTemplate.durationDays ?? null,
          participatesInAutoshift: true,
        })),
      })) as any}
      stageSuggestions={data.stageSuggestions}
      currentUserRole={(session?.user as any)?.role || 'VIEWER'}
      archiveMode={false}
    />
  )
}

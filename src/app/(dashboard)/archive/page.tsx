import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ProductsWorkspace } from '@/components/products/ProductsWorkspace'
import { getCachedAssignableUsers, getCachedProductTemplates, getCachedStageSuggestions, getCachedStageTemplates } from '@/lib/cached-reference-data'
import {
  supportsProductTemplateStageAutoshiftColumn,
  supportsProductTemplateStageDurationDaysColumn,
} from '@/lib/schema-compat'
import { canManageArchive, getVisibleProductWhere } from '@/lib/product-access'

async function getArchiveWorkspaceData(viewer: { id?: string | null; role?: string | null }) {
  const [hasTemplateStageDurationDaysColumn, hasTemplateStageAutoshiftColumn] = await Promise.all([
    supportsProductTemplateStageDurationDaysColumn(),
    supportsProductTemplateStageAutoshiftColumn(),
  ])
  const visibleProductsWhere = getVisibleProductWhere(viewer, { isArchived: true })

  const productWorkspaceSelect = {
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
      orderBy: { stageOrder: 'asc' as const },
      select: {
        id: true,
        stageTemplateId: true,
        stageOrder: true,
        stageName: true,
        dateValue: true,
        dateRaw: true,
        isCompleted: true,
        isCritical: true,
        status: true,
        participatesInAutoshift: true,
      },
    },
  }

  const [products, users, stages, productTemplates, stageSuggestions] = await Promise.all([
    prisma.product.findMany({
      where: visibleProductsWhere,
      select: productWorkspaceSelect,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    getCachedAssignableUsers(),
    getCachedStageTemplates(),
    getCachedProductTemplates(hasTemplateStageDurationDaysColumn, hasTemplateStageAutoshiftColumn),
    getCachedStageSuggestions(),
  ])

  return {
    listProducts: products,
    tableProducts: products,
    users: users.map((user) => ({ id: user.id, name: user.name })),
    stages,
    productTemplates,
    stageSuggestions,
    hasTemplateStageDurationDaysColumn,
    hasTemplateStageAutoshiftColumn,
  }
}

export default async function ArchivePage() {
  const session = await auth()
  const viewer = (session?.user as any) ?? null

  if (!canManageArchive(viewer)) {
    redirect('/dashboard')
  }

  const data = await getArchiveWorkspaceData(viewer)

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
          participatesInAutoshift: data.hasTemplateStageAutoshiftColumn ? (stage as any).participatesInAutoshift ?? true : true,
        })),
      })) as any}
      stageSuggestions={data.stageSuggestions}
      currentUserRole={(session?.user as any)?.role || 'VIEWER'}
      archiveMode
    />
  )
}

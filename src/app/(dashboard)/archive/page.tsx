import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ProductsWorkspace } from '@/components/products/ProductsWorkspace'
import { getCachedAssignableUsers, getCachedProductTemplates, getCachedStageSuggestions, getCachedStageTemplates } from '@/lib/cached-reference-data'
import {
  supportsProductTemplateStageAutoshiftColumn,
  supportsProductTemplateStageDurationDaysColumn,
  supportsProductTemplateStageStartRulesColumns,
  supportsProductTemplateSubStagesTable,
  supportsTemplateTelegramNotificationSettingsTable,
} from '@/lib/schema-compat'
import { canManageArchive, canViewAllProducts, getVisibleProductWhere } from '@/lib/product-access'
import { getFinalDateFromStages } from '@/lib/product-derived-fields'

async function getArchiveWorkspaceData(viewer: { id?: string | null; role?: string | null }) {
  const [
    hasTemplateStageDurationDaysColumn,
    hasTemplateStageAutoshiftColumn,
    hasTemplateStageStartRulesColumns,
    hasTemplateSubStagesTable,
    hasTemplateTelegramSettingsTable,
  ] = await Promise.all([
    supportsProductTemplateStageDurationDaysColumn(),
    supportsProductTemplateStageAutoshiftColumn(),
    supportsProductTemplateStageStartRulesColumns(),
    supportsProductTemplateSubStagesTable(),
    supportsTemplateTelegramNotificationSettingsTable(),
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
        plannedDate: true,
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
    getCachedProductTemplates(
      hasTemplateStageDurationDaysColumn,
      hasTemplateStageAutoshiftColumn,
      hasTemplateStageStartRulesColumns,
      hasTemplateSubStagesTable,
      hasTemplateTelegramSettingsTable
    ),
    getCachedStageSuggestions(),
  ])

  const productsWithDerivedFinalDate = products.map((product) => ({
    ...product,
    finalDate: getFinalDateFromStages(product.stages),
  }))

  return {
    listProducts: productsWithDerivedFinalDate,
    tableProducts: productsWithDerivedFinalDate,
    users: users.map((user) => ({ id: user.id, name: user.name })),
    stages,
    productTemplates,
    stageSuggestions,
    hasTemplateStageDurationDaysColumn,
    hasTemplateStageAutoshiftColumn,
    hasTemplateStageStartRulesColumns,
    hasTemplateSubStagesTable,
    hasTemplateTelegramSettingsTable,
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
          startTrigger: data.hasTemplateStageStartRulesColumns ? (stage as any).startTrigger : undefined,
          startDelayDays: data.hasTemplateStageStartRulesColumns ? (stage as any).startDelayDays ?? 0 : 0,
          startReferenceStageOrder: data.hasTemplateStageStartRulesColumns
            ? (stage as any).startReferenceStageOrder ?? null
            : null,
          subStages: data.hasTemplateSubStagesTable ? (stage as any).subStages ?? [] : [],
          telegramNotificationSettings: (stage as any).telegramNotificationSettings ?? [],
        })),
      })) as any}
      stageSuggestions={data.stageSuggestions}
      currentUserRole={(session?.user as any)?.role || 'VIEWER'}
      currentUser={{
        id: (session?.user as any)?.id || '',
        name: (session?.user as any)?.name || '',
      }}
      canViewAllProducts={canViewAllProducts(viewer)}
      canCreateProducts={false}
      archiveMode
    />
  )
}

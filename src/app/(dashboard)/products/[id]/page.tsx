import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ProductCardClient } from '@/components/products/ProductCardClient'
import { getFinalDateFromStages } from '@/lib/product-derived-fields'
import {
  supportsProductLifecycleColumns,
  supportsProductStageDescriptionColumn,
  supportsProductStageStartRulesColumns,
  supportsProductSubStagesTable,
  supportsProductTemplateStageAutoshiftColumn,
  supportsProductTemplateStageDurationDaysColumn,
  supportsProductTemplateStageStartRulesColumns,
  supportsProductTemplateSubStagesTable,
  supportsTemplateTelegramNotificationSettingsTable,
  supportsTelegramNotificationSettingsTables,
} from '@/lib/schema-compat'
import { getCachedProductTemplates } from '@/lib/cached-reference-data'
import { getVisibleProductWhere } from '@/lib/product-access'
import { processDueStageStartsForProduct } from '@/lib/stage-workflow'

async function getProduct(id: string, viewer: { id?: string | null; role?: string | null }) {
  const [
    hasProductLifecycleColumns,
    hasProductStageDescriptionColumn,
    hasProductStageStartRulesColumns,
    hasProductSubStagesTable,
    hasTelegramNotificationSettingsTables,
  ] = await Promise.all([
    supportsProductLifecycleColumns(),
    supportsProductStageDescriptionColumn(),
    supportsProductStageStartRulesColumns(),
    supportsProductSubStagesTable(),
    supportsTelegramNotificationSettingsTables(),
  ])

  const product = await prisma.product.findFirst({
    where: getVisibleProductWhere(viewer, { id }),
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
      ...(hasProductLifecycleColumns
        ? {
            closedAt: true,
            closedById: true,
            closureComment: true,
            archivedAt: true,
            archivedById: true,
            archiveReason: true,
            closedBy: { select: { id: true, name: true } },
            archivedBy: { select: { id: true, name: true } },
          }
        : {}),
      responsible: { select: { id: true, name: true } },
      stages: {
        orderBy: { stageOrder: 'asc' },
        select: {
          id: true,
          productId: true,
          stageTemplateId: true,
          stageOrder: true,
          stageName: true,
          ...(hasProductStageDescriptionColumn ? { description: true } : {}),
          dateValue: true,
          dateRaw: true,
          dateEnd: true,
          durationDays: true,
          status: true,
          isCompleted: true,
          isCritical: true,
          participatesInAutoshift: true,
          affectsFinalDate: true,
          responsibleId: true,
          comment: true,
          priority: true,
          plannedDate: true,
          ...(hasProductStageStartRulesColumns
            ? {
                startDate: true,
                endDate: true,
                autoStartAt: true,
                startTrigger: true,
                startDelayDays: true,
                startReferenceStageOrder: true,
              }
            : {}),
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
          responsible: { select: { id: true, name: true } },
          ...(hasProductSubStagesTable
            ? {
                subStages: {
                  orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                  select: {
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
                    ...(hasTelegramNotificationSettingsTables
                      ? {
                          telegramNotificationSettings: {
                            orderBy: { createdAt: 'desc' },
                            include: { recipient: true },
                          },
                        }
                      : {}),
                  },
                },
              }
            : {}),
          ...(hasTelegramNotificationSettingsTables
            ? {
                telegramNotificationSettings: {
                  orderBy: { createdAt: 'desc' },
                  include: { recipient: true },
                },
              }
            : {}),
        },
      },
      comments: {
        where: { productStageId: null },
        include: { author: { select: { id: true, name: true, lastName: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
      },
      automations: { where: { isActive: true } },
      changeHistory: {
        include: { changedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      },
      _count: { select: { comments: true } },
    },
  })

  if (!product) return null

  return {
    ...product,
    closedAt: hasProductLifecycleColumns ? (product as any).closedAt ?? null : null,
    closedById: hasProductLifecycleColumns ? (product as any).closedById ?? null : null,
    closureComment: hasProductLifecycleColumns ? (product as any).closureComment ?? null : null,
    archivedAt: hasProductLifecycleColumns ? (product as any).archivedAt ?? null : null,
    archivedById: hasProductLifecycleColumns ? (product as any).archivedById ?? null : null,
    archiveReason: hasProductLifecycleColumns ? (product as any).archiveReason ?? null : null,
    closedBy: hasProductLifecycleColumns ? (product as any).closedBy ?? null : null,
    archivedBy: hasProductLifecycleColumns ? (product as any).archivedBy ?? null : null,
    stages: product.stages.map((stage) => ({
      ...stage,
      description: hasProductStageDescriptionColumn ? (stage as any).description ?? null : null,
      startDate: hasProductStageStartRulesColumns ? (stage as any).startDate ?? null : null,
      endDate: hasProductStageStartRulesColumns ? (stage as any).endDate ?? null : null,
      autoStartAt: hasProductStageStartRulesColumns ? (stage as any).autoStartAt ?? null : null,
      startTrigger: hasProductStageStartRulesColumns ? (stage as any).startTrigger : undefined,
      startDelayDays: hasProductStageStartRulesColumns ? (stage as any).startDelayDays ?? 0 : 0,
      startReferenceStageOrder: hasProductStageStartRulesColumns
        ? (stage as any).startReferenceStageOrder ?? null
        : null,
      subStages: hasProductSubStagesTable ? (stage as any).subStages ?? [] : [],
      telegramNotificationSettings: hasTelegramNotificationSettingsTables
        ? (stage as any).telegramNotificationSettings ?? []
        : [],
    })),
    finalDate: getFinalDateFromStages(product.stages),
  }
}

async function getUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, lastName: true, avatar: true },
    orderBy: { name: 'asc' },
  })
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  const viewer = (session?.user as any) ?? null
  const [
    hasTemplateStageDurationDaysColumn,
    hasTemplateStageAutoshiftColumn,
    hasTemplateStageStartRulesColumns,
    hasTemplateSubStagesTable,
    hasTemplateTelegramSettingsTable,
    hasProductStageStartRulesColumns,
  ] = await Promise.all([
    supportsProductTemplateStageDurationDaysColumn(),
    supportsProductTemplateStageAutoshiftColumn(),
    supportsProductTemplateStageStartRulesColumns(),
    supportsProductTemplateSubStagesTable(),
    supportsTemplateTelegramNotificationSettingsTable(),
    supportsProductStageStartRulesColumns(),
  ])

  if (viewer?.id && hasProductStageStartRulesColumns) {
    await processDueStageStartsForProduct(id)
  }

  const [product, users, productTemplates] = await Promise.all([
    getProduct(id, viewer),
    getUsers(),
    getCachedProductTemplates(
      hasTemplateStageDurationDaysColumn,
      hasTemplateStageAutoshiftColumn,
      hasTemplateStageStartRulesColumns,
      hasTemplateSubStagesTable,
      hasTemplateTelegramSettingsTable
    ),
  ])

  if (!product) notFound()

  return (
    <ProductCardClient
      product={product as any}
      users={users}
      productTemplates={productTemplates.map((template) => ({
        ...template,
        stages: template.stages.map((stage) => ({
          id: stage.id,
          stageTemplateId: stage.stageTemplateId,
          stageOrder: stage.stageOrder,
          stageName: stage.stageName,
          plannedDate: stage.plannedDate,
          durationDays: hasTemplateStageDurationDaysColumn ? (stage as any).durationDays ?? null : null,
          stageTemplateDurationDays: stage.stageTemplate.durationDays ?? null,
          participatesInAutoshift: hasTemplateStageAutoshiftColumn ? (stage as any).participatesInAutoshift ?? true : true,
          startTrigger: hasTemplateStageStartRulesColumns ? (stage as any).startTrigger : undefined,
          startDelayDays: hasTemplateStageStartRulesColumns ? (stage as any).startDelayDays ?? 0 : 0,
          startReferenceStageOrder: hasTemplateStageStartRulesColumns
            ? (stage as any).startReferenceStageOrder ?? null
            : null,
          subStages: hasTemplateSubStagesTable ? (stage as any).subStages ?? [] : [],
          telegramNotificationSettings: (stage as any).telegramNotificationSettings ?? [],
        })),
      })) as any}
      currentUser={session?.user as any}
    />
  )
}

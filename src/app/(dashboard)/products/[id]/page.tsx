import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ProductCardClient } from '@/components/products/ProductCardClient'
import { getFinalDateFromStages } from '@/lib/product-derived-fields'
import { getOverlapAcceptedMap } from '@/lib/overlap-acceptance'
import { supportsProductLifecycleColumns } from '@/lib/schema-compat'
import { getVisibleProductWhere } from '@/lib/product-access'

async function getProduct(id: string, viewer: { id?: string | null; role?: string | null }) {
  const hasProductLifecycleColumns = await supportsProductLifecycleColumns()
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

  const overlapAcceptedById = await getOverlapAcceptedMap(id)

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
    finalDate: getFinalDateFromStages(product.stages),
    stages: product.stages.map((stage) => ({
      ...stage,
      overlapAccepted: overlapAcceptedById.get(stage.id) ?? false,
    })),
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

  const [product, users] = await Promise.all([
    getProduct(id, viewer),
    getUsers(),
  ])

  if (!product) notFound()

  return (
    <ProductCardClient
      product={product as any}
      users={users}
      currentUser={session?.user as any}
    />
  )
}

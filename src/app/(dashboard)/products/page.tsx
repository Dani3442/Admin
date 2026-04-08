import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ProductsWorkspace } from '@/components/products/ProductsWorkspace'
import { recalculateAllRisks } from '@/lib/risk'

async function getProductsWorkspaceData() {
  await recalculateAllRisks()

  const [listProducts, tableProducts, users, stages, productTemplates, stageSuggestions] = await Promise.all([
    prisma.product.findMany({
      where: { isArchived: false },
      include: {
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
      where: { isArchived: false },
      include: {
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
      include: {
        stages: {
          orderBy: { stageOrder: 'asc' },
          select: {
            id: true,
            stageTemplateId: true,
            stageOrder: true,
            stageName: true,
            plannedDate: true,
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

  return { listProducts, tableProducts, users, stages, productTemplates, stageSuggestions }
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [data, session] = await Promise.all([
    getProductsWorkspaceData(),
    auth(),
  ])
  await searchParams

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
          participatesInAutoshift: true,
        })),
      })) as any}
      stageSuggestions={data.stageSuggestions}
      currentUserRole={(session?.user as any)?.role || 'VIEWER'}
    />
  )
}

import { prisma } from './prisma'
import { supportsProductStageOverlapAcceptedColumn } from './schema-compat'

export async function getOverlapAcceptedMapForProducts(productIds: string[]): Promise<Map<string, boolean>> {
  const productIdList = [...new Set(productIds.filter(Boolean))]
  if (productIdList.length === 0) return new Map<string, boolean>()

  const hasColumn = await supportsProductStageOverlapAcceptedColumn()

  if (hasColumn) {
    const rows = await prisma.productStage.findMany({
      where: { productId: { in: productIdList } },
      select: { id: true, overlapAccepted: true },
    })

    return new Map<string, boolean>(rows.map((row) => [row.id, row.overlapAccepted] as [string, boolean]))
  }

  const rows = await prisma.changeHistory.findMany({
    where: {
      productId: { in: productIdList },
      field: 'overlapAccepted',
      productStageId: { not: null },
    },
    select: {
      productStageId: true,
      newValue: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const result = new Map<string, boolean>()
  for (const row of rows) {
    if (!row.productStageId || result.has(row.productStageId)) continue
    result.set(row.productStageId, row.newValue === 'true')
  }

  return result
}

export async function getOverlapAcceptedMap(productId: string): Promise<Map<string, boolean>> {
  return getOverlapAcceptedMapForProducts([productId])
}

export async function persistOverlapAccepted(
  productId: string,
  stageIds: string[],
  value: boolean,
  changedById: string
) {
  const uniqueStageIds = [...new Set(stageIds.filter(Boolean))]
  if (uniqueStageIds.length === 0) return

  const hasColumn = await supportsProductStageOverlapAcceptedColumn()

  if (hasColumn) {
    await prisma.productStage.updateMany({
      where: { id: { in: uniqueStageIds } },
      data: { overlapAccepted: value },
    })
    return
  }

  await prisma.changeHistory.createMany({
    data: uniqueStageIds.map((stageId) => ({
      productId,
      productStageId: stageId,
      field: 'overlapAccepted',
      newValue: String(value),
      changedById,
    })),
  })
}

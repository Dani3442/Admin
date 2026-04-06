import { prisma } from '@/lib/prisma'
import { TableViewClient } from '@/components/table/TableViewClient'
import { recalculateAllRisks } from '@/lib/risk'

async function getTableData() {
  // Recalculate risks on every page load
  await recalculateAllRisks()

  const [products, stages] = await Promise.all([
    prisma.product.findMany({
      where: { isArchived: false },
      include: {
        responsible: { select: { id: true, name: true } },
        stages: {
          orderBy: { stageOrder: 'asc' },
          select: {
            id: true, stageOrder: true, stageName: true,
            dateValue: true, dateRaw: true, isCompleted: true,
            isCritical: true, status: true,
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { finalDate: 'asc' }],
    }),
    prisma.stageTemplate.findMany({ orderBy: { order: 'asc' } }),
  ])

  return { products, stages }
}

export default async function TablePage() {
  const { products, stages } = await getTableData()
  return <TableViewClient products={products as any} stages={stages} />
}

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { TableViewClient } from '@/components/table/TableViewClient'
import { recalculateAllRisks } from '@/lib/risk'

async function getTableData() {
  await recalculateAllRisks()

  const [products, stages] = await Promise.all([
    prisma.product.findMany({
      where: { isArchived: false },
      include: {
        responsible: { select: { id: true, name: true } },
        stages: {
          orderBy: { stageOrder: 'asc' },
          select: {
            id: true, stageTemplateId: true, stageOrder: true, stageName: true,
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
  const session = await auth()
  const { products, stages } = await getTableData()
  return <TableViewClient products={products as any} stages={stages} currentUserRole={(session?.user as any)?.role || 'VIEWER'} />
}

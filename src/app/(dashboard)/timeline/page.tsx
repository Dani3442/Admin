import { prisma } from '@/lib/prisma'
import { TimelineClient } from '@/components/TimelineClient'

async function getData() {
  const products = await prisma.product.findMany({
    where: { isArchived: false, finalDate: { not: null } },
    select: {
      id: true,
      name: true,
      finalDate: true,
      status: true,
      priority: true,
      progressPercent: true,
      stages: {
        where: { dateValue: { not: null } },
        orderBy: { stageOrder: 'asc' },
        select: { id: true, stageName: true, stageOrder: true, dateValue: true, isCompleted: true, isCritical: true, status: true },
      },
      responsible: { select: { id: true, name: true } },
    },
    orderBy: { finalDate: 'asc' },
    take: 50,
  })
  return products
}

export default async function TimelinePage() {
  const products = await getData()
  return <TimelineClient products={products as any} />
}

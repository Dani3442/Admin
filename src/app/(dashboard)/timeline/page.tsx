import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { TimelineClient } from '@/components/TimelineClient'
import { getVisibleProductWhere } from '@/lib/product-access'

async function getData(viewer: { id?: string | null; role?: string | null }) {
  const products = await prisma.product.findMany({
    where: getVisibleProductWhere(viewer, { isArchived: false, finalDate: { not: null } }),
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
  const session = await auth()
  const products = await getData((session?.user as any) ?? null)
  return <TimelineClient products={products as any} />
}

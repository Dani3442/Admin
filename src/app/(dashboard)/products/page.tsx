import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ProductsClient } from '@/components/products/ProductsClient'
import { recalculateAllRisks } from '@/lib/risk'

async function getProducts() {
  await recalculateAllRisks()

  const [products, users] = await Promise.all([
    prisma.product.findMany({
      where: { isArchived: false },
      include: {
        responsible: { select: { id: true, name: true } },
        _count: { select: { comments: true, stages: true } },
        stages: {
          select: {
            id: true, stageOrder: true, isCompleted: true, dateValue: true,
            isCritical: true, status: true, stageName: true,
          },
          orderBy: { stageOrder: 'asc' },
        },
      },
      orderBy: [{ priority: 'asc' }, { finalDate: 'asc' }],
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return { products, users }
}

export default async function ProductsPage() {
  const [data, session] = await Promise.all([
    getProducts(),
    auth(),
  ])

  return <ProductsClient products={data.products as any} users={data.users} currentUserRole={(session?.user as any)?.role || 'VIEWER'} />
}

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { ProductCardClient } from '@/components/products/ProductCardClient'

async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      responsible: { select: { id: true, name: true, email: true } },
      stages: {
        orderBy: { stageOrder: 'asc' },
        include: {
          stageTemplate: true,
          responsible: { select: { id: true, name: true } },
          comments: {
            include: { author: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
      comments: {
        where: { productStageId: null },
        include: { author: { select: { id: true, name: true } } },
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

  if (!product || product.isArchived) return null
  return product
}

async function getUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const [product, users, session] = await Promise.all([
    getProduct(params.id),
    getUsers(),
    auth(),
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

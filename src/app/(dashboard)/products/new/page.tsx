import { prisma } from '@/lib/prisma'
import { NewProductForm } from '@/components/products/NewProductForm'

async function getUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

async function getProductTemplates() {
  return prisma.productTemplate.findMany({
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
  })
}

async function getStageSuggestions() {
  return prisma.stageTemplate.findMany({
    select: { id: true, name: true },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  })
}

export default async function NewProductPage() {
  const [users, productTemplates, stageSuggestions] = await Promise.all([
    getUsers(),
    getProductTemplates(),
    getStageSuggestions(),
  ])

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Новый продукт</h1>
        <p className="text-slate-500 text-sm mt-1">Заполните информацию о продукте</p>
      </div>
      <NewProductForm users={users} productTemplates={productTemplates as any} stageSuggestions={stageSuggestions} />
    </div>
  )
}

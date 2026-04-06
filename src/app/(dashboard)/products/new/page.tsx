import { prisma } from '@/lib/prisma'
import { NewProductForm } from '@/components/products/NewProductForm'

async function getUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

export default async function NewProductPage() {
  const users = await getUsers()

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Новый продукт</h1>
        <p className="text-slate-500 text-sm mt-1">Заполните информацию о продукте</p>
      </div>
      <NewProductForm users={users} />
    </div>
  )
}

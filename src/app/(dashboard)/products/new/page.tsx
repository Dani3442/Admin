import { redirect } from 'next/navigation'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NewProductForm } from '@/components/products/NewProductForm'
import { createProduct } from '@/lib/product-create'

async function getCreateProductData() {
  const [users, productTemplates, stageSuggestions] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
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

  return {
    users,
    productTemplates: productTemplates.map((template) => ({
      ...template,
      stages: template.stages.map((stage) => ({
        id: stage.id,
        stageTemplateId: stage.stageTemplateId,
        stageOrder: stage.stageOrder,
        stageName: stage.stageName,
        plannedDate: stage.plannedDate,
        participatesInAutoshift: true,
      })),
    })),
    stageSuggestions,
  }
}

export default async function NewProductPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [session, resolvedSearchParams, data] = await Promise.all([
    auth(),
    searchParams ?? Promise.resolve({}),
    getCreateProductData(),
  ])

  if (!session?.user) redirect('/login')
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    redirect('/products')
  }

  const rawReturnTo = (resolvedSearchParams as Record<string, string | string[] | undefined>)?.returnTo
  const returnTo = typeof rawReturnTo === 'string' && rawReturnTo.trim() ? rawReturnTo : '/products'

  return (
    <div className="mx-auto max-w-5xl">
      <div className="surface-panel p-6 sm:p-8">
        <div className="mb-6">
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-slate-950">Новый продукт</h1>
          <p className="mt-2 text-sm text-slate-500">Создай продукт и сразу задай шаблон этапов, ответственного и базовые параметры.</p>
        </div>

        <NewProductForm
          users={data.users}
          productTemplates={data.productTemplates as any}
          stageSuggestions={data.stageSuggestions}
          mode="page"
          returnTo={returnTo}
          formAction={async (formData) => {
            'use server'

            const session = await auth()
            if (!session?.user) redirect('/login')
            if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
              redirect('/products')
            }

            const rawOverride = String(formData.get('templateStagesOverride') || '[]')
            let templateStagesOverride: any[] = []

            try {
              const parsed = JSON.parse(rawOverride)
              templateStagesOverride = Array.isArray(parsed) ? parsed : []
            } catch {
              templateStagesOverride = []
            }

            const product = await createProduct({
              name: String(formData.get('name') || ''),
              country: String(formData.get('country') || ''),
              category: String(formData.get('category') || ''),
              sku: String(formData.get('sku') || ''),
              priority: String(formData.get('priority') || 'MEDIUM'),
              responsibleId: String(formData.get('responsibleId') || ''),
              notes: String(formData.get('notes') || ''),
              productTemplateId: String(formData.get('productTemplateId') || ''),
              templateStagesOverride,
            })

            redirect(`/products/${encodeURIComponent(product.id)}`)
          }}
        />
      </div>
    </div>
  )
}

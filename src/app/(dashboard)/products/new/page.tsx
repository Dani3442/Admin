import dynamic from 'next/dynamic'
import { redirect } from 'next/navigation'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { getCachedAssignableUsers, getCachedProductTemplates, getCachedStageSuggestions } from '@/lib/cached-reference-data'
import {
  supportsProductTemplateStageAutoshiftColumn,
  supportsProductTemplateStageDurationDaysColumn,
} from '@/lib/schema-compat'

const NewProductForm = dynamic(
  () => import('@/components/products/NewProductForm').then((mod) => mod.NewProductForm),
  {
    loading: () => <div className="min-h-[520px] animate-pulse rounded-[28px] bg-muted/35" />,
  }
)

async function getCreateProductData() {
  const [hasProductTemplateStageDurationDaysColumn, hasProductTemplateStageAutoshiftColumn] = await Promise.all([
    supportsProductTemplateStageDurationDaysColumn(),
    supportsProductTemplateStageAutoshiftColumn(),
  ])

  const [users, productTemplates, stageSuggestions] = await Promise.all([
    getCachedAssignableUsers(),
    getCachedProductTemplates(hasProductTemplateStageDurationDaysColumn, hasProductTemplateStageAutoshiftColumn),
    getCachedStageSuggestions(),
  ])

  return {
    users: users.map((user) => ({ id: user.id, name: user.name })),
    productTemplates: productTemplates.map((template) => ({
      ...template,
      stages: template.stages.map((stage) => ({
        id: stage.id,
        stageTemplateId: stage.stageTemplateId,
        stageOrder: stage.stageOrder,
        stageName: stage.stageName,
        plannedDate: stage.plannedDate,
        durationDays: hasProductTemplateStageDurationDaysColumn ? (stage as any).durationDays ?? null : null,
        stageTemplateDurationDays: stage.stageTemplate.durationDays ?? null,
        participatesInAutoshift: hasProductTemplateStageAutoshiftColumn ? (stage as any).participatesInAutoshift ?? true : true,
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
          <h1 className="text-[32px] font-semibold tracking-[-0.03em] text-foreground">Новый продукт</h1>
          <p className="mt-2 text-sm text-muted-foreground">Создай продукт и сразу задай шаблон этапов, ответственного и базовые параметры.</p>
        </div>

        <NewProductForm
          users={data.users}
          productTemplates={data.productTemplates as any}
          stageSuggestions={data.stageSuggestions}
          mode="page"
          returnTo={returnTo}
        />
      </div>
    </div>
  )
}

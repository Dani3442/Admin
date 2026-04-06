'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { LayoutList, Plus, Table2 } from 'lucide-react'
import { ProductsClient } from '@/components/products/ProductsClient'
import { TableViewClient } from '@/components/table/TableViewClient'
import type { ProductListItem } from '@/lib/product-list'
import { cn } from '@/lib/utils'
import { InfoPopover } from '@/components/ui/InfoPopover'

type ProductsLayoutMode = 'list' | 'table'

interface StageTemplateView {
  id: string
  order: number
  name: string
  durationText: string | null
  isCritical: boolean
}

interface TableProductView {
  id: string
  name: string
  country: string | null
  status: string
  finalDate: Date | null
  progressPercent: number
  riskScore: number
  responsible?: { id: string; name: string } | null
  stages: Array<{
    id: string
    stageTemplateId: string
    stageOrder: number
    stageName: string
    dateValue: Date | null
    dateRaw: string | null
    isCompleted: boolean
    isCritical: boolean
    status: string
  }>
}

interface ProductsWorkspaceProps {
  listProducts: ProductListItem[]
  tableProducts: TableProductView[]
  users: Array<{ id: string; name: string }>
  stages: StageTemplateView[]
  currentUserRole: string
}

const layoutOptions: Array<{ value: ProductsLayoutMode; label: string; icon: typeof LayoutList }> = [
  { value: 'list', label: 'Список', icon: LayoutList },
  { value: 'table', label: 'Таблица', icon: Table2 },
]

function getLayoutFromSearchParams(searchParams: Pick<URLSearchParams, 'get'>): ProductsLayoutMode {
  return searchParams.get('layout') === 'table' ? 'table' : 'list'
}

export function ProductsWorkspace({
  listProducts,
  tableProducts,
  users,
  stages,
  currentUserRole,
}: ProductsWorkspaceProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const layout = getLayoutFromSearchParams(searchParams)

  const updateLayout = (nextLayout: ProductsLayoutMode) => {
    const params = new URLSearchParams(searchParams.toString())

    if (nextLayout === 'list') {
      params.delete('layout')
    } else {
      params.set('layout', nextLayout)
    }

    const nextQuery = params.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
  }

  return (
    <div className="page-section">
      <div className="surface-panel flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-1 shadow-sm">
            {layoutOptions.map((option) => {
              const Icon = option.icon
              const active = layout === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateLayout(option.value)}
                  className={cn(
                    'relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors',
                    active ? 'text-white' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="products-layout-pill"
                      className="absolute inset-0 rounded-xl bg-brand-600 shadow-sm"
                      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                    />
                  )}
                  <Icon className="relative z-10 h-4 w-4" />
                  <span className="relative z-10">{option.label}</span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-3">
            <div>
              <h1 className="page-heading">Продукты</h1>
              <p className="subtle-copy">
                Переключайтесь между визуальным списком и плотной таблицей этапов без потери контекста.
              </p>
            </div>
            <InfoPopover title={layout === 'table' ? 'Подсказка по таблице' : 'Подсказка по разделу'}>
              {layout === 'table' ? (
                <>
                  <p>Таблица показывает продукты по строкам, а этапы по колонкам. Дату можно менять прямо в ячейке.</p>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Легенда цветов</div>
                    <div className="grid gap-2">
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-emerald-200 bg-emerald-100" /> Выполнен</div>
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-blue-200 bg-blue-100" /> В работе</div>
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-amber-200 bg-amber-100" /> Срок 7 дней или меньше</div>
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-red-200 bg-red-100" /> Просрочен</div>
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-slate-200 bg-slate-100" /> Нет данных</div>
                      <div className="flex items-center gap-2"><span className="h-3 w-3 rounded border-2 border-orange-400 bg-orange-50" /> Пересечение дат</div>
                    </div>
                  </div>
                  <p>Правый клик по заголовку этапа открывает управление колонкой.</p>
                </>
              ) : (
                <>
                  <p>Внутри раздела можно переключаться между списком продуктов и таблицей этапов.</p>
                  <p>В списке доступны ручная сортировка, избранное, закрепление и контекстное меню по правому клику.</p>
                </>
              )}
            </InfoPopover>
          </div>
        </div>

        <Link href="/products/new" className="btn-primary self-start">
          <Plus className="h-4 w-4" /> Новый продукт
        </Link>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={layout}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
        >
          {layout === 'table' ? (
            <TableViewClient
              products={tableProducts as any}
              stages={stages as any}
              currentUserRole={currentUserRole}
              embedded
            />
          ) : (
            <ProductsClient
              products={listProducts}
              users={users}
              currentUserRole={currentUserRole}
              embedded
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

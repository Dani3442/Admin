'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { LayoutList, Plus, Table2 } from 'lucide-react'
import { ProductsClient } from '@/components/products/ProductsClient'
import { TableViewClient } from '@/components/table/TableViewClient'
import type { ProductListItem } from '@/lib/product-list'
import { cn } from '@/lib/utils'

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
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-sm">
            {layoutOptions.map((option) => {
              const Icon = option.icon
              const active = layout === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updateLayout(option.value)}
                  className={cn(
                    'relative inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors',
                    active ? 'text-white' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="products-layout-pill"
                      className="absolute inset-0 rounded-full bg-brand-600 shadow-sm"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <Icon className="relative z-10 h-4 w-4" />
                  <span className="relative z-10">{option.label}</span>
                </button>
              )
            })}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Продукты</h1>
            <p className="text-sm text-slate-500">
              Один раздел для работы со списком и таблицей этапов. Переключайся без ухода в отдельный экран.
            </p>
          </div>
        </div>

        <Link href="/products/new" className="btn-primary">
          <Plus className="h-4 w-4" /> Новый продукт
        </Link>
      </div>

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
    </div>
  )
}

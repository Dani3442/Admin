'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { LayoutList, Plus, Table2 } from 'lucide-react'
import { ProductsClient } from '@/components/products/ProductsClient'
import { TableViewClient } from '@/components/table/TableViewClient'
import type { ProductListItem } from '@/lib/product-list'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

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

function LayoutSwitcher({
  layout,
  onChange,
}: {
  layout: ProductsLayoutMode
  onChange: (nextLayout: ProductsLayoutMode) => void
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-slate-100/90 p-1.5">
      {layoutOptions.map((option) => {
        const Icon = option.icon
        const active = layout === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex min-w-[128px] items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors',
              active ? 'text-white' : 'text-slate-600 hover:text-slate-900'
            )}
          >
            {active && (
              <motion.span
                layoutId="products-layout-pill"
                className="absolute inset-0 rounded-full bg-brand-950 shadow-[0_14px_28px_-18px_rgba(23,37,84,0.62)]"
                transition={{ type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }}
              />
            )}
            <Icon className="relative z-10 h-4 w-4" />
            <span className="relative z-10">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

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

  const layoutSwitcher: ReactNode = <LayoutSwitcher layout={layout} onChange={updateLayout} />

  return (
    <div className="page-section">
      <div className="flex justify-end">
        <Link href="/products/new" className="btn-primary self-start">
          <Plus className="h-4 w-4" /> Новый продукт
        </Link>
      </div>

      <div className="flex justify-start">{layoutSwitcher}</div>

      <AnimatePresence initial={false} mode="sync">
        {layout === 'table' ? (
          <motion.div
            key="table"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            <TableViewClient
              products={tableProducts as any}
              stages={stages as any}
              currentUserRole={currentUserRole}
              embedded
            />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            <ProductsClient
              products={listProducts}
              users={users}
              currentUserRole={currentUserRole}
              embedded
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

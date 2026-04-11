'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { Filter, LayoutList, Plus, Search, Table2, X } from 'lucide-react'
import { ProductsClient } from '@/components/products/ProductsClient'
import { TableViewClient } from '@/components/table/TableViewClient'
import { FilterSelect } from '@/components/ui/FilterSelect'
import type { ProductListFilters, ProductListItem, ProductListSortDirection, ProductListSortField, ProductQuickView } from '@/lib/product-list'
import { cn, getPriorityLabel, getStatusLabel } from '@/lib/utils'
import { useEffect, useMemo, type ReactNode, useState } from 'react'

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
  priority: string
  finalDate: Date | null
  progressPercent: number
  riskScore: number
  sortOrder?: number
  isPinned?: boolean
  isFavorite?: boolean
  createdAt?: Date | string
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
  productTemplates: any[]
  stageSuggestions: Array<{ id: string; name: string }>
  currentUserRole: string
  archiveMode?: boolean
}

const layoutOptions: Array<{ value: ProductsLayoutMode; label: string; icon: typeof LayoutList }> = [
  { value: 'list', label: 'Список', icon: LayoutList },
  { value: 'table', label: 'Таблица', icon: Table2 },
]

const ALL_STATUSES = ['PLANNED', 'IN_PROGRESS', 'AT_RISK', 'DELAYED', 'COMPLETED', 'CANCELLED'] as const
const ALL_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
const SORT_OPTIONS: Array<{ value: ProductListSortField; label: string }> = [
  { value: 'manual', label: 'Ручной порядок' },
  { value: 'name', label: 'По названию' },
  { value: 'finalDate', label: 'По финальной дате' },
  { value: 'riskScore', label: 'По риску' },
  { value: 'progressPercent', label: 'По прогрессу' },
  { value: 'createdAt', label: 'По дате создания' },
]
const SORT_DIRECTION_OPTIONS = [
  { value: 'asc', label: 'По возрастанию' },
  { value: 'desc', label: 'По убыванию' },
]
const QUICK_VIEW_OPTIONS: Array<{ value: ProductQuickView; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'pinned', label: 'Закреплённые' },
  { value: 'favorite', label: 'Избранное' },
  { value: 'overdue', label: 'Просроченные' },
  { value: 'atRisk', label: 'Под риском' },
]
const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  ...ALL_STATUSES.map((status) => ({ value: status, label: getStatusLabel(status) })),
]
const PRIORITY_OPTIONS = [
  { value: '', label: 'Все приоритеты' },
  ...ALL_PRIORITIES.map((priority) => ({ value: priority, label: getPriorityLabel(priority) })),
]

function LayoutSwitcher({
  layout,
  onChange,
}: {
  layout: ProductsLayoutMode
  onChange: (nextLayout: ProductsLayoutMode) => void
}) {
  return (
    <div className="inline-flex w-full flex-wrap items-center gap-1 rounded-[24px] border border-border/70 bg-muted/85 p-1.5 sm:w-auto sm:flex-nowrap sm:rounded-full">
      {layoutOptions.map((option) => {
        const Icon = option.icon
        const active = layout === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[18px] px-4 py-2.5 text-sm font-medium transition-colors sm:min-w-[128px] sm:flex-none sm:rounded-full',
              active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {active && (
              <motion.span
                layoutId="products-layout-pill"
                className="absolute inset-0 rounded-full bg-primary shadow-card"
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
  productTemplates,
  stageSuggestions,
  currentUserRole,
  archiveMode = false,
}: ProductsWorkspaceProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const layout = getLayoutFromSearchParams(searchParams)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [responsibleFilter, setResponsibleFilter] = useState(searchParams.get('responsible') || '')
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get('priority') || '')
  const [countryFilter, setCountryFilter] = useState(searchParams.get('country') || '')
  const [quickView, setQuickView] = useState<ProductQuickView>((searchParams.get('view') as ProductQuickView) || 'all')
  const [sortField, setSortField] = useState<ProductListSortField>((searchParams.get('sort') as ProductListSortField) || 'manual')
  const [sortDirection, setSortDirection] = useState<ProductListSortDirection>(searchParams.get('dir') === 'desc' ? 'desc' : 'asc')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(searchParams.get('advanced') === '1')
  const [onlyWithOverlaps, setOnlyWithOverlaps] = useState(searchParams.get('overlaps') === '1')
  const createProductHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    const currentRoute = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`
    const nextParams = new URLSearchParams()
    nextParams.set('returnTo', currentRoute)
    return `/products/new?${nextParams.toString()}`
  }, [pathname, searchParams])
  const currentRoute = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('create')
    params.delete('returnTo')
    const query = params.toString()
    return `${pathname}${query ? `?${query}` : ''}`
  }, [pathname, searchParams])

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
  const filters = useMemo<ProductListFilters>(() => ({
    search,
    status: statusFilter,
    responsibleId: responsibleFilter,
    priority: priorityFilter,
    country: countryFilter,
    quickView,
    onlyWithOverlaps,
  }), [countryFilter, onlyWithOverlaps, priorityFilter, quickView, responsibleFilter, search, statusFilter])
  const hasActiveFilters = Boolean(
    search ||
      statusFilter ||
      responsibleFilter ||
      priorityFilter ||
      countryFilter.trim() ||
      quickView !== 'all' ||
      onlyWithOverlaps
  )

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    ;['search', 'status', 'responsible', 'priority', 'country', 'view', 'sort', 'dir', 'advanced', 'overlaps'].forEach((key) => {
      params.delete(key)
    })

    if (layout === 'table') params.set('layout', 'table')
    if (search) params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    if (responsibleFilter) params.set('responsible', responsibleFilter)
    if (priorityFilter) params.set('priority', priorityFilter)
    if (countryFilter.trim()) params.set('country', countryFilter.trim())
    if (quickView !== 'all') params.set('view', quickView)
    if (sortField !== 'manual') params.set('sort', sortField)
    if (sortField !== 'manual' && sortDirection !== 'asc') params.set('dir', sortDirection)
    if (showAdvancedFilters) params.set('advanced', '1')
    if (onlyWithOverlaps) params.set('overlaps', '1')

    const nextQuery = params.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
  }, [countryFilter, layout, onlyWithOverlaps, pathname, priorityFilter, quickView, responsibleFilter, router, search, searchParams, showAdvancedFilters, sortDirection, sortField, statusFilter])

  const resetFilters = () => {
    setSearch('')
    setStatusFilter('')
    setResponsibleFilter('')
    setPriorityFilter('')
    setCountryFilter('')
    setQuickView('all')
    setSortField('manual')
    setSortDirection('asc')
    setShowAdvancedFilters(false)
    setOnlyWithOverlaps(false)
  }

  return (
    <div className="page-section">
      <div className="surface-panel space-y-5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <h1 className="page-heading">{archiveMode ? 'Архив продуктов' : 'Продукты'}</h1>
            <p className="subtle-copy mt-1">
              {archiveMode
                ? 'Архивные продукты со всей историей, комментариями и итоговым статусом.'
                : 'Рабочий список активных продуктов и текущих статусов.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="input pl-9"
                placeholder="Поиск по названию продукта"
              />
            </div>

            <FilterSelect
              value={sortField}
              onChange={(nextValue) => setSortField(nextValue as ProductListSortField)}
              options={SORT_OPTIONS}
              placeholder="Сортировка"
              className="w-full sm:w-[210px]"
            />

            {sortField !== 'manual' && (
              <FilterSelect
                value={sortDirection}
                onChange={(nextValue) => setSortDirection(nextValue as ProductListSortDirection)}
                options={SORT_DIRECTION_OPTIONS}
                placeholder="Направление"
                className="w-full sm:w-[170px]"
              />
            )}

            <button
              onClick={() => setShowAdvancedFilters((current) => !current)}
              className={cn('btn-secondary w-full justify-center sm:w-auto', showAdvancedFilters && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}
            >
              <Filter className="h-4 w-4" />
              Фильтры
            </button>

            {hasActiveFilters && (
              <button onClick={resetFilters} className="btn-secondary w-full justify-center sm:w-auto">
                <X className="h-4 w-4" />
                Сбросить
              </button>
            )}
          </div>

          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {QUICK_VIEW_OPTIONS.map((option) => {
              const active = quickView === option.value

              return (
                <button
                  key={option.value}
                  onClick={() => setQuickView(option.value)}
                  className={cn(
                    'relative flex-shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                    active ? 'text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="products-quick-view-pill"
                      className="absolute inset-0 rounded-full bg-primary"
                      transition={{ type: 'spring', stiffness: 390, damping: 34 }}
                    />
                  )}
                  <span className="relative z-10">{option.label}</span>
                </button>
              )
            })}
          </div>

          <AnimatePresence initial={false}>
            {showAdvancedFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -8 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -8 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="surface-subtle grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-1.5">
                    <span className="label mb-0">Статус</span>
                    <FilterSelect value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} placeholder="Все статусы" />
                  </label>

                  <label className="space-y-1.5">
                    <span className="label mb-0">Приоритет</span>
                    <FilterSelect value={priorityFilter} onChange={setPriorityFilter} options={PRIORITY_OPTIONS} placeholder="Все приоритеты" />
                  </label>

                  <label className="space-y-1.5">
                    <span className="label mb-0">Ответственный</span>
                    <FilterSelect
                      value={responsibleFilter}
                      onChange={setResponsibleFilter}
                      options={[
                        { value: '', label: 'Все ответственные' },
                        ...users.map((user) => ({ value: user.id, label: user.name })),
                      ]}
                      placeholder="Все ответственные"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="label mb-0">Страна</span>
                    <input
                      value={countryFilter}
                      onChange={(event) => setCountryFilter(event.target.value)}
                      className="input"
                      placeholder="Например, Китай"
                    />
                  </label>

                  <label className="inline-flex items-center gap-2 pt-1 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={onlyWithOverlaps}
                      onChange={(event) => setOnlyWithOverlaps(event.target.checked)}
                      className="rounded border-border bg-input text-primary focus:ring-ring"
                    />
                    Только с пересечениями дат
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="w-full sm:w-auto">{layoutSwitcher}</div>
            {!archiveMode && (
              <Link href={createProductHref} scroll={false} className="btn-primary w-full justify-center self-start sm:w-auto">
                <Plus className="h-4 w-4" /> Новый продукт
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="relative">
        <AnimatePresence initial={false} mode="wait">
          {layout === 'table' ? (
            <motion.div
              key="table"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <TableViewClient
                products={tableProducts as any}
                stages={stages as any}
                currentUserRole={currentUserRole}
                embedded
                controlsHidden
                externalFilters={filters}
                externalSortField={sortField}
                externalSortDirection={sortDirection}
                archiveMode={archiveMode}
              />
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <ProductsClient
                products={listProducts}
                users={users}
                currentUserRole={currentUserRole}
                embedded
                controlsHidden
                externalFilters={filters}
                externalSortField={sortField}
                externalSortDirection={sortDirection}
                archiveMode={archiveMode}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

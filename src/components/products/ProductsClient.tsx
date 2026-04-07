'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Filter,
  GripVertical,
  Pin,
  PinOff,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { cn, detectStageOverlaps, formatDate, formatStageOverlap, getPriorityColor, getPriorityLabel, getStatusColor, getStatusLabel } from '@/lib/utils'
import { buildProductHref, getRouteWithSearch } from '@/lib/navigation'
import { FilterSelect } from '@/components/ui/FilterSelect'
import {
  filterProducts,
  hasActiveProductFilters,
  reorderProducts,
  sortProducts,
  type ProductListFilters,
  type ProductListItem,
  type ProductListSortDirection,
  type ProductListSortField,
  type ProductQuickView,
} from '@/lib/product-list'

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

const SORT_DIRECTION_OPTIONS = [
  { value: 'asc', label: 'По возрастанию' },
  { value: 'desc', label: 'По убыванию' },
]

interface ProductsClientProps {
  products: ProductListItem[]
  users: Array<{ id: string; name: string }>
  currentUserRole: string
  embedded?: boolean
  layoutSwitcher?: ReactNode
  controlsHidden?: boolean
  externalFilters?: ProductListFilters
  externalSortField?: ProductListSortField
  externalSortDirection?: ProductListSortDirection
}

interface ContextMenuState {
  productId: string
  x: number
  y: number
}

const isValidSortField = (value: string | null): value is ProductListSortField =>
  SORT_OPTIONS.some((option) => option.value === value)

const isValidQuickView = (value: string | null): value is ProductQuickView =>
  QUICK_VIEW_OPTIONS.some((option) => option.value === value)

export function ProductsClient({
  products: initialProducts,
  users,
  currentUserRole,
  embedded = false,
  layoutSwitcher,
  controlsHidden = false,
  externalFilters,
  externalSortField,
  externalSortDirection,
}: ProductsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const suppressNavigationRef = useRef(false)
  const dragSessionRef = useRef<{
    productId: string
    pointerId: number
    startX: number
    startY: number
    hasMoved: boolean
  } | null>(null)

  const [products, setProducts] = useState(initialProducts)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [responsibleFilter, setResponsibleFilter] = useState(searchParams.get('responsible') || '')
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get('priority') || '')
  const [countryFilter, setCountryFilter] = useState(searchParams.get('country') || '')
  const [quickView, setQuickView] = useState<ProductQuickView>(isValidQuickView(searchParams.get('view')) ? (searchParams.get('view') as ProductQuickView) : 'all')
  const [sortField, setSortField] = useState<ProductListSortField>(isValidSortField(searchParams.get('sort')) ? (searchParams.get('sort') as ProductListSortField) : 'manual')
  const [sortDirection, setSortDirection] = useState<ProductListSortDirection>(searchParams.get('dir') === 'desc' ? 'desc' : 'asc')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(searchParams.get('advanced') === '1')
  const [onlyWithOverlaps, setOnlyWithOverlaps] = useState(searchParams.get('overlaps') === '1')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null)
  const [savingProductId, setSavingProductId] = useState<string | null>(null)
  const [draggingProductId, setDraggingProductId] = useState<string | null>(null)
  const [dragOverState, setDragOverState] = useState<{ productId: string; position: 'before' | 'after' } | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const productsRef = useRef(products)
  const visibleProductsRef = useRef<ProductListItem[]>([])
  const dragOverStateRef = useRef<{ productId: string; position: 'before' | 'after' } | null>(null)

  const canManageProducts = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(currentUserRole)
  const canDeleteProducts = ['ADMIN', 'DIRECTOR'].includes(currentUserRole)
  const currentRoute = typeof window === 'undefined'
    ? getRouteWithSearch(pathname, searchParams.toString())
    : `${window.location.pathname}${window.location.search}`

  useEffect(() => {
    setProducts(initialProducts)
  }, [initialProducts])

  useEffect(() => {
    productsRef.current = products
  }, [products])

  useEffect(() => {
    if (controlsHidden || externalFilters || externalSortField || externalSortDirection) return

    const params = new URLSearchParams(searchParams.toString())

    ;['search', 'status', 'responsible', 'priority', 'country', 'view', 'sort', 'dir', 'advanced', 'overlaps'].forEach((key) => {
      params.delete(key)
    })

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
    const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname
    const currentUrl = `${window.location.pathname}${window.location.search}`

    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, '', nextUrl)
    }
  }, [controlsHidden, countryFilter, externalFilters, externalSortDirection, externalSortField, onlyWithOverlaps, priorityFilter, quickView, responsibleFilter, search, searchParams, showAdvancedFilters, sortDirection, sortField, statusFilter])

  useEffect(() => {
    if (!contextMenu) return

    const closeMenu = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null)
      }
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }

    const closeOnScroll = () => setContextMenu(null)

    document.addEventListener('mousedown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('scroll', closeOnScroll, true)

    return () => {
      document.removeEventListener('mousedown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!draggingProductId) {
      document.body.classList.remove('cursor-grabbing')
      return
    }

    document.body.classList.add('cursor-grabbing')

    return () => {
      document.body.classList.remove('cursor-grabbing')
    }
  }, [draggingProductId])

  const now = new Date()
  const effectiveSortField = externalSortField ?? sortField
  const effectiveSortDirection = externalSortDirection ?? sortDirection
  const filters = useMemo<ProductListFilters>(() => externalFilters ?? ({
    search,
    status: statusFilter,
    responsibleId: responsibleFilter,
    priority: priorityFilter,
    country: countryFilter,
    quickView,
    onlyWithOverlaps,
  }), [countryFilter, externalFilters, onlyWithOverlaps, priorityFilter, quickView, responsibleFilter, search, statusFilter])
  const hasActiveFilters = hasActiveProductFilters(filters)
  const filteredProducts = useMemo(() => filterProducts(products, filters), [filters, products])
  const visibleProducts = useMemo(() => sortProducts(filteredProducts, effectiveSortField, effectiveSortDirection), [effectiveSortDirection, effectiveSortField, filteredProducts])
  const canReorder = canManageProducts && effectiveSortField === 'manual' && !hasActiveFilters
  const contextProduct = contextMenu ? products.find((product) => product.id === contextMenu.productId) || null : null

  useEffect(() => {
    visibleProductsRef.current = visibleProducts
  }, [visibleProducts])

  useEffect(() => {
    dragOverStateRef.current = dragOverState
  }, [dragOverState])

  const updateProduct = (productId: string, updater: (product: ProductListItem) => ProductListItem) => {
    setProducts((currentProducts) =>
      currentProducts.map((product) => (product.id === productId ? updater(product) : product))
    )
  }

  const persistOrder = async (nextProducts: ProductListItem[]) => {
    const orderedIds = sortProducts(nextProducts, 'manual', 'asc').map((product) => product.id)
    const response = await fetch('/api/products/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    })
    const data = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(data?.error || 'Не удалось сохранить порядок продуктов')
    }
  }

  const handleToggleProductFlag = async (
    product: ProductListItem,
    field: 'isPinned' | 'isFavorite',
    nextValue: boolean
  ) => {
    if (!canManageProducts) return

    const previousProducts = products
    setSavingProductId(product.id)
    updateProduct(product.id, (currentProduct) => ({ ...currentProduct, [field]: nextValue }))
    setContextMenu(null)

    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: nextValue }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось обновить продукт')
      }

      router.refresh()
    } catch (error: any) {
      setProducts(previousProducts)
      window.alert(error.message || 'Не удалось обновить продукт')
    } finally {
      setSavingProductId(null)
    }
  }

  const handleDeleteProduct = async (productId: string, productName: string) => {
    const confirmed = window.confirm(`Удалить продукт «${productName}»?`)
    if (!confirmed) return

    const previousProducts = products
    setDeletingProductId(productId)
    setContextMenu(null)
    setProducts((currentProducts) => currentProducts.filter((product) => product.id !== productId))

    try {
      const response = await fetch(`/api/products/${productId}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось удалить продукт')
      }

      router.refresh()
    } catch (error: any) {
      setProducts(previousProducts)
      window.alert(error.message || 'Не удалось удалить продукт')
    } finally {
      setDeletingProductId(null)
    }
  }

  const handleOpenContextMenu = (event: React.MouseEvent, productId: string) => {
    event.preventDefault()

    const menuWidth = 240
    const menuHeight = 210
    const safeX = Math.min(event.clientX, window.innerWidth - menuWidth - 16)
    const safeY = Math.min(event.clientY, window.innerHeight - menuHeight - 16)

    setContextMenu({
      productId,
      x: Math.max(12, safeX),
      y: Math.max(12, safeY),
    })
  }

  const clearDragState = () => {
    dragSessionRef.current = null
    setDraggingProductId(null)
    setDragOverState(null)
    setDragOffset(null)
  }

  const resolveDropTarget = (clientY: number, draggedProductId: string) => {
    const candidateRows = visibleProductsRef.current
      .filter((product) => product.id !== draggedProductId)
      .map((product) => {
        const element = rowRefs.current[product.id]
        if (!element) return null

        return {
          productId: product.id,
          rect: element.getBoundingClientRect(),
        }
      })
      .filter((row): row is { productId: string; rect: DOMRect } => Boolean(row))

    if (!candidateRows.length) return null

    for (const row of candidateRows) {
      if (clientY >= row.rect.top && clientY <= row.rect.bottom) {
        return {
          productId: row.productId,
          position: clientY - row.rect.top > row.rect.height / 2 ? 'after' as const : 'before' as const,
        }
      }
    }

    if (clientY < candidateRows[0].rect.top) {
      return { productId: candidateRows[0].productId, position: 'before' as const }
    }

    const lastRow = candidateRows[candidateRows.length - 1]
    if (clientY > lastRow.rect.bottom) {
      return { productId: lastRow.productId, position: 'after' as const }
    }

    for (const row of candidateRows) {
      if (clientY < row.rect.top) {
        return { productId: row.productId, position: 'before' as const }
      }
    }

    return { productId: lastRow.productId, position: 'after' as const }
  }

  const handlePointerDragStart = (event: React.PointerEvent<HTMLButtonElement>, productId: string) => {
    if (!canReorder) return

    event.preventDefault()
    event.stopPropagation()

    const draggedProduct = productsRef.current.find((product) => product.id === productId)
    if (!draggedProduct) return

    suppressNavigationRef.current = false
    dragSessionRef.current = {
      productId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
    }

    setDraggingProductId(productId)
    setDragOffset({ x: 0, y: 0 })
    setContextMenu(null)
  }

  useEffect(() => {
    if (!draggingProductId) return

    const handlePointerMove = (event: PointerEvent) => {
      const session = dragSessionRef.current
      if (!session || session.pointerId !== event.pointerId) return

      const deltaX = Math.abs(event.clientX - session.startX)
      const deltaY = Math.abs(event.clientY - session.startY)
      if (!session.hasMoved && (deltaX > 4 || deltaY > 4)) {
        session.hasMoved = true
      }

      setDragOffset({
        x: event.clientX - session.startX,
        y: event.clientY - session.startY,
      })

      if (!session.hasMoved) {
        setDragOverState(null)
        return
      }

      setDragOverState(resolveDropTarget(event.clientY, session.productId))
    }

    const finalizeDrag = async (pointerId: number) => {
      const session = dragSessionRef.current
      if (!session || session.pointerId !== pointerId) return

      const target = dragOverStateRef.current
      const draggedProductId = session.productId
      const shouldSuppressClick = session.hasMoved
      clearDragState()

      if (shouldSuppressClick) {
        suppressNavigationRef.current = true
        window.setTimeout(() => {
          suppressNavigationRef.current = false
        }, 80)
      }

      if (!canReorder || !session.hasMoved || !target) return

      const previousProducts = productsRef.current
      const nextProducts = reorderProducts(previousProducts, draggedProductId, target.productId, target.position)
      const previousOrder = sortProducts(previousProducts, 'manual', 'asc').map((product) => product.id).join(',')
      const nextOrder = sortProducts(nextProducts, 'manual', 'asc').map((product) => product.id).join(',')

      if (previousOrder === nextOrder) return

      setProducts(nextProducts)

      try {
        await persistOrder(nextProducts)
        router.refresh()
      } catch (error: any) {
        setProducts(previousProducts)
        window.alert(error.message || 'Не удалось сохранить порядок продуктов')
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      void finalizeDrag(event.pointerId)
    }

    const handlePointerCancel = (event: PointerEvent) => {
      const session = dragSessionRef.current
      if (!session || session.pointerId !== event.pointerId) return
      clearDragState()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [canReorder, draggingProductId, router])

  const handleOpenProduct = (productId: string) => {
    if (suppressNavigationRef.current || draggingProductId) return
    router.push(buildProductHref(productId, currentRoute))
  }

  const resetFilters = () => {
    setSearch('')
    setStatusFilter('')
    setResponsibleFilter('')
    setPriorityFilter('')
    setCountryFilter('')
    setQuickView('all')
    setOnlyWithOverlaps(false)
    setShowAdvancedFilters(false)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {!embedded && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="page-heading">Продукты</h1>
            <p className="subtle-copy mt-1">
              {visibleProducts.length} из {products.length} продуктов
            </p>
          </div>
          <Link href="/products/new" className="btn-primary">
            <Plus className="w-4 h-4" /> Новый продукт
          </Link>
        </div>
      )}

      {!controlsHidden && (
      <div className="surface-panel space-y-5 p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
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
              className="w-[210px]"
            />

            {sortField !== 'manual' && (
              <FilterSelect
                value={sortDirection}
                onChange={(nextValue) => setSortDirection(nextValue as ProductListSortDirection)}
                options={SORT_DIRECTION_OPTIONS}
                placeholder="Направление"
                className="w-[170px]"
              />
            )}

            <button
              onClick={() => setShowAdvancedFilters((current) => !current)}
              className={cn('btn-secondary', showAdvancedFilters && 'bg-brand-950 text-white border-brand-950 hover:bg-brand-900 hover:text-white')}
            >
              <Filter className="w-4 h-4" />
              Фильтры
            </button>

            {(hasActiveFilters || sortField !== 'manual') && (
              <button onClick={resetFilters} className="btn-secondary">
                <X className="w-4 h-4" />
                Сбросить
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_VIEW_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setQuickView(option.value)}
                className={cn(
                  'rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                  quickView === option.value
                    ? 'bg-brand-950 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <AnimatePresence initial={false}>
            {showAdvancedFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -8 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="surface-subtle grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-1.5">
                    <span className="label mb-0">Статус</span>
                    <FilterSelect
                      value={statusFilter}
                      onChange={setStatusFilter}
                      options={STATUS_OPTIONS}
                      placeholder="Все статусы"
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="label mb-0">Приоритет</span>
                    <FilterSelect
                      value={priorityFilter}
                      onChange={setPriorityFilter}
                      options={PRIORITY_OPTIONS}
                      placeholder="Все приоритеты"
                    />
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

                  <label className="inline-flex items-center gap-2 pt-1 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={onlyWithOverlaps}
                      onChange={(event) => setOnlyWithOverlaps(event.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Только с пересечениями дат
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {layoutSwitcher && <div className="pt-1">{layoutSwitcher}</div>}
        </div>
      </div>
      )}

      <div className="surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="table-header w-12 text-center">#</th>
                <th className="table-header w-14 text-center">Порядок</th>
                <th className="table-header min-w-[280px]">Продукт</th>
                <th className="table-header w-24">Страна</th>
                <th className="table-header w-32">Статус</th>
                <th className="table-header w-28">Приоритет</th>
                <th className="table-header w-28">Ответственный</th>
                <th className="table-header w-32">Прогресс</th>
                <th className="table-header w-28">Дата готовн.</th>
                <th className="table-header w-20">Риск</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleProducts.map((product, index) => {
                const isOverdue = Boolean(product.finalDate && new Date(product.finalDate) < now && product.status !== 'COMPLETED')
                const { overlaps } = detectStageOverlaps(product.stages)
                const isDragging = draggingProductId === product.id
                const isDropTarget = dragOverState?.productId === product.id
                const showDropBefore = isDropTarget && dragOverState?.position === 'before'
                const showDropAfter = isDropTarget && dragOverState?.position === 'after'

                return (
                  <tr
                    key={product.id}
                    ref={(node) => {
                      rowRefs.current[product.id] = node
                    }}
                    data-product-row="true"
                    onClick={() => handleOpenProduct(product.id)}
                    onContextMenu={(event) => handleOpenContextMenu(event, product.id)}
                    className={cn(
                      'relative cursor-pointer transition-all duration-150 hover:bg-slate-50/70',
                      isDragging && 'bg-white shadow-[0_22px_44px_-30px_rgba(15,23,42,0.45)]',
                      showDropBefore && 'border-t-2 border-slate-300',
                      showDropAfter && 'border-b-2 border-slate-300'
                    )}
                    style={isDragging && dragOffset ? {
                      transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
                      zIndex: 30,
                    } : undefined}
                  >
                    <td className={cn('table-cell text-center text-slate-400 text-xs', isDragging && 'bg-white')}>
                      <div className="flex items-center justify-center">
                        <span>{index + 1}</span>
                      </div>
                    </td>
                    <td className={cn('table-cell text-center relative', isDragging && 'bg-white')} onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onPointerDown={(event) => handlePointerDragStart(event, product.id)}
                        disabled={!canReorder || savingProductId === product.id || deletingProductId === product.id}
                        className={cn(
                          'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-150',
                          canReorder
                            ? 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing'
                            : 'border-slate-100 text-slate-300 cursor-not-allowed',
                          isDragging && 'border-slate-300 bg-white text-slate-700 shadow-sm'
                        )}
                        title={canReorder ? 'Перетащить продукт' : 'Перетаскивание сейчас недоступно'}
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-white')}>
                      <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex items-center gap-1">
                          <Pin className={cn('w-3.5 h-3.5', product.isPinned ? 'text-slate-700 fill-slate-200' : 'text-slate-300')} />
                          <Star className={cn('w-3.5 h-3.5', product.isFavorite ? 'text-slate-700 fill-slate-200' : 'text-slate-300')} />
                        </div>
                        <div className="min-w-0">
                          <Link href={buildProductHref(product.id, currentRoute)} className="text-[19px] font-medium leading-[1.25] tracking-normal text-slate-800 hover:text-brand-700 transition-colors">
                            {product.name.length > 70 ? `${product.name.slice(0, 70)}…` : product.name}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[15px] leading-6 text-slate-400">
                            <span>{product._count.stages} этапов</span>
                            <span>•</span>
                            <span>{product._count.comments} комм.</span>
                            {product.isPinned && <span className="font-medium text-slate-600">• закреплён</span>}
                            {product.isFavorite && <span className="font-medium text-slate-600">• избранное</span>}
                            {overlaps.length > 0 && (
                              <span
                                className="text-orange-600 font-medium"
                                title={overlaps.map((overlap) => formatStageOverlap(overlap)).join(', ')}
                              >
                                • ⚠ {overlaps.length} пересеч.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-white')}>
                      <span className="text-[15px] leading-6 text-slate-500">{product.country || '—'}</span>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-white')}>
                      <span className={cn('badge text-xs', getStatusColor(product.status))}>{getStatusLabel(product.status)}</span>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-white')}>
                      <span className={cn('badge text-xs border', getPriorityColor(product.priority))}>{getPriorityLabel(product.priority)}</span>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-white')}>
                      <span className="text-[15px] leading-6 text-slate-600">{product.responsible?.name || '—'}</span>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-white')}>
                      <div className="flex items-center gap-2">
                        <div className="progress-bar flex-1">
                          <div
                            className={cn(
                              'progress-fill',
                              product.progressPercent < 30 ? 'bg-red-400' : product.progressPercent < 70 ? 'bg-amber-400' : 'bg-emerald-500'
                            )}
                            style={{ width: `${product.progressPercent}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-[15px] leading-6 text-slate-500">{product.progressPercent}%</span>
                      </div>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-white')}>
                      <span className={cn('text-[15px] font-medium leading-6', isOverdue ? 'text-red-600' : 'text-slate-600')}>
                        {formatDate(product.finalDate)}
                      </span>
                      {isOverdue && <div className="mt-0.5 text-[15px] leading-6 text-red-500">просрочен</div>}
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-white')}>
                      <div
                        className={cn(
                          'inline-flex h-8 w-8 items-center justify-center rounded-lg text-[15px] font-semibold leading-none',
                          product.riskScore >= 70
                            ? 'bg-red-100 text-red-700'
                            : product.riskScore >= 40
                              ? 'bg-amber-100 text-amber-700'
                              : product.riskScore > 0
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-500'
                        )}
                      >
                        {product.riskScore}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {visibleProducts.length === 0 && (
            <div className="py-16 text-center text-slate-400">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">По текущим фильтрам продукты не найдены</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {contextMenu && contextProduct && (
        <motion.div
          ref={contextMenuRef}
          className="fixed z-50 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          initial={{ opacity: 0, scale: 0.96, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -4 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="px-2.5 py-2 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-800 truncate">{contextProduct.name}</div>
            <div className="text-xs text-slate-400 mt-0.5">Быстрые действия по продукту</div>
          </div>

          <div className="py-1">
              <button
                onClick={() => {
                  setContextMenu(null)
                  router.push(buildProductHref(contextProduct.id, currentRoute))
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
              <Search className="w-4 h-4 text-slate-400" />
              Открыть продукт
            </button>

            {canManageProducts && (
              <>
                <button
                  onClick={() => handleToggleProductFlag(contextProduct, 'isPinned', !contextProduct.isPinned)}
                  disabled={savingProductId === contextProduct.id}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {contextProduct.isPinned ? (
                    <PinOff className="w-4 h-4 text-slate-400" />
                  ) : (
                    <Pin className="w-4 h-4 text-slate-400" />
                  )}
                  {contextProduct.isPinned ? 'Снять закрепление' : 'Закрепить наверху'}
                </button>

                <button
                  onClick={() => handleToggleProductFlag(contextProduct, 'isFavorite', !contextProduct.isFavorite)}
                  disabled={savingProductId === contextProduct.id}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Star className={cn('w-4 h-4', contextProduct.isFavorite ? 'text-amber-500 fill-amber-100' : 'text-slate-400')} />
                  {contextProduct.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                </button>
              </>
            )}

            {canDeleteProducts && (
              <>
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => handleDeleteProduct(contextProduct.id, contextProduct.name)}
                  disabled={deletingProductId === contextProduct.id}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4" />
                  {deletingProductId === contextProduct.id ? 'Удаление...' : 'Удалить продукт'}
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}

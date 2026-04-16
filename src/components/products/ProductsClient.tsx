'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Archive,
  Filter,
  GripVertical,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { cn, detectStageOverlaps, formatDate, formatStageOverlap, getPriorityColor, getPriorityLabel, getStatusColor, getStatusLabel } from '@/lib/utils'
import { buildProductHref, getRouteWithSearch } from '@/lib/navigation'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FloatingContextMenu } from '@/components/ui/FloatingContextMenu'
import { useContextMenu } from '@/hooks/useContextMenu'
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
  archiveMode?: boolean
}

interface ContextMenuState {
  productId: string
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
  archiveMode = false,
}: ProductsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
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
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null)
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<{ id: string; name: string } | null>(null)
  const [archivingProductId, setArchivingProductId] = useState<string | null>(null)
  const [pendingArchiveProduct, setPendingArchiveProduct] = useState<{ id: string; name: string } | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [bulkAction, setBulkAction] = useState<'restore' | 'deleteArchived' | null>(null)
  const [bulkActionPending, setBulkActionPending] = useState(false)
  const [savingProductId, setSavingProductId] = useState<string | null>(null)
  const [draggingProductId, setDraggingProductId] = useState<string | null>(null)
  const [dragOverState, setDragOverState] = useState<{ productId: string; position: 'before' | 'after' } | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const productsRef = useRef(products)
  const visibleProductsRef = useRef<ProductListItem[]>([])
  const dragOverStateRef = useRef<{ productId: string; position: 'before' | 'after' } | null>(null)
  const {
    menu: contextMenu,
    menuRef: contextMenuRef,
    closeMenu: closeContextMenu,
    openMenuFromEvent: openContextMenuFromEvent,
  } = useContextMenu<ContextMenuState>({
    width: 240,
    height: archiveMode ? 260 : 320,
  })

  const canManageProducts = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(currentUserRole) && !archiveMode
  const canArchiveProducts = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(currentUserRole) && !archiveMode
  const canDeleteProducts = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(currentUserRole)
  const currentRoute = typeof window === 'undefined'
    ? getRouteWithSearch(pathname, searchParams.toString())
    : `${window.location.pathname}${window.location.search}`
  const createProductHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('create')
    params.delete('returnTo')
    const returnTo = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`
    const nextParams = new URLSearchParams()
    nextParams.set('returnTo', returnTo)
    return `/products/new?${nextParams.toString()}`
  }, [pathname, searchParams])

  useEffect(() => {
    setProducts(initialProducts)
  }, [initialProducts])

  useEffect(() => {
    if (!archiveMode) {
      setSelectionMode(false)
      setSelectedProductIds([])
      setBulkAction(null)
      return
    }

    setSelectedProductIds((currentIds) =>
      currentIds.filter((id) => initialProducts.some((product) => product.id === id))
    )
  }, [archiveMode, initialProducts])

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
  const visibleSelectedCount = useMemo(
    () => visibleProducts.filter((product) => selectedProductIds.includes(product.id)).length,
    [selectedProductIds, visibleProducts]
  )
  const allVisibleSelected = archiveMode && visibleProducts.length > 0 && visibleSelectedCount === visibleProducts.length

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
    closeContextMenu()

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
    setPendingDeleteProduct({ id: productId, name: productName })
  }

  const confirmDeleteProduct = async () => {
    if (!pendingDeleteProduct) return
    const previousProducts = products
    setDeletingProductId(pendingDeleteProduct.id)
    closeContextMenu()
    setProducts((currentProducts) => currentProducts.filter((product) => product.id !== pendingDeleteProduct.id))

    try {
      const response = await fetch(`/api/products/${pendingDeleteProduct.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось удалить продукт')
      }

      setPendingDeleteProduct(null)
      router.refresh()
    } catch (error: any) {
      setProducts(previousProducts)
      window.alert(error.message || 'Не удалось удалить продукт')
    } finally {
      setDeletingProductId(null)
    }
  }

  const confirmArchiveProduct = async () => {
    if (!pendingArchiveProduct) return

    const previousProducts = products
    setArchivingProductId(pendingArchiveProduct.id)
    closeContextMenu()
    setProducts((currentProducts) => currentProducts.filter((product) => product.id !== pendingArchiveProduct.id))

    try {
      const response = await fetch(`/api/products/${pendingArchiveProduct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось архивировать продукт')
      }

      setPendingArchiveProduct(null)
      router.refresh()
    } catch (error: any) {
      setProducts(previousProducts)
      window.alert(error.message || 'Не удалось архивировать продукт')
    } finally {
      setArchivingProductId(null)
    }
  }

  const toggleSelectedProduct = (productId: string) => {
    setSelectionMode(true)
    setSelectedProductIds((currentIds) =>
      currentIds.includes(productId)
        ? currentIds.filter((id) => id !== productId)
        : [...currentIds, productId]
    )
  }

  const handleSelectAllVisible = () => {
    setSelectionMode(true)
    setSelectedProductIds(visibleProducts.map((product) => product.id))
  }

  const handleClearSelection = () => {
    setSelectionMode(false)
    setSelectedProductIds([])
  }

  const confirmBulkArchiveAction = async () => {
    if (!bulkAction || selectedProductIds.length === 0) return

    const previousProducts = products
    const affectedIds = new Set(selectedProductIds)

    setBulkActionPending(true)
    closeContextMenu()
    setProducts((currentProducts) => currentProducts.filter((product) => !affectedIds.has(product.id)))

    try {
      const response = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: bulkAction,
          ids: selectedProductIds,
        }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось выполнить действие над архивом')
      }

      setSelectedProductIds([])
      setSelectionMode(false)
      setBulkAction(null)
      router.refresh()
    } catch (error: any) {
      setProducts(previousProducts)
      window.alert(error.message || 'Не удалось выполнить действие над архивом')
    } finally {
      setBulkActionPending(false)
    }
  }

  const handleProductRowContextMenu = useCallback((event: React.MouseEvent<HTMLTableRowElement>, productId: string) => {
    suppressNavigationRef.current = true
    window.setTimeout(() => {
      suppressNavigationRef.current = false
    }, 120)

    openContextMenuFromEvent(
      event,
      { productId },
      { width: 240, height: archiveMode ? 260 : 320 }
    )
  }, [archiveMode, openContextMenuFromEvent])

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
    closeContextMenu()
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <h1 className="page-heading">Продукты</h1>
            <p className="subtle-copy mt-1">
              {visibleProducts.length} из {products.length} {archiveMode ? 'архивных' : ''} продуктов
            </p>
          </div>
          {!archiveMode && (
            <Link href={createProductHref} className="btn-primary w-full justify-center sm:w-auto">
              <Plus className="w-4 h-4" /> Новый продукт
            </Link>
          )}
        </div>
      )}

      {!controlsHidden && (
      <div className="surface-panel space-y-5 p-4 sm:p-5">
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
              <Filter className="w-4 h-4" />
              Фильтры
            </button>

            {(hasActiveFilters || sortField !== 'manual') && (
              <button onClick={resetFilters} className="btn-secondary w-full justify-center sm:w-auto">
                <X className="w-4 h-4" />
                Сбросить
              </button>
            )}
          </div>

          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {QUICK_VIEW_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setQuickView(option.value)}
                className={cn(
                  'flex-shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                  quickView === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
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

                  <label className="inline-flex items-center gap-2 pt-1 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={onlyWithOverlaps}
                      onChange={(event) => setOnlyWithOverlaps(event.target.checked)}
                      className="rounded border-border text-primary focus:ring-ring"
                    />
                    Только с пересечениями дат
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {layoutSwitcher && <div className="w-full pt-1 sm:w-auto">{layoutSwitcher}</div>}

          {archiveMode && (
            <div className="flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => setSelectionMode(true)}
                className="btn-secondary w-full justify-center sm:w-auto"
              >
                Выбрать
              </button>
              <button
                type="button"
                onClick={handleSelectAllVisible}
                className="btn-secondary w-full justify-center sm:w-auto"
                disabled={!visibleProducts.length}
              >
                Выбрать все
              </button>

              {(selectionMode || selectedProductIds.length > 0) && (
                <>
                  <div className="text-sm text-muted-foreground">
                    Выбрано: <span className="font-medium text-foreground">{selectedProductIds.length}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBulkAction('restore')}
                    className="btn-secondary w-full justify-center sm:w-auto"
                    disabled={!selectedProductIds.length || bulkActionPending}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Восстановить
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkAction('deleteArchived')}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    disabled={!selectedProductIds.length || bulkActionPending}
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="btn-secondary w-full justify-center sm:w-auto"
                    disabled={bulkActionPending}
                  >
                    Снять выбор
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      <div className="space-y-4 lg:hidden">
        {visibleProducts.map((product, index) => {
          const isOverdue = Boolean(product.finalDate && new Date(product.finalDate) < now && product.status !== 'COMPLETED')
          const { overlaps } = detectStageOverlaps(product.stages)
          const selected = selectedProductIds.includes(product.id)

          return (
            <article
              key={product.id}
              className="surface-panel space-y-4 p-4"
              onClick={() => handleOpenProduct(product.id)}
            >
              <div className="flex items-start gap-3">
                {archiveMode && selectionMode && (
                  <div className="pt-1" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelectedProduct(product.id)}
                      className="h-5 w-5 rounded border-border text-primary focus:ring-ring"
                      aria-label={`Выбрать продукт ${product.name}`}
                    />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                    <span className={cn('badge text-xs', getStatusColor(product.status))}>{getStatusLabel(product.status)}</span>
                    <span className={cn('badge border text-xs', getPriorityColor(product.priority))}>{getPriorityLabel(product.priority)}</span>
                    {product.country && <span className="badge bg-muted text-xs text-muted-foreground">{product.country}</span>}
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold leading-6 text-foreground">{product.name}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{product._count.stages} этапов</span>
                        <span>•</span>
                        <span>{product._count.comments} комм.</span>
                        {product.responsible?.name && (
                          <>
                            <span>•</span>
                            <span>{product.responsible.name}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Pin className={cn('h-3.5 w-3.5', product.isPinned ? 'fill-muted text-foreground' : 'text-muted-foreground/60')} />
                      <Star className={cn('h-3.5 w-3.5', product.isFavorite ? 'fill-amber-200 text-amber-600 dark:fill-amber-500/20 dark:text-amber-300' : 'text-muted-foreground/60')} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 rounded-[24px] bg-muted/45 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Прогресс</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="progress-bar flex-1">
                      <div
                        className={cn(
                          'progress-fill',
                          product.progressPercent < 30 ? 'bg-red-400' : product.progressPercent < 70 ? 'bg-amber-400' : 'bg-emerald-500'
                        )}
                        style={{ width: `${product.progressPercent}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-foreground">{product.progressPercent}%</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Финальная дата</p>
                    <p className={cn('mt-1 text-sm font-medium', isOverdue ? 'text-red-600 dark:text-red-300' : 'text-foreground')}>
                      {formatDate(product.finalDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Риск</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{product.riskScore}/100</p>
                  </div>
                </div>
              </div>

              {overlaps.length > 0 && (
                <div
                  className="rounded-[20px] border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
                  title={overlaps.map((overlap) => formatStageOverlap(overlap)).join(', ')}
                >
                  Обнаружено пересечений: {overlaps.length}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleOpenProduct(product.id)
                  }}
                  className="btn-primary w-full justify-center sm:w-auto"
                >
                  Открыть
                </button>

                {canManageProducts && (
                  <>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleToggleProductFlag(product, 'isPinned', !product.isPinned)
                      }}
                      className="btn-secondary w-full justify-center sm:w-auto"
                      disabled={savingProductId === product.id}
                    >
                      {product.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                      {product.isPinned ? 'Открепить' : 'Закрепить'}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleToggleProductFlag(product, 'isFavorite', !product.isFavorite)
                      }}
                      className="btn-secondary w-full justify-center sm:w-auto"
                      disabled={savingProductId === product.id}
                    >
                      <Star className="h-4 w-4" />
                      {product.isFavorite ? 'Убрать из избранного' : 'В избранное'}
                    </button>
                  </>
                )}

                {canArchiveProducts && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setPendingArchiveProduct({ id: product.id, name: product.name })
                    }}
                    className="btn-secondary w-full justify-center sm:w-auto"
                    disabled={archivingProductId === product.id}
                  >
                    <Archive className="h-4 w-4" />
                    Архивировать
                  </button>
                )}

                {archiveMode && canDeleteProducts && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setBulkAction(null)
                      handleDeleteProduct(product.id, product.name)
                    }}
                    className="btn-danger w-full justify-center sm:w-auto"
                    disabled={deletingProductId === product.id}
                  >
                    <Trash2 className="h-4 w-4" />
                    Удалить
                  </button>
                )}
              </div>
            </article>
          )
        })}

        {visibleProducts.length === 0 && (
          <div className="surface-panel py-14 text-center text-muted-foreground">
            <Search className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p className="text-sm">По текущим фильтрам продукты не найдены</p>
          </div>
        )}
      </div>

      <div className="surface-panel hidden overflow-hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/70">
                {archiveMode && selectionMode && (
                  <th className="table-header w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(event) => {
                        if (event.target.checked) {
                          handleSelectAllVisible()
                        } else {
                          setSelectedProductIds([])
                        }
                      }}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                      aria-label="Выбрать все архивные продукты"
                    />
                  </th>
                )}
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
            <tbody className="divide-y divide-border/60">
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
                    data-product-context-id={product.id}
                    ref={(node) => {
                      rowRefs.current[product.id] = node
                    }}
                    data-product-row="true"
                    onClick={() => handleOpenProduct(product.id)}
                    onContextMenu={(event) => handleProductRowContextMenu(event, product.id)}
                    className={cn(
                      'relative cursor-pointer transition-all duration-150 hover:bg-accent/35',
                      isDragging && 'bg-card shadow-card-hover',
                      showDropBefore && 'border-t-2 border-border',
                      showDropAfter && 'border-b-2 border-border'
                    )}
                    style={isDragging && dragOffset ? {
                      transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
                      zIndex: 30,
                    } : undefined}
                  >
                    {archiveMode && selectionMode && (
                      <td
                        className={cn('table-cell w-10 text-center', isDragging && 'bg-card')}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(product.id)}
                          onChange={() => toggleSelectedProduct(product.id)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                          aria-label={`Выбрать продукт ${product.name}`}
                        />
                      </td>
                    )}
                    <td className={cn('table-cell text-center text-xs text-muted-foreground', isDragging && 'bg-card')}>
                      <div className="flex items-center justify-center">
                        <span>{index + 1}</span>
                      </div>
                    </td>
                    <td className={cn('table-cell relative text-center', isDragging && 'bg-card')} onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        onPointerDown={(event) => handlePointerDragStart(event, product.id)}
                        disabled={!canReorder || savingProductId === product.id || deletingProductId === product.id}
                        className={cn(
                          'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-150',
                          canReorder
                            ? 'cursor-grab border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground active:cursor-grabbing'
                            : 'cursor-not-allowed border-border/40 text-muted-foreground/50',
                          isDragging && 'border-border bg-card text-foreground shadow-sm'
                        )}
                        title={canReorder ? 'Перетащить продукт' : 'Перетаскивание сейчас недоступно'}
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-card')}>
                      <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex items-center gap-1">
                          <Pin className={cn('h-3.5 w-3.5', product.isPinned ? 'fill-muted text-foreground' : 'text-muted-foreground/60')} />
                          <Star className={cn('h-3.5 w-3.5', product.isFavorite ? 'fill-amber-200 text-amber-600 dark:fill-amber-500/20 dark:text-amber-300' : 'text-muted-foreground/60')} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[19px] font-medium leading-[1.25] tracking-normal text-foreground transition-colors">
                            {product.name.length > 70 ? `${product.name.slice(0, 70)}…` : product.name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[15px] leading-6 text-muted-foreground">
                            <span>{product._count.stages} этапов</span>
                            <span>•</span>
                            <span>{product._count.comments} комм.</span>
                            {product.isPinned && <span className="font-medium text-foreground">• закреплён</span>}
                            {product.isFavorite && <span className="font-medium text-foreground">• избранное</span>}
                            {overlaps.length > 0 && (
                              <span
                                className="font-medium text-amber-600 dark:text-amber-300"
                                title={overlaps.map((overlap) => formatStageOverlap(overlap)).join(', ')}
                              >
                                • ⚠ {overlaps.length} пересеч.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-card')}>
                      <span className="text-[15px] leading-6 text-muted-foreground">{product.country || '—'}</span>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-card')}>
                      <span className={cn('badge text-xs', getStatusColor(product.status))}>{getStatusLabel(product.status)}</span>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-card')}>
                      <span className={cn('badge text-xs border', getPriorityColor(product.priority))}>{getPriorityLabel(product.priority)}</span>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-card')}>
                      <span className="text-[15px] leading-6 text-foreground">{product.responsible?.name || '—'}</span>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-card')}>
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
                        <span className="w-8 text-right text-[15px] leading-6 text-muted-foreground">{product.progressPercent}%</span>
                      </div>
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-card')}>
                      <span className={cn('text-[15px] font-medium leading-6', isOverdue ? 'text-red-600 dark:text-red-300' : 'text-foreground')}>
                        {formatDate(product.finalDate)}
                      </span>
                      {isOverdue && <div className="mt-0.5 text-[15px] leading-6 text-red-500 dark:text-red-300">просрочен</div>}
                    </td>
                    <td className={cn('table-cell', isDragging && 'bg-card')}>
                      <div
                        className={cn(
                          'inline-flex h-8 w-8 items-center justify-center rounded-lg text-[15px] font-semibold leading-none',
                          product.riskScore >= 70
                            ? 'bg-red-100 text-red-700 dark:text-red-300'
                            : product.riskScore >= 40
                              ? 'bg-amber-100 text-amber-700 dark:text-amber-300'
                              : product.riskScore > 0
                                ? 'bg-blue-100 text-blue-700 dark:text-blue-300'
                                : 'bg-muted text-muted-foreground'
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
            <div className="py-16 text-center text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">По текущим фильтрам продукты не найдены</p>
            </div>
          )}
        </div>
      </div>

      {contextMenu && contextProduct && (
        <FloatingContextMenu
          open
          x={contextMenu.x}
          y={contextMenu.y}
          menuRef={contextMenuRef}
          className="fixed z-[90] w-60 rounded-xl border border-border/80 bg-popover p-2 text-popover-foreground shadow-modal"
        >
            <div className="border-b border-border/70 px-2.5 py-2">
              <div className="truncate text-sm font-semibold text-popover-foreground">{contextProduct.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Быстрые действия по продукту</div>
            </div>

            <div className="py-1">
              <button
                onClick={() => {
                  closeContextMenu()
                  router.push(buildProductHref(contextProduct.id, currentRoute))
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
              >
                <Search className="h-4 w-4 text-muted-foreground" />
                Открыть продукт
              </button>

              {canManageProducts && (
                <>
                  <button
                    onClick={() => handleToggleProductFlag(contextProduct, 'isPinned', !contextProduct.isPinned)}
                    disabled={savingProductId === contextProduct.id}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-accent disabled:opacity-60"
                  >
                    {contextProduct.isPinned ? (
                      <PinOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Pin className="h-4 w-4 text-muted-foreground" />
                    )}
                    {contextProduct.isPinned ? 'Открепить' : 'Закрепить наверху'}
                  </button>

                  <button
                    onClick={() => handleToggleProductFlag(contextProduct, 'isFavorite', !contextProduct.isFavorite)}
                    disabled={savingProductId === contextProduct.id}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-accent disabled:opacity-60"
                  >
                    <Star className={cn('h-4 w-4', contextProduct.isFavorite ? 'fill-amber-100 text-amber-500 dark:fill-amber-500/20 dark:text-amber-300' : 'text-muted-foreground')} />
                    {contextProduct.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                  </button>
                </>
              )}

              {canArchiveProducts && (
                <>
                  <div className="my-1 border-t border-border/70" />
                  <button
                    onClick={() => setPendingArchiveProduct({ id: contextProduct.id, name: contextProduct.name })}
                    disabled={archivingProductId === contextProduct.id}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10 disabled:opacity-60"
                  >
                    <Archive className="h-4 w-4" />
                    {archivingProductId === contextProduct.id ? 'Архивация...' : 'Архивировать продукт'}
                  </button>
                </>
              )}

              {archiveMode && canDeleteProducts && (
                <>
                  <div className="my-1 border-t border-border/70" />
                  <button
                    onClick={() => handleDeleteProduct(contextProduct.id, contextProduct.name)}
                    disabled={deletingProductId === contextProduct.id}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingProductId === contextProduct.id ? 'Удаление...' : 'Удалить архивный продукт'}
                  </button>
                </>
              )}
            </div>
        </FloatingContextMenu>
      )}

      <ConfirmDialog
        open={Boolean(pendingArchiveProduct)}
        title="Архивировать продукт?"
        description={
          pendingArchiveProduct
            ? `Продукт «${pendingArchiveProduct.name}» исчезнет из активных списков, но этапы, комментарии и история сохранятся.`
            : ''
        }
        confirmLabel="Архивировать"
        confirmTone="primary"
        loading={Boolean(pendingArchiveProduct && archivingProductId === pendingArchiveProduct.id)}
        onCancel={() => setPendingArchiveProduct(null)}
        onConfirm={confirmArchiveProduct}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteProduct)}
        title={archiveMode ? 'Удалить архивный продукт?' : 'Удалить продукт?'}
        description={
          pendingDeleteProduct
            ? archiveMode
              ? `Архивный продукт «${pendingDeleteProduct.name}» будет удалён навсегда вместе со всеми этапами, комментариями и историей.`
              : `Продукт «${pendingDeleteProduct.name}» будет удалён вместе со всеми связанными этапами, комментариями и историей.`
            : ''
        }
        confirmLabel={archiveMode ? 'Удалить навсегда' : 'Удалить'}
        loading={Boolean(pendingDeleteProduct && deletingProductId === pendingDeleteProduct.id)}
        onCancel={() => setPendingDeleteProduct(null)}
        onConfirm={confirmDeleteProduct}
      />

      <ConfirmDialog
        open={bulkAction !== null}
        title={bulkAction === 'restore' ? 'Восстановить выбранные продукты?' : 'Удалить выбранные архивные продукты?'}
        description={
          bulkAction === 'restore'
            ? `Выбранные архивные продукты (${selectedProductIds.length}) вернутся в активный список.`
            : `Выбранные архивные продукты (${selectedProductIds.length}) будут удалены навсегда вместе со всеми этапами, комментариями и историей.`
        }
        confirmLabel={bulkAction === 'restore' ? 'Восстановить выбранные' : 'Удалить выбранные'}
        confirmTone={bulkAction === 'restore' ? 'primary' : 'danger'}
        loading={bulkActionPending}
        onCancel={() => {
          if (bulkActionPending) return
          setBulkAction(null)
        }}
        onConfirm={confirmBulkArchiveAction}
      />
    </div>
  )
}

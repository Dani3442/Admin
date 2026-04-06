'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
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
import { cn, detectStageOverlaps, formatDate, getPriorityColor, getPriorityLabel, getStatusColor, getStatusLabel } from '@/lib/utils'
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

interface ProductsClientProps {
  products: ProductListItem[]
  users: Array<{ id: string; name: string }>
  currentUserRole: string
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

export function ProductsClient({ products: initialProducts, users, currentUserRole }: ProductsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const contextMenuRef = useRef<HTMLDivElement>(null)

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

  const canManageProducts = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(currentUserRole)
  const canDeleteProducts = ['ADMIN', 'DIRECTOR'].includes(currentUserRole)

  useEffect(() => {
    setProducts(initialProducts)
  }, [initialProducts])

  useEffect(() => {
    const params = new URLSearchParams()

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
  }, [countryFilter, onlyWithOverlaps, priorityFilter, quickView, responsibleFilter, search, showAdvancedFilters, sortDirection, sortField, statusFilter])

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

  const now = new Date()
  const filters = useMemo<ProductListFilters>(() => ({
    search,
    status: statusFilter,
    responsibleId: responsibleFilter,
    priority: priorityFilter,
    country: countryFilter,
    quickView,
    onlyWithOverlaps,
  }), [countryFilter, onlyWithOverlaps, priorityFilter, quickView, responsibleFilter, search, statusFilter])
  const hasActiveFilters = hasActiveProductFilters(filters)
  const filteredProducts = useMemo(() => filterProducts(products, filters), [filters, products])
  const visibleProducts = useMemo(() => sortProducts(filteredProducts, sortField, sortDirection), [filteredProducts, sortDirection, sortField])
  const canReorder = canManageProducts && sortField === 'manual' && !hasActiveFilters
  const contextProduct = contextMenu ? products.find((product) => product.id === contextMenu.productId) || null : null

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

  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>, productId: string) => {
    if (!canReorder) return

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', productId)
    setDraggingProductId(productId)
    setContextMenu(null)
  }

  const handleDragOver = (event: React.DragEvent<HTMLTableRowElement>, productId: string) => {
    if (!canReorder || !draggingProductId || draggingProductId === productId) return

    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY - rect.top > rect.height / 2 ? 'after' : 'before'
    setDragOverState({ productId, position })
  }

  const handleDragEnd = () => {
    setDraggingProductId(null)
    setDragOverState(null)
  }

  const handleDrop = async (event: React.DragEvent<HTMLTableRowElement>, targetProductId: string) => {
    event.preventDefault()

    if (!canReorder || !draggingProductId || !dragOverState) return

    const previousProducts = products
    const nextProducts = reorderProducts(previousProducts, draggingProductId, targetProductId, dragOverState.position)
    const previousOrder = sortProducts(previousProducts, 'manual', 'asc').map((product) => product.id).join(',')
    const nextOrder = sortProducts(nextProducts, 'manual', 'asc').map((product) => product.id).join(',')

    handleDragEnd()

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
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Продукты</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {visibleProducts.length} из {products.length} продуктов
          </p>
        </div>
        <Link href="/products/new" className="btn-primary">
          <Plus className="w-4 h-4" /> Новый продукт
        </Link>
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input pl-9"
              placeholder="Поиск по названию продукта"
            />
          </div>

          <select value={sortField} onChange={(event) => setSortField(event.target.value as ProductListSortField)} className="input w-[210px]">
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {sortField !== 'manual' && (
            <select
              value={sortDirection}
              onChange={(event) => setSortDirection(event.target.value as ProductListSortDirection)}
              className="input w-[160px]"
            >
              <option value="asc">По возрастанию</option>
              <option value="desc">По убыванию</option>
            </select>
          )}

          <button
            onClick={() => setShowAdvancedFilters((current) => !current)}
            className={cn('btn-secondary', showAdvancedFilters && 'border-brand-200 text-brand-700 bg-brand-50')}
          >
            <Filter className="w-4 h-4" />
            Расширенные фильтры
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
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                quickView === option.value
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-800'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {showAdvancedFilters && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 pt-1">
            <label className="space-y-1.5">
              <span className="label mb-0">Статус</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="input">
                <option value="">Все статусы</option>
                {ALL_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {getStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="label mb-0">Приоритет</span>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="input">
                <option value="">Все приоритеты</option>
                {ALL_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {getPriorityLabel(priority)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="label mb-0">Ответственный</span>
              <select value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)} className="input">
                <option value="">Все ответственные</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
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

            <label className="inline-flex items-center gap-2 text-sm text-slate-600 pt-1">
              <input
                type="checkbox"
                checked={onlyWithOverlaps}
                onChange={(event) => setOnlyWithOverlaps(event.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Только с пересечениями дат
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3">
          <div className="text-sm text-slate-600">
            {canReorder
              ? 'Ручной порядок активен: продукты можно перетаскивать за маркер слева. Закреплённые элементы всегда остаются выше остальных.'
              : 'Перетаскивание доступно только в режиме “Ручной порядок” без активных фильтров и быстрых представлений.'}
          </div>
          <div className="text-xs text-slate-500">
            Удаление, закрепление и избранное доступны через правый клик по строке.
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
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
            <tbody className="divide-y divide-slate-50">
              {visibleProducts.map((product, index) => {
                const isOverdue = Boolean(product.finalDate && new Date(product.finalDate) < now && product.status !== 'COMPLETED')
                const { overlaps } = detectStageOverlaps(product.stages)
                const isDragging = draggingProductId === product.id
                const isDropTarget = dragOverState?.productId === product.id

                return (
                  <tr
                    key={product.id}
                    onClick={() => router.push(`/products/${product.id}`)}
                    onContextMenu={(event) => handleOpenContextMenu(event, product.id)}
                    onDragOver={(event) => handleDragOver(event, product.id)}
                    onDrop={(event) => handleDrop(event, product.id)}
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-slate-50/70',
                      isDragging && 'opacity-60',
                      isDropTarget && dragOverState?.position === 'before' && 'border-t-2 border-brand-500',
                      isDropTarget && dragOverState?.position === 'after' && 'border-b-2 border-brand-500'
                    )}
                  >
                    <td className="table-cell text-center text-slate-400 text-xs">{index + 1}</td>
                    <td className="table-cell text-center" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        draggable={canReorder}
                        onDragStart={(event) => handleDragStart(event, product.id)}
                        onDragEnd={handleDragEnd}
                        disabled={!canReorder || savingProductId === product.id || deletingProductId === product.id}
                        className={cn(
                          'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
                          canReorder
                            ? 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 cursor-grab active:cursor-grabbing'
                            : 'border-slate-100 text-slate-300 cursor-not-allowed'
                        )}
                        title={canReorder ? 'Перетащить продукт' : 'Перетаскивание сейчас недоступно'}
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex items-center gap-1">
                          <Pin className={cn('w-3.5 h-3.5', product.isPinned ? 'text-brand-600 fill-brand-100' : 'text-slate-300')} />
                          <Star className={cn('w-3.5 h-3.5', product.isFavorite ? 'text-amber-500 fill-amber-100' : 'text-slate-300')} />
                        </div>
                        <div className="min-w-0">
                          <Link href={`/products/${product.id}`} className="font-medium text-slate-800 hover:text-brand-700 transition-colors">
                            {product.name.length > 70 ? `${product.name.slice(0, 70)}…` : product.name}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span>{product._count.stages} этапов</span>
                            <span>•</span>
                            <span>{product._count.comments} комм.</span>
                            {product.isPinned && <span className="text-brand-600 font-medium">• закреплён</span>}
                            {product.isFavorite && <span className="text-amber-600 font-medium">• избранное</span>}
                            {overlaps.length > 0 && (
                              <span
                                className="text-orange-600 font-medium"
                                title={overlaps.map((overlap: { fromName?: string; toName?: string }) => `${overlap.fromName} → ${overlap.toName}`).join(', ')}
                              >
                                • ⚠ {overlaps.length} пересеч.
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className="text-xs text-slate-500">{product.country || '—'}</span>
                    </td>
                    <td className="table-cell">
                      <span className={cn('badge text-xs', getStatusColor(product.status))}>{getStatusLabel(product.status)}</span>
                    </td>
                    <td className="table-cell">
                      <span className={cn('badge text-xs border', getPriorityColor(product.priority))}>{getPriorityLabel(product.priority)}</span>
                    </td>
                    <td className="table-cell">
                      <span className="text-xs text-slate-600">{product.responsible?.name || '—'}</span>
                    </td>
                    <td className="table-cell">
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
                        <span className="text-xs text-slate-500 w-8 text-right">{product.progressPercent}%</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className={cn('text-xs font-medium', isOverdue ? 'text-red-600' : 'text-slate-600')}>
                        {formatDate(product.finalDate)}
                      </span>
                      {isOverdue && <div className="text-xs text-red-500 mt-0.5">просрочен</div>}
                    </td>
                    <td className="table-cell">
                      <div
                        className={cn(
                          'inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold',
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

      {contextMenu && contextProduct && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-2.5 py-2 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-800 truncate">{contextProduct.name}</div>
            <div className="text-xs text-slate-400 mt-0.5">Быстрые действия по продукту</div>
          </div>

          <div className="py-1">
            <button
              onClick={() => {
                setContextMenu(null)
                router.push(`/products/${contextProduct.id}`)
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
        </div>
      )}
    </div>
  )
}

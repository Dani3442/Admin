'use client'

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, CheckCircle2, AlertTriangle, Plus, ChevronLeft, ChevronRight, Pencil, X, Trash2, Filter } from 'lucide-react'
import { cn, formatDate, detectStageOverlaps, getPriorityLabel, getStatusLabel } from '@/lib/utils'
import { DatePicker } from '@/components/ui/DatePicker'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { FloatingContextMenu } from '@/components/ui/FloatingContextMenu'
import { buildProductHref, getRouteWithSearch } from '@/lib/navigation'
import { useContextMenu } from '@/hooks/useContextMenu'
import { filterProducts, sortProducts, type ProductListFilters, type ProductListSortDirection, type ProductListSortField, type ProductQuickView } from '@/lib/product-list'

interface Stage {
  id: string; order: number; name: string; durationText: string | null
  isCritical: boolean
  participatesInAutoshift?: boolean
}

interface ProductStage {
  id: string; stageTemplateId: string; stageOrder: number; stageName: string;
  dateValue: Date | null; dateRaw: string | null;
  isCompleted: boolean; isCritical: boolean; status: string
  participatesInAutoshift?: boolean
  overlapAccepted?: boolean
}

interface Product {
  id: string; name: string; country: string | null; status: string; priority: string
  finalDate: Date | null; progressPercent: number; riskScore: number
  createdAt?: Date | string
  sortOrder?: number
  isPinned?: boolean; isFavorite?: boolean
  responsible?: { id: string; name: string } | null
  stages: ProductStage[]
}

interface TableViewClientProps {
  products: Product[]
  stages: Stage[]
  currentUserRole: string
  embedded?: boolean
  layoutSwitcher?: ReactNode
  controlsHidden?: boolean
  externalFilters?: ProductListFilters
  externalSortField?: ProductListSortField
  externalSortDirection?: ProductListSortDirection
  archiveMode?: boolean
}

interface EditingCellState {
  productId: string
  stageId: string | null
  stageTemplateId: string
  stageOrder: number
  stageName: string
}

type StageMenuState =
  | { kind: 'header'; stageId: string }
  | { kind: 'cell'; stageId: string; productId: string }

const ALL_STATUSES = ['PLANNED', 'IN_PROGRESS', 'AT_RISK', 'DELAYED', 'COMPLETED', 'CANCELLED'] as const
const ALL_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
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

function scoreStageMatch(productStage: ProductStage, stageTemplate: Stage) {
  const sameTemplate = productStage.stageTemplateId === stageTemplate.id
  const sameOrder = productStage.stageOrder === stageTemplate.order
  const sameName = productStage.stageName === stageTemplate.name

  if (sameTemplate && sameOrder) return 0
  if (sameOrder && sameName) return 1
  if (sameOrder) return 2
  if (sameTemplate && sameName) return 3
  if (sameTemplate) return 4
  if (sameName) return 5

  return 99
}

function resolveStageMapForProduct(productStages: ProductStage[], stageTemplates: Stage[]) {
  const remainingStages = [...productStages]
  const resolvedMap = new Map<string, ProductStage>()

  for (const stageTemplate of [...stageTemplates].sort((left, right) => left.order - right.order)) {
    let bestIndex = -1
    let bestScore = Number.POSITIVE_INFINITY

    for (const [index, productStage] of remainingStages.entries()) {
      const score = scoreStageMatch(productStage, stageTemplate)
      if (score > 5) continue

      if (score < bestScore) {
        bestScore = score
        bestIndex = index
        continue
      }

      if (score === bestScore && bestIndex >= 0) {
        const currentDistance = Math.abs(remainingStages[bestIndex].stageOrder - stageTemplate.order)
        const nextDistance = Math.abs(productStage.stageOrder - stageTemplate.order)
        if (nextDistance < currentDistance) {
          bestIndex = index
        }
      }
    }

    if (bestIndex >= 0) {
      const [matchedStage] = remainingStages.splice(bestIndex, 1)
      resolvedMap.set(stageTemplate.id, matchedStage)
    }
  }

  return resolvedMap
}

export function TableViewClient({
  products: initial,
  stages: initialStages,
  currentUserRole,
  embedded = false,
  layoutSwitcher,
  controlsHidden = false,
  externalFilters,
  externalSortField,
  externalSortDirection,
  archiveMode = false,
}: TableViewClientProps) {
  const [products, setProducts] = useState(initial)
  const [stages, setStages] = useState(initialStages)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [responsibleFilter, setResponsibleFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [quickView, setQuickView] = useState<ProductQuickView>('all')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [onlyWithOverlaps, setOnlyWithOverlaps] = useState(false)
  const [editingCell, setEditingCell] = useState<EditingCellState | null>(null)
  const [editValue, setEditValue] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const now = new Date()
  const currentRoute = getRouteWithSearch(pathname, searchParams.toString())

  // Stage management state
  const [renamingStage, setRenamingStage] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showNewStageForm, setShowNewStageForm] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [newStageDuration, setNewStageDuration] = useState('')
  const [newStageAutoshift, setNewStageAutoshift] = useState(true)
  const canEditTable = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(currentUserRole) && !archiveMode
  const [pendingDeleteStageId, setPendingDeleteStageId] = useState<string | null>(null)
  const [deleteStageError, setDeleteStageError] = useState<string | null>(null)
  const {
    menu: stageMenu,
    menuRef,
    closeMenu: closeStageMenu,
    openMenuFromEvent: openStageMenu,
  } = useContextMenu<StageMenuState>({
    width: 220,
    height: 260,
  })
  const userOptions = Array.from(
    new Map(
      products
        .filter((product) => product.responsible?.id && product.responsible?.name)
        .map((product) => [product.responsible!.id, product.responsible!])
    ).values()
  ).sort((left, right) => left.name.localeCompare(right.name, 'ru'))

  useEffect(() => {
    setProducts(initial)
  }, [initial])

  useEffect(() => {
    setStages(initialStages)
    setColumnWidths((prev) => {
      const next = { ...prev }
      initialStages.forEach((stage) => {
        if (!next[stage.id]) next[stage.id] = 130
      })
      return next
    })
  }, [initialStages])

  // Column resize state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const widths: Record<string, number> = { __product: 208, __progress: 96 }
    initialStages.forEach((s) => { widths[s.id] = 130 })
    return widths
  })
  const resizingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const saved = window.localStorage.getItem('product-admin:table-column-widths')
      if (!saved) return
      const parsed = JSON.parse(saved) as Record<string, number>
      if (!parsed || typeof parsed !== 'object') return

      setColumnWidths((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(parsed).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
        ),
      }))
    } catch {
      // Ignore corrupted saved widths.
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('product-admin:table-column-widths', JSON.stringify(columnWidths))
  }, [columnWidths])

  const handleResizeStart = useCallback((e: React.MouseEvent, colId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = columnWidths[colId] || 130

    resizingRef.current = { colId, startX, startWidth }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      const diff = ev.clientX - resizingRef.current.startX
      const newWidth = Math.max(60, resizingRef.current.startWidth + diff)
      setColumnWidths((prev) => ({ ...prev, [resizingRef.current!.colId]: newWidth }))
    }

    const handleMouseUp = () => {
      resizingRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [columnWidths])

  // Stage management actions
  const handleRenameStage = async (stageId: string) => {
    if (!renameValue.trim()) return
    try {
      const res = await fetch('/api/stage-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: stageId, action: 'rename', name: renameValue }),
      })
      if (res.ok) {
        const updated = await res.json()
        setStages((prev) => prev.map((s) => s.id === stageId ? { ...s, name: updated.name } : s))
      }
    } finally {
      setRenamingStage(null)
    }
  }

  const handleMoveStage = async (stageId: string, direction: 'move-left' | 'move-right') => {
    try {
      const res = await fetch('/api/stage-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: stageId, action: direction }),
      })
      if (res.ok) {
        const allStages = await res.json()
        setStages(allStages)
        router.refresh()
      }
    } finally {
      closeStageMenu()
    }
  }

  const handleCreateStage = async () => {
    if (!newStageName.trim()) return
    try {
      const res = await fetch('/api/stage-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStageName,
          durationText: newStageDuration || null,
          participatesInAutoshift: newStageAutoshift,
        }),
      })
      if (res.ok) {
        const { template: createdStage, productStages } = await res.json()
        setStages((prev) => [...prev, createdStage].sort((a, b) => a.order - b.order))
        setProducts((prev) =>
          prev.map((product) => {
            const createdProductStage = productStages.find((stage: ProductStage & { productId: string }) => stage.productId === product.id)
            if (!createdProductStage) return product

            return {
              ...product,
              stages: [...product.stages.map((stage) => (
                stage.stageOrder >= createdProductStage.stageOrder
                  ? { ...stage, stageOrder: stage.stageOrder + 1 }
                  : stage
              )), createdProductStage].sort((a, b) => a.stageOrder - b.stageOrder),
            }
          })
        )
        setColumnWidths((prev) => ({ ...prev, [createdStage.id]: prev[createdStage.id] ?? 130 }))
        setNewStageName('')
        setNewStageDuration('')
        setNewStageAutoshift(true)
        setShowNewStageForm(false)
        router.refresh()
      } else {
        const data = await res.json().catch(() => null)
        window.alert(data?.error || 'Не удалось создать этап')
      }
    } catch {
      window.alert('Не удалось создать этап')
    }
  }

  const handleDeleteStage = async (stageId: string) => {
    closeStageMenu()
    setDeleteStageError(null)
    setPendingDeleteStageId(stageId)
  }

  const confirmDeleteStage = async () => {
    if (!pendingDeleteStageId) return
    const deletingStageId = pendingDeleteStageId
    try {
      const res = await fetch(`/api/stage-templates?id=${encodeURIComponent(deletingStageId)}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        const allStages = await res.json()
        setStages(allStages)
        setProducts((prev) =>
          prev.map((product) => ({
            ...product,
            stages: product.stages.filter((stage) => stage.stageTemplateId !== deletingStageId),
          }))
        )
        setColumnWidths((prev) => {
          const next = { ...prev }
          delete next[deletingStageId]
          return next
        })
        setPendingDeleteStageId(null)
        router.refresh()
      } else {
        const responseText = await res.text()
        let data: { error?: string; details?: string } | null = null

        try {
          data = responseText ? JSON.parse(responseText) : null
        } catch {
          data = null
        }

        setPendingDeleteStageId(null)
        setDeleteStageError(
          data?.details ||
            data?.error ||
            responseText ||
            'Не удалось удалить этап'
        )
      }
    } finally {
      closeStageMenu()
    }
  }

  const handleStageHeaderClick = (e: React.MouseEvent, stage: Stage) => {
    if (!canEditTable) return
    openStageMenu(e, { kind: 'header', stageId: stage.id }, { width: 220, height: 260 })
  }

  const handleStageCellContextMenu = (e: React.MouseEvent, productId: string, stage: ProductStage | undefined) => {
    if (!canEditTable || !stage) return
    openStageMenu(
      e,
      {
        kind: 'cell',
        stageId: stage.id,
        productId,
      },
      { width: 220, height: 120 }
    )
  }

  const startRename = (stage: Stage) => {
    if (!canEditTable) return
    setRenamingStage(stage.id)
    setRenameValue(stage.name)
    closeStageMenu()
  }

  const handleToggleStageTemplateAutoshift = async (stage: Stage, nextValue: boolean) => {
    try {
      const res = await fetch('/api/stage-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: stage.id, action: 'toggle-autoshift', participatesInAutoshift: nextValue }),
      })
      const updated = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(updated?.error || 'Не удалось обновить автосдвиг этапа')
      }

      setStages((prev) => prev.map((item) => item.id === stage.id ? { ...item, participatesInAutoshift: updated.participatesInAutoshift } : item))
      setProducts((prev) =>
        prev.map((product) => ({
          ...product,
          stages: product.stages.map((productStage) =>
            productStage.stageTemplateId === stage.id
              ? { ...productStage, participatesInAutoshift: updated.participatesInAutoshift }
              : productStage
          ),
        }))
      )
    } catch (error: any) {
      window.alert(error.message || 'Не удалось обновить автосдвиг этапа')
    } finally {
      closeStageMenu()
    }
  }

  const handleToggleProductStageAutoshift = async (stageId: string, productId: string, nextValue: boolean) => {
    try {
      const res = await fetch('/api/stages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId,
          updates: { participatesInAutoshift: nextValue },
          applyAutomations: false,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось обновить автосдвиг этапа')
      }

      setProducts((prev) =>
        prev.map((product) =>
          product.id !== productId
            ? product
            : {
                ...product,
                stages: data?.stages || product.stages,
                finalDate: data?.product?.finalDate ?? product.finalDate,
                progressPercent: data?.product?.progressPercent ?? product.progressPercent,
                riskScore: data?.product?.riskScore ?? product.riskScore,
                status: data?.product?.status ?? product.status,
              }
        )
      )
    } catch (error: any) {
      window.alert(error.message || 'Не удалось обновить автосдвиг этапа')
    } finally {
      closeStageMenu()
    }
  }

  const effectiveFilters: ProductListFilters = externalFilters ?? {
    search,
    status: statusFilter,
    responsibleId: responsibleFilter,
    priority: priorityFilter,
    country: countryFilter,
    quickView,
    onlyWithOverlaps,
  }
  const effectiveSortField = externalSortField ?? 'manual'
  const effectiveSortDirection = externalSortDirection ?? 'asc'

  const filteredProducts = sortProducts(
    filterProducts(
      products.map((product) => ({
        ...product,
        createdAt: product.createdAt ?? new Date(0),
        sortOrder: product.sortOrder ?? 0,
        isPinned: product.isPinned ?? false,
        isFavorite: product.isFavorite ?? false,
        _count: { comments: 0, stages: product.stages.length },
      })) as any,
      effectiveFilters,
      now
    ) as any,
    effectiveSortField,
    effectiveSortDirection
  ) as unknown as Product[]

  const resetFilters = () => {
    setSearch('')
    setStatusFilter('')
    setResponsibleFilter('')
    setPriorityFilter('')
    setCountryFilter('')
    setQuickView('all')
    setShowAdvancedFilters(false)
    setOnlyWithOverlaps(false)
  }

  function getCellClass(stage: ProductStage | undefined, stageTemplate: Stage): string {
    if (!stage) return 'stage-cell empty'
    if (stage.isCompleted) return 'stage-cell done'
    if (stage.dateValue) {
      const d = new Date(stage.dateValue)
      if (d < now) return 'stage-cell overdue'
      const diff = Math.round((d.getTime() - now.getTime()) / 86400000)
      if (diff <= 7) return 'stage-cell at-risk'
      return 'stage-cell in-progress'
    }
    if (stage.dateRaw) return 'stage-cell in-progress'
    return 'stage-cell empty'
  }

  function getCellText(stage: ProductStage | undefined): string {
    if (!stage) return '—'
    if (stage.dateValue) return formatDate(stage.dateValue)
    if (stage.dateRaw) return stage.dateRaw.slice(0, 12)
    return '—'
  }

  const startEdit = (productId: string, stageTemplate: Stage, stage: ProductStage | undefined) => {
    if (!canEditTable) return
    setEditingCell({
      productId,
      stageId: stage?.id || null,
      stageTemplateId: stageTemplate.id,
      stageOrder: stageTemplate.order,
      stageName: stage?.stageName || stageTemplate.name,
    })
    setEditValue(stage?.dateValue ? new Date(stage.dateValue) : null)
  }

  const isSameEditingCell = (left: EditingCellState | null, right: EditingCellState | null) => {
    if (!left || !right) return false
    return (
      left.productId === right.productId &&
      left.stageTemplateId === right.stageTemplateId &&
      left.stageOrder === right.stageOrder
    )
  }

  const saveEdit = async (nextDate = editValue) => {
    if (!editingCell) return
    const activeCell = editingCell
    setSaving(true)
    try {
      const res = await fetch('/api/stages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: activeCell.stageId,
          productId: activeCell.productId,
          stageTemplateId: activeCell.stageTemplateId,
          stageOrder: activeCell.stageOrder,
          stageName: activeCell.stageName,
          updates: { dateValue: nextDate },
          applyAutomations: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось сохранить дату этапа')
      }

      setProducts((prev) =>
        prev.map((p) =>
          p.id !== activeCell.productId ? p : {
            ...p,
            stages: data?.stages || p.stages,
            finalDate: data?.product?.finalDate ?? p.finalDate,
            progressPercent: data?.product?.progressPercent ?? p.progressPercent,
            riskScore: data?.product?.riskScore ?? p.riskScore,
            status: data?.product?.status ?? p.status,
          }
        )
      )
    } catch (error: any) {
      console.error('[table:save-date] Failed to save stage date', error)
      window.alert('Не удалось сохранить дату этапа')
    } finally {
      setSaving(false)
      setEditingCell((current) => (isSameEditingCell(current, activeCell) ? null : current))
    }
  }

  const addColumnWidth = 50

  return (
    <div className="space-y-5 animate-fade-in">
      {!controlsHidden && (
      <div className="surface-panel flex flex-col gap-5 p-4 lg:p-5">
        <div className="space-y-4">
          {!embedded ? (
            <div>
              <h1 className="page-heading">Таблица этапов</h1>
              <p className="subtle-copy mt-1">{filteredProducts.length} продуктов × {stages.length} этапов</p>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {filteredProducts.length} продуктов × {stages.length} этапов
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9 text-sm"
                placeholder="Поиск продукта..."
              />
            </div>

            <button
              onClick={() => setShowAdvancedFilters((current) => !current)}
              className={cn('btn-secondary w-full justify-center sm:w-auto', showAdvancedFilters && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}
            >
              <Filter className="w-4 h-4" />
              Фильтры
            </button>

            {(search || statusFilter || responsibleFilter || priorityFilter || countryFilter.trim() || quickView !== 'all' || onlyWithOverlaps) && (
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

          {showAdvancedFilters && (
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
                    ...userOptions.map((user) => ({ value: user.id, label: user.name })),
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
          )}

          {layoutSwitcher && <div className="w-full pt-1 sm:w-auto">{layoutSwitcher}</div>}
        </div>
      </div>
      )}

      {/* Matrix Table */}
      <div className="space-y-4 lg:hidden">
        {filteredProducts.map((product) => {
          const { overlappingIds } = detectStageOverlaps(product.stages)
          const resolvedStageMap = resolveStageMapForProduct(product.stages, stages)

          return (
            <article
              key={product.id}
              className="surface-panel space-y-4 p-4"
              onClick={() => router.push(buildProductHref(product.id, currentRoute))}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-foreground">{product.name}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{product.responsible?.name || 'Без ответственного'}</span>
                    {product.country && (
                      <>
                        <span>•</span>
                        <span>{product.country}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className={cn(
                  'inline-flex h-9 min-w-[3rem] items-center justify-center rounded-xl px-2 text-sm font-semibold',
                  product.riskScore >= 70
                    ? 'bg-red-100 text-red-700 dark:text-red-300'
                    : product.riskScore >= 40
                      ? 'bg-amber-100 text-amber-700 dark:text-amber-300'
                      : 'bg-muted text-muted-foreground'
                )}>
                  {product.riskScore}
                </span>
              </div>

              <div className="grid gap-3 rounded-[24px] bg-muted/45 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Статус</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="badge text-xs">{getStatusLabel(product.status)}</span>
                    <span className="badge border text-xs">{getPriorityLabel(product.priority)}</span>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Прогресс</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="progress-bar flex-1">
                      <div
                        className={cn(
                          'progress-fill',
                          product.progressPercent < 30 ? 'bg-red-400' :
                          product.progressPercent < 70 ? 'bg-amber-400' : 'bg-emerald-500'
                        )}
                        style={{ width: `${product.progressPercent}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-foreground">{product.progressPercent}%</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Этапы</p>
                  <span className="text-xs text-muted-foreground">{stages.length} шаблонов</span>
                </div>
                <div className="space-y-2">
                  {stages.map((stageTemplate) => {
                    const stage = resolvedStageMap.get(stageTemplate.id)
                    const hasOverlap = stage ? overlappingIds.has(stage.id) : false
                    const cellClass = getCellClass(stage, stageTemplate)
                    const cellText = getCellText(stage)

                    return (
                      <div key={stageTemplate.id} className="flex items-center justify-between gap-3 rounded-[18px] border border-border/70 bg-card px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{stageTemplate.name}</p>
                          {stageTemplate.durationText && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{stageTemplate.durationText}</p>
                          )}
                        </div>
                        <div className={cn('flex-shrink-0 rounded-[14px] px-2.5 py-1 text-xs font-medium', cellClass, hasOverlap && 'ring-1 ring-orange-400/70')}>
                          {stage?.isCompleted && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                          {hasOverlap && <AlertTriangle className="mr-1 inline h-3 w-3 text-orange-500" />}
                          {cellText}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </article>
          )
        })}

        {filteredProducts.length === 0 && (
          <div className="surface-panel py-14 text-center text-sm text-muted-foreground">
            Продукты не найдены
          </div>
        )}
      </div>

      <div className="surface-panel hidden overflow-hidden lg:block">
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ tableLayout: 'fixed', width: Object.values(columnWidths).reduce((a, b) => a + b, 0) + addColumnWidth }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th
                  className="sticky left-0 z-20 border-b border-r border-border/70 bg-muted px-4 py-3 text-left text-[15px] font-medium leading-6 text-muted-foreground relative"
                  style={{ width: columnWidths.__product, minWidth: 120 }}
                >
                  Продукт
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize transition-colors hover:bg-border"
                    onMouseDown={(e) => handleResizeStart(e, '__product')}
                  />
                </th>
                <th
                  className="border-b border-r border-border/70 bg-muted px-2 py-3 text-center text-[15px] font-medium leading-6 text-muted-foreground relative"
                  style={{ width: columnWidths.__progress, minWidth: 60 }}
                >
                  Прогресс
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize transition-colors hover:bg-border"
                    onMouseDown={(e) => handleResizeStart(e, '__progress')}
                  />
                </th>
                {stages.map((stage, idx) => (
                  <th
                    key={stage.id}
                    className="group relative border-b border-r border-border/70 bg-muted px-2 py-3 text-center text-muted-foreground"
                    style={{ width: columnWidths[stage.id], minWidth: 60 }}
                    title={`ПКМ: управление этапом\n${stage.name}`}
                    onContextMenu={(e) => handleStageHeaderClick(e, stage)}
                  >
                    {renamingStage === stage.id ? (
                      <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="w-full rounded border border-primary/30 bg-card px-1.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameStage(stage.id)
                            if (e.key === 'Escape') setRenamingStage(null)
                          }}
                          onBlur={() => handleRenameStage(stage.id)}
                        />
                      </div>
                    ) : (
                      <div className="cursor-context-menu break-words whitespace-normal text-[15px] font-medium leading-6 text-muted-foreground">
                        {stage.name}
                      </div>
                    )}
                    {stage.durationText && !renamingStage && (
                      <div className="mt-0.5 text-[12px] font-normal leading-4 text-muted-foreground">{stage.durationText}</div>
                    )}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize transition-colors hover:bg-border"
                      onMouseDown={(e) => handleResizeStart(e, stage.id)}
                    />
                  </th>
                ))}

                {/* Add new stage column */}
                <th
                  className="border-b border-r border-border/70 bg-muted text-center align-middle"
                  style={{ width: addColumnWidth, minWidth: addColumnWidth }}
                >
                  {canEditTable && (
                    <button
                      onClick={() => setShowNewStageForm(true)}
                      className="mx-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="Добавить новый этап"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product, rowIdx) => {
                const { overlappingIds } = detectStageOverlaps(product.stages)
                const resolvedStageMap = resolveStageMapForProduct(product.stages, stages)
                const rowBackgroundClass = rowIdx % 2 === 0 ? 'bg-card' : 'bg-muted/35'
                const stickyProductCellBackgroundClass = rowIdx % 2 === 0 ? 'bg-card' : 'bg-muted'

                return (
                  <tr
                    key={product.id}
                    className={cn(
                      'cursor-pointer border-b border-border/60 transition-colors',
                      rowBackgroundClass,
                      'hover:bg-accent/40'
                    )}
                    onClick={() => router.push(buildProductHref(product.id, currentRoute))}
                  >
                    {/* Product Name */}
                    <td
                      className={cn('sticky left-0 z-10 border-r border-border/60 px-3 py-2', stickyProductCellBackgroundClass)}
                      style={{ width: columnWidths.__product, minWidth: 120, maxWidth: columnWidths.__product }}
                    >
                      <Link href={buildProductHref(product.id, currentRoute)} className="block">
                        <div className="truncate text-[17px] font-medium leading-[1.2] text-foreground transition-colors hover:text-primary" title={product.name}>
                          {product.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[14px] leading-5 text-muted-foreground">{product.responsible?.name || '—'}</span>
                          {product.riskScore >= 40 && (
                            <AlertTriangle className="h-2.5 w-2.5 text-amber-500 dark:text-amber-300" />
                          )}
                        </div>
                      </Link>
                    </td>

                    {/* Progress */}
                    <td className="border-r border-border/60 px-2 py-2 text-center" style={{ width: columnWidths.__progress, minWidth: 60 }}>
                      <div className="text-[15px] font-semibold leading-5 text-foreground">{product.progressPercent}%</div>
                      <div className="progress-bar mt-1 mx-auto w-16">
                        <div
                          className={cn(
                            'progress-fill',
                            product.progressPercent < 30 ? 'bg-red-400' :
                            product.progressPercent < 70 ? 'bg-amber-400' : 'bg-emerald-500'
                          )}
                          style={{ width: `${product.progressPercent}%` }}
                        />
                      </div>
                    </td>

                    {/* Stage cells */}
                    {stages.map((stageTemplate) => {
                      const stage = resolvedStageMap.get(stageTemplate.id)
                      const isEditing =
                        editingCell?.productId === product.id &&
                        editingCell?.stageTemplateId === stageTemplate.id
                      const cellClass = getCellClass(stage, stageTemplate)
                      const cellText = getCellText(stage)
                      const hasOverlap = stage && overlappingIds.has(stage.id)

                      return (
                        <td
                          key={stageTemplate.id}
                          className="border-r border-border/60 p-0.5"
                          style={{ width: columnWidths[stageTemplate.id], minWidth: 60 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isEditing ? (
                            <div className="w-full overflow-hidden p-1">
                              <DatePicker
                                value={editValue}
                                onChange={setEditValue}
                                onCommit={saveEdit}
                                onCancel={() => setEditingCell(null)}
                                inputClassName="h-8 w-full min-w-0 text-[12px] px-2"
                                panelClassName="w-[292px]"
                                showTriggerButton={false}
                                autoFocus
                              />
                            </div>
                          ) : (
                            <div
                              className={cn(cellClass, canEditTable && 'cursor-pointer hover:opacity-80 transition-opacity', 'mx-0.5 relative', hasOverlap && 'ring-2 ring-orange-400 ring-inset')}
                              onClick={() => canEditTable && startEdit(product.id, stageTemplate, stage)}
                              onContextMenu={(e) => handleStageCellContextMenu(e, product.id, stage)}
                              title={stage ? `${stage.stageName}\n${stage.dateValue ? formatDate(stage.dateValue) : stage.dateRaw || 'Нет даты'}${stage.isCritical ? '\n⚠️ Критичный этап' : ''}${hasOverlap ? '\n⚠️ Пересечение дат' : ''}` : stageTemplate.name}
                            >
                              {stage?.isCompleted && <CheckCircle2 className="w-2.5 h-2.5 inline mr-0.5" />}
                              {hasOverlap && <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5 text-orange-500" />}
                              {cellText}
                            </div>
                          )}
                        </td>
                      )
                    })}

                    {/* Empty cell for add column */}
                    <td className="border-r border-border/60" style={{ width: addColumnWidth }} />
                  </tr>
                )
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={stages.length + 3} className="py-16 text-center text-sm text-muted-foreground">
                    Продукты не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canEditTable && stageMenu && (
        <FloatingContextMenu
          open
          x={stageMenu.x}
          y={stageMenu.y}
          menuRef={menuRef}
          className="fixed z-[90] min-w-[180px] rounded-lg border border-border/80 bg-popover py-1 text-popover-foreground shadow-modal"
        >
              {stageMenu.kind === 'header' ? (() => {
                const stage = stages.find((s) => s.id === stageMenu.stageId)
                if (!stage) return null
                const isFirst = stages[0]?.id === stage.id
                const isLast = stages[stages.length - 1]?.id === stage.id

                return (
                  <>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent"
                      onClick={() => startRename(stage)}
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      Переименовать
                    </button>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent"
                      onClick={() => handleToggleStageTemplateAutoshift(stage, stage.participatesInAutoshift === false)}
                    >
                      <CheckCircle2 className={cn('h-3.5 w-3.5', stage.participatesInAutoshift === false ? 'text-muted-foreground' : 'text-emerald-500 dark:text-emerald-300')} />
                      {stage.participatesInAutoshift === false ? 'Включить автосдвиг' : 'Отключить автосдвиг'}
                    </button>
                    <button
                      className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', isFirst ? 'cursor-not-allowed text-muted-foreground/50' : 'text-popover-foreground hover:bg-accent')}
                      onClick={() => !isFirst && handleMoveStage(stage.id, 'move-left')}
                      disabled={isFirst}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Переместить влево
                    </button>
                    <button
                      className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', isLast ? 'cursor-not-allowed text-muted-foreground/50' : 'text-popover-foreground hover:bg-accent')}
                      onClick={() => !isLast && handleMoveStage(stage.id, 'move-right')}
                      disabled={isLast}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                      Переместить вправо
                    </button>
                    <div className="my-1 border-t border-border/70" />
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                      onClick={() => handleDeleteStage(stage.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500 dark:text-red-300" />
                      Удалить этап
                    </button>
                  </>
                )
              })() : (() => {
                const product = products.find((item) => item.id === stageMenu.productId)
                const stage = product?.stages.find((item) => item.id === stageMenu.stageId)
                if (!stage || !product) return null

                return (
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent"
                    onClick={() => handleToggleProductStageAutoshift(stage.id, product.id, stage.participatesInAutoshift === false)}
                  >
                    <CheckCircle2 className={cn('h-3.5 w-3.5', stage.participatesInAutoshift === false ? 'text-muted-foreground' : 'text-emerald-500 dark:text-emerald-300')} />
                    {stage.participatesInAutoshift === false ? 'Включить автосдвиг' : 'Отключить автосдвиг'}
                  </button>
                )
              })()}
        </FloatingContextMenu>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteStageId)}
        title="Удалить этап?"
        description="Этап будет удалён из таблицы и у всех продуктов. Это действие нельзя отменить."
        confirmLabel="Удалить этап"
        onCancel={() => {
          setPendingDeleteStageId(null)
          closeStageMenu()
        }}
        onConfirm={confirmDeleteStage}
      />

      <ConfirmDialog
        open={Boolean(deleteStageError)}
        title="Не удалось удалить этап"
        description={deleteStageError || 'Не удалось удалить этап'}
        confirmLabel="Закрыть"
        confirmTone="primary"
        hideCancel
        onCancel={() => setDeleteStageError(null)}
        onConfirm={() => setDeleteStageError(null)}
      />

      {/* New stage modal */}
      {showNewStageForm && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-backdrop flex items-end justify-center px-4 pb-4 pt-8 sm:items-center"
          onClick={() => {
            setShowNewStageForm(false)
            setNewStageAutoshift(true)
          }}
        >
          <div className="max-h-[min(88vh,36rem)] w-full max-w-sm space-y-4 overflow-y-auto rounded-[28px] border border-border/80 bg-card p-4 shadow-modal sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Новый этап</h3>
              <button
                onClick={() => {
                  setShowNewStageForm(false)
                  setNewStageAutoshift(true)
                }}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Название этапа</label>
              <input
                type="text"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                className="input w-full"
                placeholder="Например: тестирование"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateStage()}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Длительность (опционально)</label>
              <input
                type="text"
                value={newStageDuration}
                onChange={(e) => setNewStageDuration(e.target.value)}
                className="input w-full"
                placeholder="Например: 3 дня"
              />
            </div>
            <label className="flex items-center justify-between rounded-[18px] bg-muted/75 px-3 py-3 text-sm text-muted-foreground">
              <span>Автосдвиг по умолчанию</span>
              <input
                type="checkbox"
                checked={newStageAutoshift}
                onChange={(e) => setNewStageAutoshift(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
              />
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => {
                  setShowNewStageForm(false)
                  setNewStageAutoshift(true)
                }}
                className="btn-secondary text-sm"
              >
                Отмена
              </button>
              <button onClick={handleCreateStage} className="btn-primary text-sm" disabled={!newStageName.trim()}>
                <Plus className="w-4 h-4" /> Создать
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

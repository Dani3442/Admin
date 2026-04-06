'use client'

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Search, CheckCircle2, AlertTriangle, Plus, ChevronLeft, ChevronRight, Pencil, X, Trash2, Filter } from 'lucide-react'
import { cn, formatDate, detectStageOverlaps, getPriorityLabel, getStatusLabel } from '@/lib/utils'
import { DatePicker } from '@/components/ui/DatePicker'
import { buildProductHref, getRouteWithSearch } from '@/lib/navigation'
import type { ProductQuickView } from '@/lib/product-list'

interface Stage {
  id: string; order: number; name: string; durationText: string | null
  isCritical: boolean
}

interface ProductStage {
  id: string; stageTemplateId: string; stageOrder: number; stageName: string;
  dateValue: Date | null; dateRaw: string | null;
  isCompleted: boolean; isCritical: boolean; status: string
}

interface Product {
  id: string; name: string; country: string | null; status: string; priority: string
  finalDate: Date | null; progressPercent: number; riskScore: number
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
}

interface EditingCellState {
  productId: string
  stageId: string | null
  stageTemplateId: string
  stageOrder: number
  stageName: string
}

const ALL_STATUSES = ['PLANNED', 'IN_PROGRESS', 'AT_RISK', 'DELAYED', 'COMPLETED', 'CANCELLED'] as const
const ALL_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
const QUICK_VIEW_OPTIONS: Array<{ value: ProductQuickView; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'pinned', label: 'Закреплённые' },
  { value: 'favorite', label: 'Избранное' },
  { value: 'overdue', label: 'Просроченные' },
  { value: 'atRisk', label: 'Под риском' },
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
  const [stageMenu, setStageMenu] = useState<{ stageId: string; x: number; y: number } | null>(null)
  const [renamingStage, setRenamingStage] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showNewStageForm, setShowNewStageForm] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [newStageDuration, setNewStageDuration] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const canEditTable = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(currentUserRole)
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

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setStageMenu(null)
      }
    }
    if (stageMenu) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [stageMenu])

  // Column resize state
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const widths: Record<string, number> = { __product: 208, __progress: 96 }
    initialStages.forEach((s) => { widths[s.id] = 130 })
    return widths
  })
  const resizingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null)

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
      setStageMenu(null)
    }
  }

  const handleCreateStage = async () => {
    if (!newStageName.trim()) return
    try {
      const res = await fetch('/api/stage-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newStageName, durationText: newStageDuration || null }),
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
    const confirmed = window.confirm('Удалить этот этап из таблицы и у всех продуктов?')
    if (!confirmed) return

    try {
      const res = await fetch(`/api/stage-templates?id=${encodeURIComponent(stageId)}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        const allStages = await res.json()
        setStages(allStages)
        setColumnWidths((prev) => {
          const next = { ...prev }
          delete next[stageId]
          return next
        })
        router.refresh()
      } else {
        const data = await res.json().catch(() => null)
        window.alert(data?.error || 'Не удалось удалить этап')
      }
    } finally {
      setStageMenu(null)
    }
  }

  const handleStageHeaderClick = (e: React.MouseEvent, stage: Stage) => {
    if (!canEditTable) return
    e.preventDefault()
    e.stopPropagation()
    setStageMenu({ stageId: stage.id, x: e.clientX, y: e.clientY })
  }

  const startRename = (stage: Stage) => {
    if (!canEditTable) return
    setRenamingStage(stage.id)
    setRenameValue(stage.name)
    setStageMenu(null)
  }

  const filteredProducts = products.filter((product) => {
    if (search && !product.name.toLowerCase().includes(search.toLowerCase())) return false
    if (statusFilter && product.status !== statusFilter) return false
    if (responsibleFilter && product.responsible?.id !== responsibleFilter) return false
    if (priorityFilter && product.priority !== priorityFilter) return false
    if (countryFilter.trim() && !(product.country || '').toLowerCase().includes(countryFilter.trim().toLowerCase())) return false

    const { overlaps } = detectStageOverlaps(product.stages)
    const overdue = Boolean(product.finalDate && product.status !== 'COMPLETED' && new Date(product.finalDate) < now)
    const atRisk = product.status === 'AT_RISK' || product.riskScore >= 40

    if (onlyWithOverlaps && overlaps.length === 0) return false
    if (quickView === 'pinned' && !product.isPinned) return false
    if (quickView === 'favorite' && !product.isFavorite) return false
    if (quickView === 'overdue' && !overdue) return false
    if (quickView === 'atRisk' && !atRisk) return false

    return true
  })

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
      <div className="surface-panel flex flex-col gap-5 p-4 lg:p-5">
        <div className="space-y-4">
          {!embedded ? (
            <div>
              <h1 className="page-heading">Таблица этапов</h1>
              <p className="subtle-copy mt-1">{filteredProducts.length} продуктов × {stages.length} этапов</p>
            </div>
          ) : (
            <div className="text-sm text-slate-500">
              {filteredProducts.length} продуктов × {stages.length} этапов
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9 text-sm"
                placeholder="Поиск продукта..."
              />
            </div>

            <button
              onClick={() => setShowAdvancedFilters((current) => !current)}
              className={cn('btn-secondary', showAdvancedFilters && 'bg-brand-950 text-white border-brand-950 hover:bg-brand-900 hover:text-white')}
            >
              <Filter className="w-4 h-4" />
              Фильтры
            </button>

            {(search || statusFilter || responsibleFilter || priorityFilter || countryFilter.trim() || quickView !== 'all' || onlyWithOverlaps) && (
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

          {showAdvancedFilters && (
            <div className="surface-subtle grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
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
                  {userOptions.map((user) => (
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
          )}

          {layoutSwitcher && <div className="pt-1">{layoutSwitcher}</div>}
        </div>
      </div>

      {/* Matrix Table */}
      <div className="surface-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ tableLayout: 'fixed', width: Object.values(columnWidths).reduce((a, b) => a + b, 0) + addColumnWidth }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th
                  className="sticky left-0 z-20 bg-brand-950 text-blue-50 text-xs px-4 py-2 text-left border-r border-brand-900 relative"
                  style={{ width: columnWidths.__product, minWidth: 120 }}
                >
                  Продукт
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500/50 transition-colors"
                    onMouseDown={(e) => handleResizeStart(e, '__product')}
                  />
                </th>
                <th
                  className="bg-brand-900 text-blue-100 text-xs px-2 py-2 text-center border-r border-brand-800 relative"
                  style={{ width: columnWidths.__progress, minWidth: 60 }}
                >
                  Прогресс
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500/50 transition-colors"
                    onMouseDown={(e) => handleResizeStart(e, '__progress')}
                  />
                </th>
                {stages.map((stage, idx) => (
                  <th
                    key={stage.id}
                    className={cn(
                      'text-xs py-2 px-1.5 text-center border-r relative group',
                      stage.isCritical
                        ? 'bg-[#2d4673] text-blue-50 border-brand-800'
                        : 'bg-[#263b61] text-slate-100 border-brand-800'
                    )}
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
                          className="w-full text-xs bg-white text-slate-900 rounded px-1.5 py-1 border border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameStage(stage.id)
                            if (e.key === 'Escape') setRenamingStage(null)
                          }}
                          onBlur={() => handleRenameStage(stage.id)}
                        />
                      </div>
                    ) : (
                      <div className="leading-tight break-words whitespace-normal cursor-context-menu">
                        {stage.name}
                      </div>
                    )}
                    {stage.durationText && !renamingStage && (
                      <div className="text-blue-200/70 font-normal text-[10px] mt-0.5">{stage.durationText}</div>
                    )}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500/50 transition-colors"
                      onMouseDown={(e) => handleResizeStart(e, stage.id)}
                    />
                  </th>
                ))}

                {/* Add new stage column */}
                <th
                  className="bg-brand-900 border-r border-brand-800 text-center align-middle"
                  style={{ width: addColumnWidth, minWidth: addColumnWidth }}
                >
                  {canEditTable && (
                    <button
                      onClick={() => setShowNewStageForm(true)}
                      className="w-7 h-7 mx-auto rounded-md bg-brand-950 text-blue-100 hover:bg-brand-700 hover:text-white transition-colors flex items-center justify-center"
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

                return (
                  <tr
                    key={product.id}
                    className={cn(
                      'border-b border-slate-100 transition-colors cursor-pointer',
                      rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40',
                      'hover:bg-brand-50/20'
                    )}
                    onClick={() => router.push(buildProductHref(product.id, currentRoute))}
                  >
                    {/* Product Name */}
                    <td
                      className={cn('sticky left-0 z-10 border-r border-slate-100 px-3 py-2', rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}
                      style={{ width: columnWidths.__product, minWidth: 120, maxWidth: columnWidths.__product }}
                    >
                      <Link href={buildProductHref(product.id, currentRoute)} className="block">
                        <div className="text-xs font-medium text-slate-800 hover:text-brand-700 truncate" title={product.name}>
                          {product.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-400">{product.responsible?.name || '—'}</span>
                          {product.riskScore >= 40 && (
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />
                          )}
                        </div>
                      </Link>
                    </td>

                    {/* Progress */}
                    <td className="border-r border-slate-100 px-2 py-2 text-center" style={{ width: columnWidths.__progress, minWidth: 60 }}>
                      <div className="text-xs font-semibold text-slate-700">{product.progressPercent}%</div>
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
                          className="border-r border-slate-100 p-0.5"
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
                                inputClassName="h-8 w-full min-w-0 text-[11px] px-2"
                                panelClassName="w-[292px]"
                                showTriggerButton={false}
                                autoFocus
                              />
                            </div>
                          ) : (
                            <div
                              className={cn(cellClass, canEditTable && 'cursor-pointer hover:opacity-80 transition-opacity', 'mx-0.5 relative', hasOverlap && 'ring-2 ring-orange-400 ring-inset')}
                              onClick={() => canEditTable && startEdit(product.id, stageTemplate, stage)}
                              title={stage ? `${stage.stageName}\n${stage.dateValue ? formatDate(stage.dateValue) : stage.dateRaw || 'Нет даты'}${stage.isCritical ? '\n⚠️ Критичный этап' : ''}${hasOverlap ? '\n⚠️ Пересечение дат с соседним этапом' : ''}` : stageTemplate.name}
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
                    <td className="border-r border-slate-100" style={{ width: addColumnWidth }} />
                  </tr>
                )
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={stages.length + 3} className="py-16 text-center text-slate-400 text-sm">
                    Продукты не найдены
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Context menu for stage management */}
      {canEditTable && stageMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[180px]"
          style={{ left: stageMenu.x, top: stageMenu.y }}
        >
          {(() => {
            const stage = stages.find((s) => s.id === stageMenu.stageId)
            if (!stage) return null
            const isFirst = stages[0]?.id === stage.id
            const isLast = stages[stages.length - 1]?.id === stage.id

            return (
              <>
                <button
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  onClick={() => startRename(stage)}
                >
                  <Pencil className="w-3.5 h-3.5 text-slate-400" />
                  Переименовать
                </button>
                <button
                  className={cn('w-full px-3 py-2 text-left text-sm flex items-center gap-2', isFirst ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-50')}
                  onClick={() => !isFirst && handleMoveStage(stage.id, 'move-left')}
                  disabled={isFirst}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Переместить влево
                </button>
                <button
                  className={cn('w-full px-3 py-2 text-left text-sm flex items-center gap-2', isLast ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-50')}
                  onClick={() => !isLast && handleMoveStage(stage.id, 'move-right')}
                  disabled={isLast}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  Переместить вправо
                </button>
                <div className="border-t border-slate-100 my-1" />
                <button
                  className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  onClick={() => handleDeleteStage(stage.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  Удалить этап
                </button>
              </>
            )
          })()}
        </div>
      )}

      {/* New stage modal */}
      {showNewStageForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowNewStageForm(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Новый этап</h3>
              <button onClick={() => setShowNewStageForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Название этапа</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-1">Длительность (опционально)</label>
              <input
                type="text"
                value={newStageDuration}
                onChange={(e) => setNewStageDuration(e.target.value)}
                className="input w-full"
                placeholder="Например: 3 дня"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNewStageForm(false)} className="btn-secondary text-sm">Отмена</button>
              <button onClick={handleCreateStage} className="btn-primary text-sm" disabled={!newStageName.trim()}>
                <Plus className="w-4 h-4" /> Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

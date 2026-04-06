'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, CheckCircle2, AlertTriangle, Plus, ChevronLeft, ChevronRight, Pencil, X, Trash2 } from 'lucide-react'
import { cn, formatDate, detectStageOverlaps } from '@/lib/utils'
import { DatePicker } from '@/components/ui/DatePicker'

interface Stage {
  id: string; order: number; name: string; durationText: string | null
  isCritical: boolean
}

interface ProductStage {
  id: string; stageOrder: number; stageName: string;
  dateValue: Date | null; dateRaw: string | null;
  isCompleted: boolean; isCritical: boolean; status: string
}

interface Product {
  id: string; name: string; country: string | null; status: string
  finalDate: Date | null; progressPercent: number; riskScore: number
  responsible?: { id: string; name: string } | null
  stages: ProductStage[]
}

interface TableViewClientProps {
  products: Product[]
  stages: Stage[]
}

export function TableViewClient({ products: initial, stages: initialStages }: TableViewClientProps) {
  const [products, setProducts] = useState(initial)
  const [stages, setStages] = useState(initialStages)
  const [search, setSearch] = useState('')
  const [showOnlyRisk, setShowOnlyRisk] = useState(false)
  const [editingCell, setEditingCell] = useState<{ productId: string; stageId: string } | null>(null)
  const [editValue, setEditValue] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const now = new Date()

  // Stage management state
  const [stageMenu, setStageMenu] = useState<{ stageId: string; x: number; y: number } | null>(null)
  const [renamingStage, setRenamingStage] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showNewStageForm, setShowNewStageForm] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [newStageDuration, setNewStageDuration] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

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
        const createdStage = await res.json()
        setStages((prev) => [...prev, createdStage].sort((a, b) => a.order - b.order))
        setColumnWidths((prev) => ({ ...prev, [createdStage.id]: 130 }))
        setNewStageName('')
        setNewStageDuration('')
        setShowNewStageForm(false)
        router.refresh()
      }
    } catch {}
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
    e.preventDefault()
    e.stopPropagation()
    setStageMenu({ stageId: stage.id, x: e.clientX, y: e.clientY })
  }

  const startRename = (stage: Stage) => {
    setRenamingStage(stage.id)
    setRenameValue(stage.name)
    setStageMenu(null)
  }

  const filteredProducts = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (showOnlyRisk && p.riskScore < 25) return false
    return true
  })

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

  const startEdit = (productId: string, stageId: string, currentDate: Date | null) => {
    setEditingCell({ productId, stageId })
    setEditValue(currentDate ? new Date(currentDate) : null)
  }

  const saveEdit = async (nextDate = editValue) => {
    if (!editingCell) return
    setSaving(true)
    try {
      const res = await fetch('/api/stages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: editingCell.stageId,
          updates: { dateValue: nextDate },
          applyAutomations: true,
        }),
      })
      const { stage: updated } = await res.json()
      setProducts((prev) =>
        prev.map((p) =>
          p.id !== editingCell.productId ? p : {
            ...p,
            stages: p.stages.map((s) => s.id === editingCell.stageId ? { ...s, ...updated } : s),
          }
        )
      )
    } finally {
      setSaving(false)
      setEditingCell(null)
    }
  }

  const addColumnWidth = 50

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Таблица этапов</h1>
          <p className="text-slate-500 text-sm mt-0.5">{filteredProducts.length} продуктов × {stages.length} этапов</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowOnlyRisk(!showOnlyRisk)}
            className={cn('btn text-sm', showOnlyRisk ? 'btn-danger' : 'btn-secondary')}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {showOnlyRisk ? 'Только риски' : 'Все'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> Выполнен</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-100 border border-blue-200" /> В работе</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-100 border border-amber-200" /> Срок ≤7 дней</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-100 border border-red-200" /> Просрочен</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-slate-100 border border-slate-200" /> Нет данных</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-orange-100 border-2 border-orange-400" /> Пересечение дат</div>
        <span className="ml-auto text-slate-400 italic">ПКМ по заголовку этапа для управления</span>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9 text-sm"
          placeholder="Поиск продукта..."
        />
      </div>

      {/* Matrix Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ tableLayout: 'fixed', width: Object.values(columnWidths).reduce((a, b) => a + b, 0) + addColumnWidth }}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th
                  className="sticky left-0 z-20 bg-slate-900 text-white text-xs px-4 py-2 text-left border-r border-slate-700 relative"
                  style={{ width: columnWidths.__product, minWidth: 120 }}
                >
                  Продукт
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500/50 transition-colors"
                    onMouseDown={(e) => handleResizeStart(e, '__product')}
                  />
                </th>
                <th
                  className="bg-slate-800 text-slate-300 text-xs px-2 py-2 text-center border-r border-slate-700 relative"
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
                      'text-xs py-2 px-1.5 text-center border-r border-slate-700 relative group',
                      stage.isCritical ? 'bg-red-900 text-red-200' : 'bg-slate-800 text-slate-300'
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
                      <div className="text-slate-500 font-normal text-[10px] mt-0.5">{stage.durationText}</div>
                    )}
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-brand-500/50 transition-colors"
                      onMouseDown={(e) => handleResizeStart(e, stage.id)}
                    />
                  </th>
                ))}

                {/* Add new stage column */}
                <th
                  className="bg-slate-800 border-r border-slate-700 text-center align-middle"
                  style={{ width: addColumnWidth, minWidth: addColumnWidth }}
                >
                  <button
                    onClick={() => setShowNewStageForm(true)}
                    className="w-7 h-7 mx-auto rounded-md bg-slate-700 hover:bg-brand-600 text-slate-300 hover:text-white transition-colors flex items-center justify-center"
                    title="Добавить новый этап"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product, rowIdx) => {
                const stageMap: Record<number, ProductStage> = {}
                product.stages.forEach((s) => { stageMap[s.stageOrder] = s })
                const { overlappingIds } = detectStageOverlaps(product.stages)

                return (
                  <tr
                    key={product.id}
                    className={cn(
                      'border-b border-slate-100 transition-colors cursor-pointer',
                      rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40',
                      'hover:bg-brand-50/20'
                    )}
                    onClick={() => router.push(`/products/${product.id}`)}
                  >
                    {/* Product Name */}
                    <td
                      className={cn('sticky left-0 z-10 border-r border-slate-100 px-3 py-2', rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50')}
                      style={{ width: columnWidths.__product, minWidth: 120, maxWidth: columnWidths.__product }}
                    >
                      <Link href={`/products/${product.id}`} className="block">
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
                      const stage = stageMap[stageTemplate.order]
                      const isEditing = editingCell?.stageId === stage?.id && editingCell?.productId === product.id
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
                            <div className="p-1">
                              <DatePicker
                                value={editValue}
                                onChange={setEditValue}
                                onCommit={saveEdit}
                                onCancel={() => setEditingCell(null)}
                                inputClassName="h-10 min-w-[180px] text-sm"
                                panelClassName="w-[360px]"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <div
                              className={cn(cellClass, 'cursor-pointer hover:opacity-80 transition-opacity mx-0.5 relative', hasOverlap && 'ring-2 ring-orange-400 ring-inset')}
                              onClick={() => stage && startEdit(product.id, stage.id, stage.dateValue)}
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
      {stageMenu && (
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

'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Circle, AlertTriangle, MessageCircle, Clock, History, Zap, ExternalLink, Edit2, Save, Pencil, ChevronUp, ChevronDown, X } from 'lucide-react'
import { cn, getStatusColor, getStatusLabel, getPriorityColor, getPriorityLabel, formatDate, detectStageOverlaps } from '@/lib/utils'
// Types are string-based (no Prisma enums needed)

const AUTOMATION_ACTIONS = [
  { value: 'SHIFT_ALL_FOLLOWING', label: 'Сдвинуть все следующие этапы' },
  { value: 'SHIFT_FINAL_DATE_ONLY', label: 'Сдвинуть только финальную дату' },
  { value: 'MARK_AS_RISK', label: 'Пометить как "под риском"' },
  { value: 'RECALCULATE_BY_DURATIONS', label: 'Пересчитать по длительностям' },
  { value: 'NOTIFY_ONLY', label: 'Только уведомить' },
]

interface ProductCardClientProps {
  product: any
  users: Array<{ id: string; name: string }>
  currentUser: { id: string; name: string; role: string }
}

const TABS = [
  { id: 'stages', label: 'Этапы', icon: Clock },
  { id: 'comments', label: 'Комментарии', icon: MessageCircle },
  { id: 'history', label: 'История', icon: History },
  { id: 'automations', label: 'Автоматизации', icon: Zap },
]

export function ProductCardClient({ product: initial, users, currentUser }: ProductCardClientProps) {
  const [product, setProduct] = useState(initial)
  const [tab, setTab] = useState('stages')
  const [newComment, setNewComment] = useState('')
  const [savingComment, setSavingComment] = useState(false)
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [stageEditValues, setStageEditValues] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)

  // Context menu state
  const [stageMenu, setStageMenu] = useState<{ stageId: string; x: number; y: number } | null>(null)
  const [renamingStageId, setRenamingStageId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  // Automation modal state
  const [automationModal, setAutomationModal] = useState<{ stageId: string; stageOrder: number; stageName: string } | null>(null)
  const [automationName, setAutomationName] = useState('')
  const [automationAction, setAutomationAction] = useState('SHIFT_ALL_FOLLOWING')
  const [automationDesc, setAutomationDesc] = useState('')
  const [savingAutomation, setSavingAutomation] = useState(false)

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setStageMenu(null)
      }
    }
    if (stageMenu) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [stageMenu])

  const canEdit = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(currentUser?.role)

  const now = new Date()
  const completedStages = product.stages.filter((s: any) => s.isCompleted).length
  const totalStages = product.stages.length
  const progress = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0

  const addComment = async () => {
    if (!newComment.trim()) return
    setSavingComment(true)
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment, productId: product.id }),
      })
      const comment = await res.json()
      setProduct((p: any) => ({ ...p, comments: [comment, ...p.comments] }))
      setNewComment('')
    } finally {
      setSavingComment(false)
    }
  }

  const updateStage = async (stageId: string) => {
    const vals = stageEditValues[stageId]
    if (!vals) return
    setSaving(true)
    try {
      const res = await fetch('/api/stages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId, updates: vals }),
      })
      const { stage } = await res.json()
      setProduct((p: any) => ({
        ...p,
        stages: p.stages.map((s: any) => s.id === stageId ? { ...s, ...stage } : s),
      }))
      setEditingStageId(null)
    } finally {
      setSaving(false)
    }
  }

  const toggleStageComplete = async (stage: any) => {
    const newCompleted = !stage.isCompleted
    const res = await fetch('/api/stages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stageId: stage.id,
        updates: {
          isCompleted: newCompleted,
          status: newCompleted ? 'COMPLETED' : 'NOT_STARTED',
          actualDate: newCompleted ? new Date().toISOString() : null,
        },
      }),
    })
    const { stage: updated } = await res.json()
    setProduct((p: any) => ({
      ...p,
      stages: p.stages.map((s: any) => s.id === stage.id ? { ...s, ...updated } : s),
    }))
  }

  const getStageCellStyle = (stage: any) => {
    if (stage.isCompleted) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
    if (stage.dateValue) {
      const d = new Date(stage.dateValue)
      if (d < now) return 'text-red-700 bg-red-50 border-red-200'
      const daysLeft = Math.round((d.getTime() - now.getTime()) / 86400000)
      if (daysLeft <= 7) return 'text-amber-700 bg-amber-50 border-amber-200'
    }
    if (stage.dateRaw) return 'text-blue-700 bg-blue-50 border-blue-200'
    return 'text-slate-400 bg-slate-50 border-slate-100'
  }

  // Right-click context menu handler
  const handleStageContextMenu = (e: React.MouseEvent, stage: any) => {
    if (!canEdit) return
    e.preventDefault()
    e.stopPropagation()
    setStageMenu({ stageId: stage.id, x: e.clientX, y: e.clientY })
  }

  // Rename stage
  const handleRenameStage = async (stageId: string) => {
    if (!renameValue.trim()) { setRenamingStageId(null); return }
    setSaving(true)
    try {
      const res = await fetch('/api/stages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId, updates: { stageName: renameValue.trim() } }),
      })
      if (res.ok) {
        const { stage } = await res.json()
        setProduct((p: any) => ({
          ...p,
          stages: p.stages.map((s: any) => s.id === stageId ? { ...s, stageName: stage.stageName } : s),
        }))
      }
    } finally {
      setSaving(false)
      setRenamingStageId(null)
    }
  }

  // Move stage up or down (swap stageOrder with neighbor)
  const handleMoveStage = async (stageId: string, direction: 'up' | 'down') => {
    const stages = product.stages
    const idx = stages.findIndex((s: any) => s.id === stageId)
    if (idx < 0) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= stages.length) return

    const current = stages[idx]
    const target = stages[targetIdx]
    setSaving(true)
    try {
      const res = await fetch('/api/stages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: current.id, swapWithStageId: target.id }),
      })
      if (res.ok) {
        // Update local state
        setProduct((p: any) => {
          const newStages = [...p.stages]
          const currOrder = newStages[idx].stageOrder
          newStages[idx] = { ...newStages[idx], stageOrder: newStages[targetIdx].stageOrder }
          newStages[targetIdx] = { ...newStages[targetIdx], stageOrder: currOrder }
          newStages.sort((a: any, b: any) => a.stageOrder - b.stageOrder)
          return { ...p, stages: newStages }
        })
      }
    } finally {
      setSaving(false)
      setStageMenu(null)
    }
  }

  // Create automation for a specific stage
  const handleCreateAutomation = async () => {
    if (!automationModal || !automationName.trim()) return
    setSavingAutomation(true)
    try {
      const res = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: automationName,
          description: automationDesc || `Автоматизация для этапа "${automationModal.stageName}"`,
          productId: product.id,
          actionType: automationAction,
          triggerStageOrder: automationModal.stageOrder,
          config: { triggerStageOrder: automationModal.stageOrder },
          isActive: true,
        }),
      })
      if (res.ok) {
        const automation = await res.json()
        setProduct((p: any) => ({ ...p, automations: [...p.automations, automation] }))
        setAutomationModal(null)
        setAutomationName('')
        setAutomationDesc('')
        setAutomationAction('SHIFT_ALL_FOLLOWING')
      }
    } finally {
      setSavingAutomation(false)
    }
  }

  const { overlappingIds, overlaps } = detectStageOverlaps(product.stages)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Back */}
      <Link href="/products" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Назад к продуктам
      </Link>

      {/* Header Card */}
      <div className="card">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <span className={cn('badge border', getPriorityColor(product.priority))}>{getPriorityLabel(product.priority)}</span>
              <span className={cn('badge', getStatusColor(product.status))}>{getStatusLabel(product.status)}</span>
              {product.country && <span className="badge bg-slate-100 text-slate-600">{product.country}</span>}
            </div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight mb-2">{product.name}</h1>
            <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
              <span>Ответственный: <span className="font-medium text-slate-700">{product.responsible?.name || '—'}</span></span>
              <span>Финальная дата: <span className={cn('font-medium', product.finalDate && new Date(product.finalDate) < now ? 'text-red-600' : 'text-slate-700')}>{formatDate(product.finalDate)}</span></span>
              {product.competitorUrl && (
                <a href={product.competitorUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-brand-600 hover:text-brand-700">
                  <ExternalLink className="w-3.5 h-3.5" /> Конкурент
                </a>
              )}
            </div>
          </div>
          {/* Risk + Progress */}
          <div className="flex-shrink-0 text-right space-y-2">
            <div>
              <div className="text-xs text-slate-500 mb-1">Прогресс</div>
              <div className="text-2xl font-bold text-slate-800">{progress}%</div>
              <div className="text-xs text-slate-400">{completedStages}/{totalStages} этапов</div>
            </div>
            <div className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold',
              product.riskScore >= 70 ? 'bg-red-100 text-red-700' :
              product.riskScore >= 40 ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-600'
            )}>
              <AlertTriangle className="w-3 h-3" />
              Риск: {product.riskScore}/100
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="progress-bar h-2">
            <div
              className={cn('progress-fill', progress < 30 ? 'bg-red-500' : progress < 70 ? 'bg-amber-500' : 'bg-emerald-500')}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
        <div className="flex border-b border-slate-100 px-1 pt-1">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg transition-colors',
                  tab === t.id
                    ? 'text-brand-700 border-b-2 border-brand-600 bg-brand-50/50'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="p-5">
          {/* STAGES TAB */}
          {tab === 'stages' && (
            <div className="space-y-2">
              {overlaps.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg mb-3">
                  <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-orange-800">Обнаружены пересечения дат</p>
                    <ul className="mt-1 space-y-0.5">
                      {overlaps.map((o, i) => (
                        <li key={i} className="text-xs text-orange-700">
                          «{o.fromName}» → «{o.toName}»: дата предыдущего этапа позже следующего
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {product.stages.map((stage: any, idx: number) => {
                const hasOverlap = overlappingIds.has(stage.id)
                const isEditing = editingStageId === stage.id
                const vals = stageEditValues[stage.id] || {}
                const cellStyle = getStageCellStyle(stage)

                return (
                  <div
                    key={stage.id}
                    onContextMenu={(e) => handleStageContextMenu(e, stage)}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-all',
                      hasOverlap ? 'bg-orange-50/60 border-orange-200 ring-1 ring-orange-200' :
                      stage.isCompleted ? 'bg-emerald-50/40 border-emerald-100' : 'bg-white border-slate-100 hover:border-slate-200'
                    )}
                  >
                    {/* Checkbox */}
                    {canEdit ? (
                      <button onClick={() => toggleStageComplete(stage)} className="flex-shrink-0">
                        {stage.isCompleted
                          ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          : <Circle className="w-5 h-5 text-slate-300 hover:text-slate-400" />
                        }
                      </button>
                    ) : (
                      <div className="flex-shrink-0">
                        {stage.isCompleted
                          ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          : <Circle className="w-5 h-5 text-slate-200" />
                        }
                      </div>
                    )}

                    {/* Order */}
                    <div className="w-6 text-xs text-slate-400 text-center flex-shrink-0">{idx + 1}</div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      {renamingStageId === stage.id ? (
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="input text-sm w-full py-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameStage(stage.id)
                            if (e.key === 'Escape') setRenamingStageId(null)
                          }}
                          onBlur={() => handleRenameStage(stage.id)}
                        />
                      ) : (
                        <p className={cn('text-sm font-medium', stage.isCompleted ? 'line-through text-slate-400' : 'text-slate-700')}>
                          {stage.stageName}
                          {stage.isCritical && <span className="ml-1.5 text-xs text-red-500 font-semibold">КРИТИЧНЫЙ</span>}
                          {hasOverlap && <span className="ml-1.5 text-xs text-orange-600 font-semibold" title="Даты пересекаются с соседним этапом">⚠ ПЕРЕСЕЧЕНИЕ</span>}
                        </p>
                      )}
                      {stage.comment && !isEditing && renamingStageId !== stage.id && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate">{stage.comment}</p>
                      )}
                    </div>

                    {/* Date */}
                    <div className="flex-shrink-0">
                      {isEditing ? (
                        <input
                          type="date"
                          defaultValue={stage.dateValue ? new Date(stage.dateValue).toISOString().slice(0, 10) : ''}
                          onChange={(e) => setStageEditValues((prev) => ({
                            ...prev,
                            [stage.id]: { ...prev[stage.id], dateValue: e.target.value ? new Date(e.target.value) : null }
                          }))}
                          className="input text-xs w-36"
                        />
                      ) : (
                        <div className={cn('text-xs px-2 py-1 rounded border font-medium', cellStyle)}>
                          {stage.dateValue
                            ? formatDate(stage.dateValue)
                            : stage.dateRaw || '—'}
                        </div>
                      )}
                    </div>

                    {/* Duration */}
                    {stage.stageTemplate?.durationText && (
                      <div className="text-xs text-slate-400 flex-shrink-0 w-16 text-center">
                        {stage.stageTemplate.durationText}
                      </div>
                    )}

                    {/* Actions */}
                    {canEdit && (
                      <div className="flex-shrink-0 flex items-center gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => updateStage(stage.id)}
                              disabled={saving}
                              className="btn-primary py-1 px-2 text-xs"
                            >
                              <Save className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setEditingStageId(null)}
                              className="btn-secondary py-1 px-2 text-xs"
                            >
                              Отмена
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setEditingStageId(stage.id)}
                            className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* COMMENTS TAB */}
          {tab === 'comments' && (
            <div className="space-y-4">
              {canEdit && (
                <div className="space-y-2">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Добавить комментарий..."
                    className="input resize-none h-20"
                  />
                  <button
                    onClick={addComment}
                    disabled={!newComment.trim() || savingComment}
                    className="btn-primary"
                  >
                    {savingComment ? 'Сохраняем...' : 'Добавить комментарий'}
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {product.comments.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-8">Комментариев пока нет</p>
                ) : (
                  product.comments.map((comment: any) => (
                    <div key={comment.id} className="flex gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-semibold flex-shrink-0">
                        {comment.author.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-slate-700">{comment.author.name}</span>
                          <span className="text-xs text-slate-400">{formatDate(comment.createdAt)}</span>
                        </div>
                        <p className="text-sm text-slate-600">{comment.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* HISTORY TAB */}
          {tab === 'history' && (
            <div className="space-y-2">
              {product.changeHistory.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-8">История изменений пуста</p>
              ) : (
                product.changeHistory.map((h: any) => (
                  <div key={h.id} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{h.changedBy.name}</span>
                        <span>изменил(а)</span>
                        <span className="font-medium text-slate-700">{h.field}</span>
                        <span className="ml-auto text-slate-400">{formatDate(h.createdAt)}</span>
                      </div>
                      {h.oldValue && h.newValue && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          <span className="line-through">{h.oldValue.slice(0, 30)}</span> → <span className="text-slate-600">{h.newValue.slice(0, 30)}</span>
                        </div>
                      )}
                      {h.reason && <div className="text-xs text-slate-400 italic mt-0.5">{h.reason}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* AUTOMATIONS TAB */}
          {tab === 'automations' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500 mb-4">Активные автоматизации для этого продукта:</p>
              {product.automations.length === 0 ? (
                <div className="text-center py-8">
                  <Zap className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Нет активных автоматизаций</p>
                  <Link href="/automations" className="text-xs text-brand-600 hover:text-brand-700 mt-1 inline-block">
                    Настроить автоматизации →
                  </Link>
                </div>
              ) : (
                product.automations.map((a: any) => (
                  <div key={a.id} className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-800">{a.name}</span>
                    </div>
                    <p className="text-xs text-amber-700">{a.description}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stage Context Menu */}
      {stageMenu && (() => {
        const stage = product.stages.find((s: any) => s.id === stageMenu.stageId)
        if (!stage) return null
        const idx = product.stages.findIndex((s: any) => s.id === stageMenu.stageId)
        const isFirst = idx === 0
        const isLast = idx === product.stages.length - 1
        return (
          <div
            ref={menuRef}
            className="fixed z-50 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[200px]"
            style={{ left: stageMenu.x, top: stageMenu.y }}
          >
            <button
              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              onClick={() => {
                setRenamingStageId(stage.id)
                setRenameValue(stage.stageName)
                setStageMenu(null)
              }}
            >
              <Pencil className="w-3.5 h-3.5 text-slate-400" />
              Переименовать
            </button>
            <button
              className={cn('w-full px-3 py-2 text-left text-sm flex items-center gap-2', isFirst ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-50')}
              onClick={() => !isFirst && handleMoveStage(stage.id, 'up')}
              disabled={isFirst}
            >
              <ChevronUp className="w-3.5 h-3.5" />
              Переместить вверх
            </button>
            <button
              className={cn('w-full px-3 py-2 text-left text-sm flex items-center gap-2', isLast ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-slate-50')}
              onClick={() => !isLast && handleMoveStage(stage.id, 'down')}
              disabled={isLast}
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Переместить вниз
            </button>
            <div className="border-t border-slate-100 my-1" />
            <button
              className="w-full px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50 flex items-center gap-2"
              onClick={() => {
                setAutomationModal({ stageId: stage.id, stageOrder: stage.stageOrder, stageName: stage.stageName })
                setAutomationName(`При изменении "${stage.stageName}"`)
                setStageMenu(null)
              }}
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Настроить автоматизацию
            </button>
          </div>
        )
      })()}

      {/* Automation Modal */}
      {automationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setAutomationModal(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-semibold text-slate-900">Автоматизация этапа</h3>
              </div>
              <button onClick={() => setAutomationModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-500">
              Настройте действие при изменении даты этапа <span className="font-medium text-slate-700">{automationModal.stageName}</span>
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Название</label>
              <input
                type="text"
                value={automationName}
                onChange={(e) => setAutomationName(e.target.value)}
                className="input w-full"
                placeholder="Название автоматизации"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Действие</label>
              <select
                value={automationAction}
                onChange={(e) => setAutomationAction(e.target.value)}
                className="input w-full"
              >
                {AUTOMATION_ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Описание (опционально)</label>
              <textarea
                value={automationDesc}
                onChange={(e) => setAutomationDesc(e.target.value)}
                className="input w-full resize-none h-16"
                placeholder="Опишите логику автоматизации..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setAutomationModal(null)} className="btn-secondary text-sm">Отмена</button>
              <button
                onClick={handleCreateAutomation}
                className="btn-primary text-sm"
                disabled={!automationName.trim() || savingAutomation}
              >
                <Zap className="w-4 h-4" />
                {savingAutomation ? 'Сохраняем...' : 'Создать автоматизацию'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

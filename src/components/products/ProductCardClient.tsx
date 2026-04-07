'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, AtSign, CalendarDays, CheckCircle2, Circle, AlertTriangle, MessageCircle, Clock, History, Zap, ExternalLink, Edit2, Save, Pencil, ChevronUp, ChevronDown, X, Plus, Trash2, SendHorizontal, PanelLeft } from 'lucide-react'
import { cn, getStatusColor, getStatusLabel, getPriorityColor, getPriorityLabel, formatDate, detectStageOverlaps, formatStageOverlap } from '@/lib/utils'
import { DatePicker } from '@/components/ui/DatePicker'
import { resolveBackNavigation } from '@/lib/navigation'
import { UserAvatar } from '@/components/users/UserAvatar'
import { encodeCommentMentions, getCommentSegments } from '@/lib/comment-mentions'
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
  users: Array<{ id: string; name: string; lastName?: string | null; avatar?: string | null }>
  currentUser: { id: string; name: string; role: string }
}

const TABS = [
  { id: 'stages', label: 'Этапы', icon: Clock },
  { id: 'comments', label: 'Комментарии', icon: MessageCircle },
  { id: 'history', label: 'История', icon: History },
  { id: 'automations', label: 'Автоматизации', icon: Zap },
]

export function ProductCardClient({ product: initial, users, currentUser }: ProductCardClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [product, setProduct] = useState(initial)
  const [tab, setTab] = useState(() => {
    const nextTab = searchParams.get('tab')
    return TABS.some((item) => item.id === nextTab) ? nextTab! : 'stages'
  })
  const [newComment, setNewComment] = useState('')
  const [selectedMentions, setSelectedMentions] = useState<Record<string, string>>({})
  const [mentionState, setMentionState] = useState<{ query: string; start: number; end: number } | null>(null)
  const [savingComment, setSavingComment] = useState(false)
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [stageEditValues, setStageEditValues] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [showAddStageForm, setShowAddStageForm] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [newStageDate, setNewStageDate] = useState<Date | null>(null)
  const [newStageAutoshift, setNewStageAutoshift] = useState(true)

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
  const [deletingProduct, setDeletingProduct] = useState(false)
  const commentInputRef = useRef<HTMLInputElement>(null)

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
  const canComment = Boolean(currentUser?.id)
  const canDeleteProduct = ['ADMIN', 'DIRECTOR'].includes(currentUser?.role)
  const backNavigation = resolveBackNavigation(searchParams.get('returnTo'))
  const mentionableUsers = useMemo(
    () =>
      users
        .map((user) => ({
          ...user,
          displayName: [user.name, user.lastName].filter(Boolean).join(' ').trim() || user.name,
        }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName, 'ru')),
    [users]
  )
  const activeMentionSuggestions = useMemo(() => {
    if (!mentionState) return []

    const query = mentionState.query.trim().toLowerCase()
    return mentionableUsers
      .filter((user) => {
        if (user.id === currentUser.id) return false
        if (!query) return true
        return user.displayName.toLowerCase().includes(query)
      })
      .slice(0, 6)
  }, [currentUser.id, mentionState, mentionableUsers])
  const commentFeed = useMemo(
    () =>
      [...product.comments].sort(
        (left: any, right: any) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      ),
    [product.comments]
  )
  const commentParticipants = useMemo(() => {
    const seen = new Map<string, any>()
    for (const comment of commentFeed) {
      if (comment.author?.id && !seen.has(comment.author.id)) {
        seen.set(comment.author.id, comment.author)
      }
    }
    return [...seen.values()]
  }, [commentFeed])

  useEffect(() => {
    const nextTab = searchParams.get('tab')
    if (nextTab && TABS.some((item) => item.id === nextTab) && nextTab !== tab) {
      setTab(nextTab)
    } else if (!nextTab && tab !== 'stages') {
      setTab('stages')
    }
  }, [searchParams, tab])

  useEffect(() => {
    if (tab !== 'comments') return

    let cancelled = false

    const syncComments = async () => {
      try {
        const res = await fetch(`/api/comments?productId=${encodeURIComponent(product.id)}`, {
          cache: 'no-store',
          credentials: 'include',
        })
        if (!res.ok) return

        const data = await res.json()
        if (cancelled) return

        setProduct((prev: any) => ({
          ...prev,
          comments: data.comments || prev.comments,
        }))
      } catch {
        // Silent polling failure keeps chat responsive.
      }
    }

    syncComments()
    const intervalId = window.setInterval(syncComments, 4000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [product.id, tab])

  const now = new Date()
  const completedStages = product.stages.filter((s: any) => s.isCompleted).length
  const totalStages = product.stages.length
  const progress = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0

  const syncCommentMentionState = (value: string, caretPosition: number) => {
    const beforeCaret = value.slice(0, caretPosition)
    const match = beforeCaret.match(/(^|\s)@([^\s@]*)$/u)

    if (!match) {
      setMentionState(null)
      return
    }

    const query = match[2]
    const start = beforeCaret.lastIndexOf(`@${query}`)
    setMentionState({ query, start, end: caretPosition })
  }

  const handleCommentChange = (value: string, caretPosition: number) => {
    setNewComment(value)
    syncCommentMentionState(value, caretPosition)
  }

  const insertMention = (user: { id: string; displayName: string }) => {
    if (!mentionState) return

    const beforeMention = newComment.slice(0, mentionState.start)
    const afterMention = newComment.slice(mentionState.end)
    const insertedText = `@${user.displayName} `
    const nextComment = `${beforeMention}${insertedText}${afterMention}`
    const nextCaret = beforeMention.length + insertedText.length

    setNewComment(nextComment)
    setSelectedMentions((current) => ({ ...current, [user.displayName]: user.id }))
    setMentionState(null)

    requestAnimationFrame(() => {
      if (!commentInputRef.current) return
      commentInputRef.current.focus()
      commentInputRef.current.setSelectionRange(nextCaret, nextCaret)
    })
  }

  const submitComment = () => {
    if (savingComment || !newComment.trim()) return
    addComment()
  }

  const handleCommentKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return

    event.preventDefault()

    if (mentionState && activeMentionSuggestions.length > 0) {
      insertMention(activeMentionSuggestions[0])
      return
    }

    submitComment()
  }

  const updateActiveTab = (nextTab: string) => {
    setTab(nextTab)
    const params = new URLSearchParams(searchParams.toString())

    if (nextTab === 'stages') {
      params.delete('tab')
    } else {
      params.set('tab', nextTab)
    }

    const nextQuery = params.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
  }

  const formatCommentTimestamp = (date: Date | string) =>
    new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date))

  const addComment = async () => {
    if (!newComment.trim()) return
    setSavingComment(true)
    try {
      const content = encodeCommentMentions(
        newComment,
        Object.entries(selectedMentions).map(([label, id]) => ({ label, id }))
      )
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, productId: product.id }),
      })
      const comment = await res.json()
      if (!res.ok) {
        throw new Error(comment?.error || 'Не удалось добавить комментарий')
      }
      setProduct((p: any) => ({
        ...p,
        comments: [...p.comments.filter((item: any) => item.id !== comment.id), comment],
      }))
      setNewComment('')
      setSelectedMentions({})
      setMentionState(null)
    } catch (error: any) {
      alert(error.message || 'Не удалось добавить комментарий')
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
        body: JSON.stringify({ stageId, updates: vals, applyAutomations: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось обновить этап')
      }

      setProduct((p: any) => ({
        ...p,
        stages: data.stages || p.stages,
        finalDate: data.product?.finalDate ?? p.finalDate,
        progressPercent: data.product?.progressPercent ?? p.progressPercent,
        riskScore: data.product?.riskScore ?? p.riskScore,
        status: data.product?.status ?? p.status,
      }))
      setEditingStageId(null)
    } catch (error: any) {
      alert(error.message || 'Не удалось обновить этап')
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
    if (stage.isCompleted) return 'text-emerald-700 bg-emerald-50'
    if (stage.dateValue) {
      const d = new Date(stage.dateValue)
      if (d < now) return 'text-red-700 bg-red-50'
      const daysLeft = Math.round((d.getTime() - now.getTime()) / 86400000)
      if (daysLeft <= 7) return 'text-amber-700 bg-amber-50'
    }
    if (stage.dateRaw) return 'text-blue-700 bg-blue-50'
    return 'text-slate-400 bg-slate-50'
  }

  // Right-click context menu handler
  const handleStageContextMenu = (e: React.MouseEvent, stage: any) => {
    if (!canEdit) return
    e.preventDefault()
    e.stopPropagation()
    const menuWidth = 220
    const menuHeight = 320
    const nextX = Math.max(12, Math.min(e.clientX, window.innerWidth - menuWidth - 12))
    const nextY = Math.max(12, Math.min(e.clientY, window.innerHeight - menuHeight - 12))
    setStageMenu({ stageId: stage.id, x: nextX, y: nextY })
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

  const handleAddStage = async () => {
    const stageName = newStageName.trim()
    if (!stageName) return

    setSaving(true)
    try {
      const res = await fetch(`/api/products/${product.id}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageName,
          dateValue: newStageDate || null,
          participatesInAutoshift: newStageAutoshift,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Не удалось добавить этап')
      }

      setProduct((prev: any) => ({
        ...prev,
        stages: data.stages,
        finalDate: data.finalDate ?? prev.finalDate,
        progressPercent: data.progressPercent,
        riskScore: data.riskScore,
        status: data.status,
      }))
      setNewStageName('')
      setNewStageDate(null)
      setNewStageAutoshift(true)
      setShowAddStageForm(false)
    } catch (error: any) {
      alert(error.message || 'Не удалось добавить этап')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStageAutoshift = async (stage: any, nextValue: boolean) => {
    setSaving(true)
    try {
      const res = await fetch('/api/stages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: stage.id,
          updates: { participatesInAutoshift: nextValue },
          applyAutomations: false,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось обновить автосдвиг этапа')
      }

      setProduct((prev: any) => ({
        ...prev,
        stages: data.stages || prev.stages,
        finalDate: data.product?.finalDate ?? prev.finalDate,
        progressPercent: data.product?.progressPercent ?? prev.progressPercent,
        riskScore: data.product?.riskScore ?? prev.riskScore,
        status: data.product?.status ?? prev.status,
      }))
      setStageMenu(null)
    } catch (error: any) {
      alert(error.message || 'Не удалось обновить автосдвиг этапа')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteStage = async (stageId: string) => {
    const confirmed = window.confirm('Удалить этот этап из продукта?')
    if (!confirmed) return

    setSaving(true)
    try {
      const res = await fetch(`/api/products/${product.id}/stages?stageId=${encodeURIComponent(stageId)}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Не удалось удалить этап')
      }

      setProduct((prev: any) => ({
        ...prev,
        stages: data.stages,
        finalDate: data.finalDate ?? prev.finalDate,
        progressPercent: data.progressPercent,
        riskScore: data.riskScore,
        status: data.status,
      }))
      setStageMenu(null)
    } catch (error: any) {
      alert(error.message || 'Не удалось удалить этап')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProduct = async () => {
    const confirmed = window.confirm(`Удалить продукт «${product.name}»?`)
    if (!confirmed) return

    setDeletingProduct(true)
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось удалить продукт')
      }

      router.push(backNavigation.href)
      router.refresh()
    } catch (error: any) {
      alert(error.message || 'Не удалось удалить продукт')
      setDeletingProduct(false)
    }
  }

  const { overlappingIds, overlaps } = detectStageOverlaps(product.stages)

  const handleAcceptOverlap = async (stageIds: string[]) => {
    setSaving(true)
    try {
      const res = await fetch('/api/stages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageIds,
          updates: { overlapAccepted: true },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось принять пересечение')
      }

      setProduct((p: any) => ({
        ...p,
        stages: data.stages || p.stages,
        finalDate: data.product?.finalDate ?? p.finalDate,
        progressPercent: data.product?.progressPercent ?? p.progressPercent,
        riskScore: data.product?.riskScore ?? p.riskScore,
        status: data.product?.status ?? p.status,
      }))
    } catch (error: any) {
      alert(error.message || 'Не удалось принять пересечение')
    } finally {
      setSaving(false)
    }
  }

  const renderCommentContent = (content: string, ownMessage = false) =>
    getCommentSegments(content).map((segment, index) => {
      if (segment.type === 'mention') {
        return (
          <span
            key={`${segment.userId}-${index}`}
            className={cn(
              'rounded-full px-2 py-0.5 font-medium',
              ownMessage ? 'bg-slate-100 text-slate-700' : 'bg-brand-50 text-brand-700'
            )}
          >
            {segment.text}
          </span>
        )
      }

      return (
        <span key={`text-${index}`} className="whitespace-pre-wrap">
          {segment.text}
        </span>
      )
    })

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Back */}
      <div className="flex items-center justify-between gap-3">
        <Link href={backNavigation.href} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {backNavigation.label}
        </Link>
        {canDeleteProduct && (
          <button
            onClick={handleDeleteProduct}
            disabled={deletingProduct}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            {deletingProduct ? 'Удаление...' : 'Удалить продукт'}
          </button>
        )}
      </div>

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

      {/* Workspace */}
      <div className="surface-panel overflow-hidden p-0">
        <div className="grid lg:grid-cols-[220px,minmax(0,1fr)]">
          <aside className="border-b border-slate-100 bg-slate-50/80 p-3 lg:border-b-0 lg:border-r">
            <div className="space-y-1">
              {TABS.map((t) => {
                const Icon = t.icon
                const active = tab === t.id

                return (
                  <button
                    key={t.id}
                    onClick={() => updateActiveTab(t.id)}
                    className={cn(
                      'relative flex w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left text-sm font-medium transition-colors',
                      active ? 'text-white' : 'text-slate-500 hover:bg-white hover:text-slate-800'
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="product-tab-indicator"
                        className="absolute inset-0 rounded-[20px] bg-brand-950"
                        transition={{ type: 'spring', stiffness: 390, damping: 34 }}
                      />
                    )}
                    <Icon className="relative z-10 h-4 w-4" />
                    <span className="relative z-10">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </aside>

          <div className="min-w-0 p-5">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {tab === 'stages' && (
                  <div className="space-y-2">
                    {canEdit && (
                      <div className="mb-3 flex items-center justify-end gap-3">
                        <button
                          onClick={() => {
                            setShowAddStageForm((prev) => {
                              const next = !prev
                              if (!next) {
                                setNewStageName('')
                                setNewStageDate(null)
                                setNewStageAutoshift(true)
                              }
                              return next
                            })
                          }}
                          className="btn-primary text-sm"
                          disabled={saving}
                        >
                          <Plus className="w-4 h-4" />
                          Добавить этап
                        </button>
                      </div>
                    )}
                    {canEdit && showAddStageForm && (
                      <div className="mb-3 flex items-center gap-2 rounded-[24px] bg-slate-50 p-3">
                        <input
                          type="text"
                          value={newStageName}
                          onChange={(e) => setNewStageName(e.target.value)}
                          className="input flex-1 text-sm"
                          placeholder="Название нового этапа"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddStage()
                            if (e.key === 'Escape') {
                              setShowAddStageForm(false)
                              setNewStageName('')
                              setNewStageDate(null)
                              setNewStageAutoshift(true)
                            }
                          }}
                        />
                        <DatePicker
                          value={newStageDate}
                          onChange={setNewStageDate}
                          inputClassName="h-11 w-56 text-sm"
                          panelClassName="w-[360px]"
                          placeholder="Дата этапа"
                        />
                        <label className="flex h-11 items-center gap-2 rounded-[18px] bg-white px-3 text-sm text-slate-600">
                          <span className="whitespace-nowrap">Автосдвиг</span>
                          <input
                            type="checkbox"
                            checked={newStageAutoshift}
                            onChange={(e) => setNewStageAutoshift(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                        </label>
                        <button onClick={handleAddStage} className="btn-primary text-sm" disabled={!newStageName.trim() || saving}>
                          <Save className="w-4 h-4" />
                          Сохранить
                        </button>
                        <button
                          onClick={() => {
                            setShowAddStageForm(false)
                            setNewStageName('')
                            setNewStageDate(null)
                            setNewStageAutoshift(true)
                          }}
                          className="btn-secondary text-sm"
                          disabled={saving}
                        >
                          Отмена
                        </button>
                      </div>
                    )}
                    {overlaps.length > 0 && (
                      <div className="mb-3 flex items-start gap-2 rounded-[24px] bg-orange-50 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-500" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-orange-800">Обнаружены пересечения дат</p>
                          <ul className="mt-2 space-y-2">
                            {overlaps.map((o, i) => (
                              <li key={i} className="flex items-start justify-between gap-3 rounded-[16px] bg-white/70 px-3 py-2 text-xs text-orange-700">
                                <span>{formatStageOverlap(o)}{o.dateLabel ? ` (${o.dateLabel})` : ''}</span>
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => handleAcceptOverlap(o.stageIds)}
                                    className="flex-shrink-0 rounded-[14px] px-2.5 py-1 font-medium text-orange-700 transition hover:bg-orange-100"
                                    disabled={saving}
                                  >
                                    Принять
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    {product.stages.map((stage: any, idx: number) => {
                      const hasOverlap = overlappingIds.has(stage.id)
                      const isEditing = editingStageId === stage.id
                      const cellStyle = getStageCellStyle(stage)

                      return (
                        <div
                          key={stage.id}
                          onContextMenu={(e) => handleStageContextMenu(e, stage)}
                          className={cn(
                            'flex items-center gap-3 rounded-[24px] p-3 transition-all',
                            hasOverlap ? 'bg-orange-50/60 ring-1 ring-orange-200' :
                            stage.isCompleted ? 'bg-emerald-50/40' : 'bg-slate-50/70 hover:bg-slate-100/80'
                          )}
                        >
                          {canEdit ? (
                            <button onClick={() => toggleStageComplete(stage)} className="flex-shrink-0">
                              {stage.isCompleted
                                ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                : <Circle className="h-5 w-5 text-slate-300 hover:text-slate-400" />
                              }
                            </button>
                          ) : (
                            <div className="flex-shrink-0">
                              {stage.isCompleted
                                ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                : <Circle className="h-5 w-5 text-slate-200" />
                              }
                            </div>
                          )}

                          <div className="w-6 flex-shrink-0 text-center text-xs text-slate-400">{idx + 1}</div>

                          <div className="min-w-0 flex-1">
                            {renamingStageId === stage.id ? (
                              <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                className="input w-full py-1 text-sm"
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
                                {stage.isCritical && <span className="ml-1.5 text-xs font-semibold text-red-500">КРИТИЧНЫЙ</span>}
                                {stage.participatesInAutoshift === false && (
                                  <span className="ml-1.5 text-xs font-semibold text-slate-500">АВТОСДВИГ ВЫКЛ.</span>
                                )}
                                {hasOverlap && <span className="ml-1.5 text-xs font-semibold text-orange-600">⚠ ПЕРЕСЕЧЕНИЕ</span>}
                              </p>
                            )}
                            {stage.comment && !isEditing && renamingStageId !== stage.id && (
                              <p className="mt-0.5 truncate text-xs text-slate-400">{stage.comment}</p>
                            )}
                          </div>

                          <div className="flex-shrink-0">
                            {isEditing ? (
                              <DatePicker
                                value={stageEditValues[stage.id]?.dateValue ?? (stage.dateValue ? new Date(stage.dateValue) : null)}
                                onChange={(nextDate) => setStageEditValues((prev) => ({
                                  ...prev,
                                  [stage.id]: { ...prev[stage.id], dateValue: nextDate }
                                }))}
                                onCommit={() => updateStage(stage.id)}
                                onCancel={() => setEditingStageId(null)}
                                inputClassName="h-10 w-48 text-xs"
                                panelClassName="w-[360px]"
                              />
                            ) : (
                              <div className={cn('rounded-[16px] px-2.5 py-1.5 text-xs font-medium', cellStyle)}>
                                {stage.dateValue ? formatDate(stage.dateValue) : stage.dateRaw || '—'}
                              </div>
                            )}
                          </div>

                          {stage.stageTemplate?.durationText && (
                            <div className="w-16 flex-shrink-0 text-center text-xs text-slate-400">
                              {stage.stageTemplate.durationText}
                            </div>
                          )}

                          {canEdit && (
                            <div className="flex flex-shrink-0 items-center gap-1">
                              {isEditing ? (
                                <>
                                  <button onClick={() => updateStage(stage.id)} disabled={saving} className="btn-primary px-2 py-1 text-xs">
                                    <Save className="h-3 w-3" />
                                  </button>
                                  <button onClick={() => setEditingStageId(null)} className="btn-secondary px-2 py-1 text-xs">
                                    Отмена
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setEditingStageId(stage.id)}
                                  className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {tab === 'comments' && (
                  <div className="grid gap-5 xl:grid-cols-[280px,minmax(0,1fr)]">
                    <div className="space-y-4">
                      <div className="rounded-[28px] bg-slate-50 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <PanelLeft className="h-4 w-4 text-brand-600" />
                          <h3 className="text-sm font-semibold text-slate-800">Обсуждение продукта</h3>
                        </div>
                        <div className="space-y-3 text-sm text-slate-500">
                          <div className="flex items-center justify-between rounded-[18px] bg-white px-3 py-2">
                            <span>Комментариев</span>
                            <span className="font-semibold text-slate-800">{product.comments.length}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-[18px] bg-white px-3 py-2">
                            <span>Участников</span>
                            <span className="font-semibold text-slate-800">{commentParticipants.length || 1}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[28px] bg-slate-50 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <AtSign className="h-4 w-4 text-brand-600" />
                          <h3 className="text-sm font-semibold text-slate-800">Кого можно отметить</h3>
                        </div>
                        <div className="space-y-2">
                          {mentionableUsers.slice(0, 8).map((user) => (
                            <div key={user.id} className="flex items-center gap-2 rounded-[18px] bg-white px-3 py-2">
                              <UserAvatar user={user} size="sm" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-700">{user.displayName}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[28px] bg-slate-50 p-4">
                      <div className="flex min-h-[560px] flex-col overflow-hidden rounded-[24px] bg-white shadow-[inset_0_0_0_1px_rgba(226,232,240,0.7)]">
                        <div className="border-b border-slate-100 px-4 py-3">
                          <h3 className="text-sm font-semibold text-slate-800">Комментарии по продукту</h3>
                          <p className="mt-1 text-xs text-slate-400">Пиши сообщения, отмечай коллег через `@` и обсуждай изменения прямо в карточке продукта.</p>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                          {commentFeed.length === 0 ? (
                            <div className="flex h-full min-h-[280px] items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-slate-50/80 text-center">
                              <div>
                                <MessageCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                                <p className="text-sm font-medium text-slate-500">Комментариев пока нет</p>
                                <p className="mt-1 text-xs text-slate-400">Начни обсуждение прямо отсюда.</p>
                              </div>
                            </div>
                          ) : (
                            commentFeed.map((comment: any) => {
                              const ownMessage = comment.author?.id === currentUser.id
                              const authorName = comment.author?.lastName
                                ? `${comment.author.name} ${comment.author.lastName}`
                                : comment.author?.name

                              return (
                                <div key={comment.id} className={cn('flex gap-3', ownMessage ? 'justify-end' : 'justify-start')}>
                                  {!ownMessage && <UserAvatar user={comment.author} size="sm" className="mt-7" />}
                                  <div className="max-w-[62%] space-y-1">
                                    <div className={cn('flex items-center gap-2 text-xs text-slate-400', ownMessage && 'justify-end')}>
                                      <span className="font-semibold text-slate-700">{authorName}</span>
                                      <span>{formatCommentTimestamp(comment.createdAt)}</span>
                                    </div>
                                    <div
                                      className={cn(
                                        'px-0.5 py-0.5 text-sm leading-6',
                                        ownMessage ? 'text-slate-800' : 'text-slate-600'
                                      )}
                                    >
                                      <div className={cn('flex flex-wrap items-center gap-1.5', ownMessage && 'justify-end')}>
                                        {renderCommentContent(comment.content || comment.displayContent || '', ownMessage)}
                                      </div>
                                    </div>
                                  </div>
                                  {ownMessage && <UserAvatar user={comment.author} size="sm" className="mt-7" />}
                                </div>
                              )
                            })
                          )}
                        </div>

                        {canComment && (
                          <div className="border-t border-slate-100 px-4 py-4">
                            <div className="relative">
                              <input
                                ref={commentInputRef}
                                type="text"
                                value={newComment}
                                onChange={(e) => handleCommentChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                                onClick={(e) => syncCommentMentionState(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
                                onKeyUp={(e) => syncCommentMentionState(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
                                onKeyDown={handleCommentKeyDown}
                                placeholder="Напиши комментарий или отметь коллегу через @..."
                                className="input h-12 pr-14"
                              />
                              {mentionState && activeMentionSuggestions.length > 0 && (
                                <div className="absolute bottom-[calc(100%+10px)] left-0 z-20 w-full max-w-sm overflow-hidden rounded-[22px] border border-slate-200 bg-white p-2 shadow-[0_22px_60px_-32px_rgba(15,23,42,0.45)]">
                                  <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                                    Выбери пользователя
                                  </div>
                                  <div className="space-y-1">
                                    {activeMentionSuggestions.map((user) => (
                                      <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => insertMention(user)}
                                        className="flex w-full items-center gap-2 rounded-[16px] px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                                      >
                                        <UserAvatar user={user} size="sm" />
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-slate-700">{user.displayName}</p>
                                          <p className="text-xs text-slate-400">@{user.name}</p>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={submitComment}
                                disabled={!newComment.trim() || savingComment}
                                className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-brand-950 text-white transition hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <SendHorizontal className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <div className="text-xs text-slate-400">
                                {Object.keys(selectedMentions).length > 0
                                  ? `Подготовлено упоминаний: ${Object.keys(selectedMentions).length}`
                                  : 'Используй @, чтобы отметить сотрудника и отправить ему уведомление.'}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'history' && (
                  <div className="space-y-2">
                    {product.changeHistory.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-400">История изменений пуста</p>
                    ) : (
                      product.changeHistory.map((h: any) => (
                        <div key={h.id} className="flex items-start gap-3 border-b border-slate-50 py-2 last:border-0">
                          <div className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-400" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="font-medium text-slate-700">{h.changedBy.name}</span>
                              <span>изменил(а)</span>
                              <span className="font-medium text-slate-700">{h.field}</span>
                              <span className="ml-auto text-slate-400">{formatDate(h.createdAt)}</span>
                            </div>
                            {h.oldValue && h.newValue && (
                              <div className="mt-0.5 text-xs text-slate-400">
                                <span className="line-through">{h.oldValue.slice(0, 30)}</span> → <span className="text-slate-600">{h.newValue.slice(0, 30)}</span>
                              </div>
                            )}
                            {h.reason && <div className="mt-0.5 text-xs italic text-slate-400">{h.reason}</div>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {tab === 'automations' && (
                  <div className="space-y-3">
                    <p className="mb-4 text-sm text-slate-500">Активные автоматизации для этого продукта:</p>
                    {product.automations.length === 0 ? (
                      <div className="py-8 text-center">
                        <Zap className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                        <p className="text-sm text-slate-400">Нет активных автоматизаций</p>
                        <Link href="/automations" className="mt-1 inline-block text-xs text-brand-600 hover:text-brand-700">
                          Настроить автоматизации →
                        </Link>
                      </div>
                    ) : (
                      product.automations.map((a: any) => (
                        <div key={a.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                          <div className="mb-1 flex items-center gap-2">
                            <Zap className="h-4 w-4 text-amber-600" />
                            <span className="text-sm font-semibold text-amber-800">{a.name}</span>
                          </div>
                          <p className="text-xs text-amber-700">{a.description}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Stage Context Menu */}
      <AnimatePresence>
      {stageMenu && (() => {
        const stage = product.stages.find((s: any) => s.id === stageMenu.stageId)
        if (!stage) return null
        const idx = product.stages.findIndex((s: any) => s.id === stageMenu.stageId)
        const isFirst = idx === 0
        const isLast = idx === product.stages.length - 1
        return (
          <motion.div
            ref={menuRef}
            className="fixed z-[130] bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[220px]"
            style={{ left: stageMenu.x, top: stageMenu.y }}
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              onClick={() => {
                setEditingStageId(stage.id)
                setStageEditValues((prev) => ({
                  ...prev,
                  [stage.id]: { ...prev[stage.id], dateValue: stage.dateValue ? new Date(stage.dateValue) : null },
                }))
                setStageMenu(null)
              }}
            >
              <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
              Изменить дату
            </button>
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
            <button
              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              onClick={() => handleToggleStageAutoshift(stage, stage.participatesInAutoshift === false)}
            >
              <Zap className={cn('w-3.5 h-3.5', stage.participatesInAutoshift === false ? 'text-slate-400' : 'text-emerald-500')} />
              {stage.participatesInAutoshift === false ? 'Включить автосдвиг' : 'Отключить автосдвиг'}
            </button>
            <div className="border-t border-slate-100 my-1" />
            <button
              className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              onClick={() => handleDeleteStage(stage.id)}
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              Удалить этап
            </button>
          </motion.div>
        )
      })()}
      </AnimatePresence>

      {/* Automation Modal */}
      <AnimatePresence>
      {automationModal && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/20 backdrop-blur-md"
          onClick={() => setAutomationModal(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="w-full max-w-md space-y-4 rounded-[28px] bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
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

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setAutomationModal(null)}
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateAutomation}
                className="btn-primary text-sm"
                disabled={!automationName.trim() || savingAutomation}
              >
                <Zap className="w-4 h-4" />
                {savingAutomation ? 'Сохраняем...' : 'Создать автоматизацию'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}

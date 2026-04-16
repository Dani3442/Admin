'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { ArrowLeft, CalendarDays, CheckCircle2, Circle, AlertTriangle, MessageCircle, Clock, History, Zap, ExternalLink, Edit2, Save, Pencil, ChevronUp, ChevronDown, X, Plus, Trash2, SendHorizontal, Archive, ArchiveRestore } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FloatingContextMenu } from '@/components/ui/FloatingContextMenu'
import { cn, getStatusColor, getStatusLabel, getPriorityColor, getPriorityLabel, formatDate, formatDurationDays, detectStageOverlaps, formatStageOverlap } from '@/lib/utils'
import { DatePicker } from '@/components/ui/DatePicker'
import { resolveBackNavigation } from '@/lib/navigation'
import { UserAvatar } from '@/components/users/UserAvatar'
import { encodeCommentMentions, getCommentSegments } from '@/lib/comment-mentions'
import { useContextMenu } from '@/hooks/useContextMenu'
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

  const [renamingStageId, setRenamingStageId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Automation modal state
  const [automationModal, setAutomationModal] = useState<{ stageId: string; stageOrder: number; stageName: string } | null>(null)
  const [automationName, setAutomationName] = useState('')
  const [automationAction, setAutomationAction] = useState('SHIFT_ALL_FOLLOWING')
  const [automationDesc, setAutomationDesc] = useState('')
  const [savingAutomation, setSavingAutomation] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState(false)
  const [lifecycleSaving, setLifecycleSaving] = useState(false)
  const [pendingDeleteStageId, setPendingDeleteStageId] = useState<string | null>(null)
  const [deleteStageError, setDeleteStageError] = useState<string | null>(null)
  const [confirmArchiveProductOpen, setConfirmArchiveProductOpen] = useState(false)
  const [confirmRestoreProductOpen, setConfirmRestoreProductOpen] = useState(false)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const commentsScrollRef = useRef<HTMLDivElement>(null)
  const markedSeenProductRef = useRef<string | null>(null)
  const {
    menu: stageMenu,
    menuRef,
    closeMenu: closeStageMenu,
    openMenuFromEvent: openStageMenu,
  } = useContextMenu<{ stageId: string }>({
    width: 220,
    height: 320,
  })

  const canEdit = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(currentUser?.role) && !product.isArchived
  const canComment = Boolean(currentUser?.id) && !product.isArchived
  const canArchiveProduct = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(currentUser?.role)
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
    let firstSync = true

    const syncComments = async () => {
      try {
        const params = new URLSearchParams({ productId: product.id })
        if (firstSync || markedSeenProductRef.current !== product.id) {
          params.set('markSeen', '1')
        }

        const res = await fetch(`/api/comments?${params.toString()}`, {
          cache: 'no-store',
          credentials: 'include',
        })
        if (!res.ok) return

        const data = await res.json()
        if (cancelled) return

        if (firstSync || markedSeenProductRef.current !== product.id) {
          markedSeenProductRef.current = product.id
        }

        setProduct((prev: any) => ({
          ...prev,
          comments: data.comments || prev.comments,
        }))
        firstSync = false
      } catch {
        // Silent polling failure keeps chat responsive.
      }
    }

    syncComments()
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      syncComments()
    }, 12000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [product.id, tab])

  useEffect(() => {
    if (tab !== 'comments') return

    const container = commentsScrollRef.current
    if (!container) return

    requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      })
    })
  }, [commentFeed.length, tab])

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
      resizeCommentInput(commentInputRef.current)
      commentInputRef.current.focus()
      commentInputRef.current.setSelectionRange(nextCaret, nextCaret)
    })
  }

  const submitComment = () => {
    if (savingComment || !newComment.trim()) return
    addComment()
  }

  const handleCommentKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter') return

    if (event.shiftKey) {
      return
    }

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
      requestAnimationFrame(() => resizeCommentInput(commentInputRef.current))
    } catch (error: any) {
      alert(error.message || 'Не удалось добавить комментарий')
    } finally {
      setSavingComment(false)
    }
  }

  const updateStage = async (stageId: string, overrideValues?: Record<string, any>) => {
    const vals = overrideValues ?? stageEditValues[stageId]
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
    return 'bg-muted text-muted-foreground'
  }

  // Right-click context menu handler
  const handleStageContextMenu = (e: React.MouseEvent, stage: any) => {
    if (!canEdit) return
    openStageMenu(e, { stageId: stage.id }, { width: 220, height: 320 })
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
      closeStageMenu()
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

  const resetNewStageDraft = () => {
    setShowAddStageForm(false)
    setNewStageName('')
    setNewStageDate(null)
    setNewStageAutoshift(true)
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
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось добавить этап')
      }

      setProduct((prev: any) => ({
        ...prev,
        stages: data.stages,
        finalDate: data.finalDate ?? prev.finalDate,
        progressPercent: data.progressPercent,
        riskScore: data.riskScore,
        status: data.status,
      }))
      resetNewStageDraft()
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
      closeStageMenu()
    } catch (error: any) {
      alert(error.message || 'Не удалось обновить автосдвиг этапа')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteStage = async (stageId: string) => {
    closeStageMenu()
    setDeleteStageError(null)
    setPendingDeleteStageId(stageId)
  }

  const confirmDeleteStage = async () => {
    if (!pendingDeleteStageId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/products/${product.id}/stages?stageId=${encodeURIComponent(pendingDeleteStageId)}`, {
        method: 'DELETE',
      })
      const responseText = await res.text()
      let data: { error?: string; details?: string; stages?: any[]; finalDate?: Date | string | null; progressPercent?: number; riskScore?: number; status?: string } | null = null

      try {
        data = responseText ? JSON.parse(responseText) : null
      } catch {
        data = null
      }

      if (!res.ok) {
        throw new Error(data?.details || data?.error || responseText || 'Не удалось удалить этап')
      }

      setProduct((prev: any) => ({
        ...prev,
        stages: data?.stages || prev.stages,
        finalDate: data?.finalDate ?? prev.finalDate,
        progressPercent: data?.progressPercent ?? prev.progressPercent,
        riskScore: data?.riskScore ?? prev.riskScore,
        status: data?.status ?? prev.status,
      }))
      setPendingDeleteStageId(null)
      closeStageMenu()
    } catch (error: any) {
      setPendingDeleteStageId(null)
      closeStageMenu()
      setDeleteStageError(error.message || 'Не удалось удалить этап')
    } finally {
      setSaving(false)
    }
  }

  const handleArchiveProduct = async () => {
    setConfirmArchiveProductOpen(true)
  }

  const confirmArchiveProduct = async () => {
    setDeletingProduct(true)
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive' }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось архивировать продукт')
      }

      setConfirmArchiveProductOpen(false)
      setProduct((prev: any) => ({ ...prev, ...data }))
      router.refresh()
    } catch (error: any) {
      alert(error.message || 'Не удалось архивировать продукт')
      setDeletingProduct(false)
    }
  }

  const confirmRestoreProduct = async () => {
    setLifecycleSaving(true)
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось восстановить продукт')
      }

      setConfirmRestoreProductOpen(false)
      setProduct((prev: any) => ({ ...prev, ...data }))
      router.refresh()
    } catch (error: any) {
      alert(error.message || 'Не удалось восстановить продукт')
    } finally {
      setLifecycleSaving(false)
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
              ownMessage ? 'bg-muted text-foreground' : 'bg-brand-50 text-brand-700 dark:text-blue-300'
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={backNavigation.href} className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> {backNavigation.label}
        </Link>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {canArchiveProduct && !product.isArchived && (
            <button
              onClick={handleArchiveProduct}
              disabled={deletingProduct}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10 disabled:opacity-60 sm:w-auto"
            >
              <Archive className="h-4 w-4" />
              {deletingProduct ? 'Архивация...' : 'Архивировать'}
            </button>
          )}
          {canArchiveProduct && product.isArchived && (
            <button
              onClick={() => setConfirmRestoreProductOpen(true)}
              disabled={lifecycleSaving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10 disabled:opacity-60 sm:w-auto"
            >
              <ArchiveRestore className="h-4 w-4" />
              Восстановить
            </button>
          )}
        </div>
      </div>

      {/* Header Card */}
      <div className="card">
        {(product.closedAt || product.isArchived) && (
          <div className="mb-4 rounded-[20px] border border-border/70 bg-muted/75 px-4 py-3 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-4">
              {product.closedAt && (
                <span>
                  Закрыт: <span className="font-medium text-foreground">{formatDate(product.closedAt)}</span>
                  {product.closedBy?.name ? (
                    <>
                      {' '}• <span className="font-medium text-foreground">{product.closedBy.name}</span>
                    </>
                  ) : null}
                </span>
              )}
              {product.isArchived && (
                <span>
                  В архиве: <span className="font-medium text-foreground">{formatDate(product.archivedAt)}</span>
                  {product.archivedBy?.name ? (
                    <>
                      {' '}• <span className="font-medium text-foreground">{product.archivedBy.name}</span>
                    </>
                  ) : null}
                </span>
              )}
            </div>
            {product.closureComment && (
              <p className="mt-2 text-muted-foreground">Комментарий при закрытии: <span className="text-foreground">{product.closureComment}</span></p>
            )}
            {product.archiveReason && (
              <p className="mt-1 text-muted-foreground">Причина архивации: <span className="text-foreground">{product.archiveReason}</span></p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <span className={cn('badge border', getPriorityColor(product.priority))}>{getPriorityLabel(product.priority)}</span>
              <span className={cn('badge', getStatusColor(product.status))}>{getStatusLabel(product.status)}</span>
              {product.country && <span className="badge bg-muted text-muted-foreground">{product.country}</span>}
            </div>
            <h1 className="mb-2 text-xl font-bold leading-tight text-foreground">{product.name}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>Ответственный: <span className="font-medium text-foreground">{product.responsible?.name || '—'}</span></span>
              <span>Финальная дата: <span className={cn('font-medium', product.finalDate && new Date(product.finalDate) < now ? 'text-red-600 dark:text-red-300' : 'text-foreground')}>{formatDate(product.finalDate)}</span></span>
              {product.competitorUrl && (
                <a href={product.competitorUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary transition-colors hover:text-primary/80">
                  <ExternalLink className="w-3.5 h-3.5" /> Конкурент
                </a>
              )}
            </div>
          </div>
          {/* Risk + Progress */}
          <div className="flex flex-shrink-0 items-end justify-between gap-4 rounded-[24px] bg-muted/45 px-4 py-3 text-left lg:block lg:min-w-[170px] lg:bg-transparent lg:px-0 lg:py-0 lg:text-right">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Прогресс</div>
              <div className="text-2xl font-bold text-foreground">{progress}%</div>
              <div className="text-xs text-muted-foreground">{completedStages}/{totalStages} этапов</div>
            </div>
            <div className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold',
              product.riskScore >= 70 ? 'bg-red-100 text-red-700 dark:text-red-300' :
              product.riskScore >= 40 ? 'bg-amber-100 text-amber-700 dark:text-amber-300' :
              'bg-muted text-muted-foreground'
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
          <aside className="border-b border-border/70 bg-muted/55 p-3 lg:border-b-0 lg:border-r">
            <div className="no-scrollbar flex gap-2 overflow-x-auto lg:block lg:space-y-1">
              {TABS.map((t) => {
                const Icon = t.icon
                const active = tab === t.id

                return (
                  <button
                    key={t.id}
                    onClick={() => updateActiveTab(t.id)}
                    className={cn(
                      'relative flex min-h-11 min-w-max flex-shrink-0 items-center gap-3 rounded-[18px] px-4 py-3 text-left text-sm font-medium transition-colors lg:w-full lg:min-w-0 lg:rounded-[20px]',
                      active ? 'text-primary-foreground' : 'text-muted-foreground hover:bg-card/80 hover:text-foreground'
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="product-tab-indicator"
                        className="absolute inset-0 rounded-[20px] bg-primary"
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

          <div className="min-w-0 p-4 sm:p-5">
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
                      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <button
                          onClick={() => {
                            if (showAddStageForm) {
                              resetNewStageDraft()
                              return
                            }
                            setShowAddStageForm(true)
                          }}
                          className="btn-primary w-full justify-center text-sm sm:w-auto"
                          disabled={saving}
                        >
                          <Plus className="w-4 h-4" />
                          Добавить этап
                        </button>
                      </div>
                    )}
                    {canEdit && showAddStageForm && (
                      <div className="mb-3 flex flex-col gap-3 rounded-[24px] bg-muted/75 p-3">
                        <input
                          type="text"
                          value={newStageName}
                          onChange={(e) => setNewStageName(e.target.value)}
                          className="input w-full text-sm"
                          placeholder="Название нового этапа"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddStage()
                            if (e.key === 'Escape') resetNewStageDraft()
                          }}
                        />
                        <DatePicker
                          value={newStageDate}
                          onChange={setNewStageDate}
                          inputClassName="h-11 w-full text-sm sm:w-56"
                          panelClassName="w-[min(22rem,calc(100vw-24px))]"
                          placeholder="Дата этапа"
                        />
                        <label className="flex min-h-11 items-center justify-between gap-3 rounded-[18px] border border-border/70 bg-card px-3 py-2 text-sm text-muted-foreground sm:h-11 sm:justify-start">
                          <span className="whitespace-nowrap">Автосдвиг</span>
                          <input
                            type="checkbox"
                            checked={newStageAutoshift}
                            onChange={(e) => setNewStageAutoshift(e.target.checked)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                          />
                        </label>
                        <button onClick={handleAddStage} className="btn-primary w-full justify-center text-sm sm:w-auto" disabled={!newStageName.trim() || saving}>
                          <Save className="w-4 h-4" />
                          Сохранить
                        </button>
                        <button
                          onClick={resetNewStageDraft}
                          className="btn-secondary w-full justify-center text-sm sm:w-auto"
                          disabled={saving}
                        >
                          Отмена
                        </button>
                      </div>
                    )}
                    {overlaps.length > 0 && (
                      <div className="mb-3 flex items-start gap-2 rounded-[24px] border border-amber-500/20 bg-amber-500/10 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500 dark:text-amber-300" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Обнаружены пересечения дат</p>
                          <ul className="mt-2 space-y-2">
                            {overlaps.map((o, i) => (
                              <li key={i} className="flex items-start justify-between gap-3 rounded-[16px] border border-amber-500/10 bg-card/70 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                                <span>{formatStageOverlap(o)}{o.dateLabel ? ` (${o.dateLabel})` : ''}</span>
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => handleAcceptOverlap(o.stageIds)}
                                    className="flex-shrink-0 rounded-[14px] px-2.5 py-1 font-medium text-amber-700 transition hover:bg-amber-500/10 dark:text-amber-300"
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
                            'flex flex-col gap-3 rounded-[24px] p-3 transition-all sm:flex-row sm:items-center',
                            hasOverlap ? 'bg-amber-500/10 ring-1 ring-amber-500/20' :
                            stage.isCompleted ? 'bg-emerald-500/10' : 'bg-muted/70 hover:bg-accent/70'
                          )}
                        >
                          <div className="flex w-full items-start gap-3 sm:w-auto sm:items-center">
                          {canEdit ? (
                            <button onClick={() => toggleStageComplete(stage)} className="flex-shrink-0">
                              {stage.isCompleted
                                ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                : <Circle className="h-5 w-5 text-muted-foreground/60 hover:text-muted-foreground" />
                              }
                            </button>
                          ) : (
                            <div className="flex-shrink-0">
                              {stage.isCompleted
                                ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                : <Circle className="h-5 w-5 text-muted-foreground/40" />
                              }
                            </div>
                          )}

                          <div className="w-6 flex-shrink-0 pt-0.5 text-center text-xs text-muted-foreground sm:pt-0">{idx + 1}</div>

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
                              <p className={cn('text-sm font-medium', stage.isCompleted ? 'line-through text-muted-foreground' : 'text-foreground')}>
                                {stage.stageName}
                                {stage.isCritical && <span className="ml-1.5 text-xs font-semibold text-red-500 dark:text-red-300">КРИТИЧНЫЙ</span>}
                                {stage.participatesInAutoshift === false && (
                                  <span className="ml-1.5 text-xs font-semibold text-muted-foreground">АВТОСДВИГ ВЫКЛ.</span>
                                )}
                                {hasOverlap && <span className="ml-1.5 text-xs font-semibold text-amber-600 dark:text-amber-300">⚠ ПЕРЕСЕЧЕНИЕ</span>}
                              </p>
                            )}
                            {stage.comment && !isEditing && renamingStageId !== stage.id && (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">{stage.comment}</p>
                            )}
                          </div>
                          </div>

                          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                          <div className="flex-shrink-0">
                            {isEditing ? (
                              <DatePicker
                                value={stageEditValues[stage.id]?.dateValue ?? (stage.dateValue ? new Date(stage.dateValue) : null)}
                                onChange={(nextDate) => setStageEditValues((prev) => ({
                                  ...prev,
                                  [stage.id]: { ...prev[stage.id], dateValue: nextDate }
                                }))}
                                onCommit={(nextDate) =>
                                  updateStage(stage.id, {
                                    ...(stageEditValues[stage.id] ?? {}),
                                    dateValue: nextDate,
                                  })
                                }
                                onCancel={() => setEditingStageId(null)}
                                inputClassName="h-10 w-full text-xs sm:w-48"
                                panelClassName="w-[min(22rem,calc(100vw-24px))]"
                              />
                            ) : (
                              <div className={cn('rounded-[16px] px-2.5 py-1.5 text-xs font-medium', cellStyle)}>
                                {stage.dateValue ? formatDate(stage.dateValue) : stage.dateRaw || '—'}
                              </div>
                            )}
                          </div>

                          {Boolean(stage.durationDays ?? stage.stageTemplate?.durationDays) && (
                            <div className="w-full flex-shrink-0 text-left text-xs text-muted-foreground sm:w-16 sm:text-center">
                              {formatDurationDays(stage.durationDays ?? stage.stageTemplate?.durationDays ?? null)}
                            </div>
                          )}

                          {canEdit && (
                            <div className="flex flex-shrink-0 items-center justify-end gap-1">
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
                                  className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {tab === 'comments' && (
                  <div>
                    <div className="rounded-[28px] bg-muted/70 p-4">
                      <div className="flex h-[min(76vh,760px)] min-h-[360px] flex-col overflow-hidden rounded-[24px] bg-card shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)] sm:min-h-[480px]">
                        <div className="border-b border-border/70 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-semibold text-foreground">Комментарии</h3>
                            <span className="text-xs font-medium text-muted-foreground">{product.comments.length}</span>
                          </div>
                        </div>

                        <div ref={commentsScrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                          {commentFeed.length === 0 ? (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.98, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                              className="flex h-full min-h-[280px] items-center justify-center rounded-[20px] border border-dashed border-border/70 bg-muted/60 text-center"
                            >
                              <div>
                                <MessageCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                                <p className="text-sm font-medium text-muted-foreground">Комментариев пока нет</p>
                                <p className="mt-1 text-xs text-muted-foreground">Начни обсуждение прямо отсюда.</p>
                              </div>
                            </motion.div>
                          ) : (
                            <div className="flex min-h-full flex-col justify-end gap-4">
                              <AnimatePresence initial={false}>
                                {commentFeed.map((comment: any) => {
                                const ownMessage = comment.author?.id === currentUser.id
                                const authorName = comment.author?.lastName
                                  ? `${comment.author.name} ${comment.author.lastName}`
                                  : comment.author?.name

                                return (
                                  <motion.div
                                    key={comment.id}
                                    layout
                                    initial={{ opacity: 0, y: 18, scale: 0.985 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -8, scale: 0.985 }}
                                    transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                                    className={cn('flex gap-3', ownMessage ? 'justify-end' : 'justify-start')}
                                  >
                                    {!ownMessage && <UserAvatar user={comment.author} size="sm" className="mt-7" />}
                                    <div className="max-w-[84%] space-y-1 sm:max-w-[72%] lg:max-w-[62%]">
                                      <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', ownMessage && 'justify-end')}>
                                        <span className="font-semibold text-foreground">{authorName}</span>
                                        <span>{formatCommentTimestamp(comment.createdAt)}</span>
                                      </div>
                                      <div
                                        className={cn(
                                          'px-0.5 py-0.5 text-sm leading-6',
                                          ownMessage ? 'text-foreground' : 'text-muted-foreground'
                                        )}
                                      >
                                        <div className={cn('flex flex-wrap items-center gap-1.5', ownMessage && 'justify-end')}>
                                          {renderCommentContent(comment.content || comment.displayContent || '', ownMessage)}
                                        </div>
                                      </div>
                                    </div>
                                    {ownMessage && <UserAvatar user={comment.author} size="sm" className="mt-7" />}
                                  </motion.div>
                                )
                                })}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>

                        {canComment && (
                          <div className="border-t border-border/70 px-4 py-4">
                            <div className="relative">
                              <textarea
                                ref={commentInputRef}
                                rows={1}
                                value={newComment}
                                onChange={(e) => {
                                  handleCommentChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
                                  resizeCommentInput(e.currentTarget)
                                }}
                                onClick={(e) => syncCommentMentionState(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
                                onKeyUp={(e) => syncCommentMentionState(e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length)}
                                onKeyDown={handleCommentKeyDown}
                                placeholder="Напиши комментарий или отметь коллегу через @..."
                                className="input min-h-[52px] resize-none pr-16 py-3 leading-6"
                              />
                              {mentionState && activeMentionSuggestions.length > 0 && (
                                <div className="absolute bottom-[calc(100%+10px)] left-0 z-20 w-full max-w-[min(100%,22rem)] overflow-hidden rounded-[22px] border border-border/80 bg-popover p-2 shadow-modal">
                                  <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                    Выбери пользователя
                                  </div>
                                  <div className="space-y-1">
                                    {activeMentionSuggestions.map((user) => (
                                      <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => insertMention(user)}
                                        className="flex w-full items-center gap-2 rounded-[16px] px-3 py-2.5 text-left transition-colors hover:bg-accent"
                                      >
                                        <UserAvatar user={user} size="sm" />
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-foreground">{user.displayName}</p>
                                          <p className="text-xs text-muted-foreground">@{user.name}</p>
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <motion.button
                                type="button"
                                onClick={submitComment}
                                disabled={!newComment.trim() || savingComment}
                                whileTap={!savingComment && newComment.trim() ? { scale: 0.94 } : undefined}
                                animate={
                                  savingComment
                                    ? { scale: [1, 0.94, 1], boxShadow: ['0 0 0 rgba(30,41,59,0)', '0 0 0 8px rgba(15,23,42,0.08)', '0 0 0 rgba(30,41,59,0)'] }
                                    : { scale: 1, boxShadow: '0 0 0 rgba(30,41,59,0)' }
                                }
                                transition={
                                  savingComment
                                    ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }
                                    : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                                }
                                className="absolute bottom-2 right-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-950 text-white transition hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                <motion.span
                                  animate={savingComment ? { x: [0, 1.5, 0], y: [0, -1, 0] } : { x: 0, y: 0 }}
                                  transition={savingComment ? { duration: 0.75, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.18 }}
                                >
                                  <SendHorizontal className="h-4 w-4" />
                                </motion.span>
                              </motion.button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'history' && (
                  <div className="rounded-[28px] bg-muted/70 p-4">
                    <div className="flex h-[min(76vh,760px)] min-h-[360px] flex-col overflow-hidden rounded-[24px] bg-card shadow-[inset_0_0_0_1px_hsl(var(--border)/0.7)] sm:min-h-[480px]">
                      <div className="border-b border-border/70 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold text-foreground">История</h3>
                          <span className="text-xs font-medium text-muted-foreground">{product.changeHistory.length}</span>
                        </div>
                      </div>

                      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                        {product.changeHistory.length === 0 ? (
                          <p className="py-8 text-center text-sm text-muted-foreground">История изменений пуста</p>
                        ) : (
                          <div className="space-y-2">
                            {product.changeHistory.map((h: any) => (
                              <div key={h.id} className="flex items-start gap-3 border-b border-border/60 py-2 last:border-0">
                                <div className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-400" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">{h.changedBy.name}</span>
                                    <span>изменил(а)</span>
                                    <span className="font-medium text-foreground">{h.field}</span>
                                    <span className="sm:ml-auto">{formatDate(h.createdAt)}</span>
                                  </div>
                                  {h.oldValue && h.newValue && (
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                      <span className="line-through">{h.oldValue.slice(0, 30)}</span> → <span className="text-foreground">{h.newValue.slice(0, 30)}</span>
                                    </div>
                                  )}
                                  {h.reason && <div className="mt-0.5 text-xs italic text-muted-foreground">{h.reason}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'automations' && (
                  <div className="space-y-3">
                    <p className="mb-4 text-sm text-muted-foreground">Активные автоматизации для этого продукта:</p>
                    {product.automations.length === 0 ? (
                      <div className="py-8 text-center">
                        <Zap className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">Нет активных автоматизаций</p>
                        <Link href="/automations" className="mt-1 inline-block text-xs text-primary hover:text-primary/80">
                          Настроить автоматизации →
                        </Link>
                      </div>
                    ) : (
                      product.automations.map((a: any) => (
                        <div key={a.id} className="rounded-[22px] border border-amber-500/20 bg-amber-500/10 p-4">
                          <div className="mb-1 flex items-center gap-2">
                            <Zap className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                            <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">{a.name}</span>
                          </div>
                          <p className="text-xs text-amber-700 dark:text-amber-300">{a.description}</p>
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
      {stageMenu && (() => {
        const stage = product.stages.find((s: any) => s.id === stageMenu.stageId)
        if (!stage) return null
        const idx = product.stages.findIndex((s: any) => s.id === stageMenu.stageId)
        const isFirst = idx === 0
        const isLast = idx === product.stages.length - 1
        return (
          <FloatingContextMenu
            open
            x={stageMenu.x}
            y={stageMenu.y}
            menuRef={menuRef}
            className="fixed z-[130] min-w-[220px] rounded-lg border border-border/80 bg-popover py-1 text-popover-foreground shadow-modal"
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent"
              onClick={() => {
                setEditingStageId(stage.id)
                setStageEditValues((prev) => ({
                  ...prev,
                  [stage.id]: { ...prev[stage.id], dateValue: stage.dateValue ? new Date(stage.dateValue) : null },
                }))
                closeStageMenu()
              }}
            >
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
              Изменить дату
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent"
              onClick={() => {
                setRenamingStageId(stage.id)
                setRenameValue(stage.stageName)
                closeStageMenu()
              }}
            >
              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
              Переименовать
            </button>
            <button
              className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', isFirst ? 'cursor-not-allowed text-muted-foreground/50' : 'text-popover-foreground hover:bg-accent')}
              onClick={() => !isFirst && handleMoveStage(stage.id, 'up')}
              disabled={isFirst}
            >
              <ChevronUp className="w-3.5 h-3.5" />
              Переместить вверх
            </button>
            <button
              className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', isLast ? 'cursor-not-allowed text-muted-foreground/50' : 'text-popover-foreground hover:bg-accent')}
              onClick={() => !isLast && handleMoveStage(stage.id, 'down')}
              disabled={isLast}
            >
              <ChevronDown className="w-3.5 h-3.5" />
              Переместить вниз
            </button>
            <div className="my-1 border-t border-border/70" />
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10"
              onClick={() => {
                setAutomationModal({ stageId: stage.id, stageOrder: stage.stageOrder, stageName: stage.stageName })
                setAutomationName(`При изменении "${stage.stageName}"`)
                closeStageMenu()
              }}
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Настроить автоматизацию
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent"
              onClick={() => handleToggleStageAutoshift(stage, stage.participatesInAutoshift === false)}
            >
              <Zap className={cn('w-3.5 h-3.5', stage.participatesInAutoshift === false ? 'text-muted-foreground' : 'text-emerald-500 dark:text-emerald-300')} />
              {stage.participatesInAutoshift === false ? 'Включить автосдвиг' : 'Отключить автосдвиг'}
            </button>
            <div className="my-1 border-t border-border/70" />
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
              onClick={() => handleDeleteStage(stage.id)}
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              Удалить этап
            </button>
          </FloatingContextMenu>
        )
      })()}

      {/* Automation Modal */}
      <AnimatePresence>
      {automationModal && typeof document !== 'undefined' && createPortal(
        <motion.div
          className="modal-backdrop flex items-end justify-center px-4 pb-4 pt-8 sm:items-center"
          onClick={() => setAutomationModal(null)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="max-h-[min(88vh,42rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-[28px] bg-card p-4 shadow-modal sm:p-6"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500 dark:text-amber-300" />
                <h3 className="text-lg font-semibold text-foreground">Автоматизация этапа</h3>
              </div>
              <button onClick={() => setAutomationModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Настройте действие при изменении даты этапа <span className="font-medium text-foreground">{automationModal.stageName}</span>
            </p>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Название</label>
              <input
                type="text"
                value={automationName}
                onChange={(e) => setAutomationName(e.target.value)}
                className="input w-full"
                placeholder="Название автоматизации"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Действие</label>
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
              <label className="mb-1 block text-sm font-medium text-foreground">Описание (опционально)</label>
              <textarea
                value={automationDesc}
                onChange={(e) => setAutomationDesc(e.target.value)}
                className="input w-full resize-none h-16"
                placeholder="Опишите логику автоматизации..."
              />
            </div>

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setAutomationModal(null)}
                className="btn-secondary w-full justify-center sm:w-auto"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateAutomation}
                className="btn-primary w-full justify-center text-sm sm:w-auto"
                disabled={!automationName.trim() || savingAutomation}
              >
                <Zap className="w-4 h-4" />
                {savingAutomation ? 'Сохраняем...' : 'Создать автоматизацию'}
              </button>
            </div>
          </motion.div>
        </motion.div>,
        document.body
      )}
      </AnimatePresence>

      <ConfirmDialog
        open={Boolean(pendingDeleteStageId)}
        title="Удалить этап?"
        description="Этап будет удалён только из этого продукта. Это действие нельзя отменить."
        confirmLabel="Удалить этап"
        loading={saving && Boolean(pendingDeleteStageId)}
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

      <ConfirmDialog
        open={confirmArchiveProductOpen}
        title="Архивировать продукт?"
        description={`Продукт «${product.name}» исчезнет из активных списков, но вся история, комментарии и этапы сохранятся.`}
        confirmLabel="Архивировать"
        loading={deletingProduct}
        onCancel={() => setConfirmArchiveProductOpen(false)}
        onConfirm={confirmArchiveProduct}
      />

      <ConfirmDialog
        open={confirmRestoreProductOpen}
        title="Восстановить продукт?"
        description={`Продукт «${product.name}» снова появится в активных списках.`}
        confirmLabel="Восстановить"
        loading={lifecycleSaving}
        confirmTone="primary"
        onCancel={() => setConfirmRestoreProductOpen(false)}
        onConfirm={confirmRestoreProduct}
      />

    </div>
  )
}
  const resizeCommentInput = (element: HTMLTextAreaElement | null) => {
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 144)}px`
  }

'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { ArrowLeft, CalendarDays, CheckCircle2, Circle, AlertTriangle, MessageCircle, Clock, History, Zap, ExternalLink, Edit2, Save, Pencil, ChevronUp, ChevronDown, X, Plus, Trash2, SendHorizontal, Archive, ArchiveRestore, Bell, Settings } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FloatingContextMenu } from '@/components/ui/FloatingContextMenu'
import { ProductRenameDialog } from '@/components/products/ProductRenameDialog'
import { serializeDateOnly } from '@/lib/date-only'
import {
  cn,
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
  getPriorityLabel,
  formatDate,
  formatDurationDays,
} from '@/lib/utils'
import { DatePicker } from '@/components/ui/DatePicker'
import { resolveBackNavigation } from '@/lib/navigation'
import { UserAvatar } from '@/components/users/UserAvatar'
import { encodeCommentMentions, getCommentSegments } from '@/lib/comment-mentions'
import { useContextMenu } from '@/hooks/useContextMenu'
import { EDITABLE_PRODUCT_STATUSES, getEditableProductStatusOption } from '@/lib/product-status'
import { EDITABLE_PRODUCT_PRIORITIES, getEditableProductPriorityOption } from '@/lib/product-priority'
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
  productTemplates?: any[]
  currentUser: { id: string; name: string; role: string }
}

const TABS = [
  { id: 'stages', label: 'Этапы', icon: Clock },
  { id: 'comments', label: 'Комментарии', icon: MessageCircle },
  { id: 'history', label: 'История', icon: History },
  { id: 'automations', label: 'Автоматизации', icon: Zap },
]

const TELEGRAM_TEMPLATES = [
  { id: 'stage_completed_simple', label: 'Завершение этапа' },
  { id: 'substage_completed_simple', label: 'Завершение подэтапа' },
  { id: 'custom', label: 'Свой текст' },
]

const STAGE_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Не начат',
  IN_PROGRESS: 'Начат',
  COMPLETED: 'Завершён',
  SKIPPED: 'Пропущен',
  BLOCKED: 'Заблокирован',
}

function getStageStatusStyle(status: string, isCompleted?: boolean) {
  if (isCompleted || status === 'COMPLETED') return 'status-chip-success'
  if (status === 'IN_PROGRESS') return 'status-chip-info'
  if (status === 'BLOCKED') return 'status-chip-danger'
  return 'status-chip-neutral'
}

export function ProductCardClient({ product: initial, users, productTemplates = [], currentUser }: ProductCardClientProps) {
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
  const [newStageDurationDays, setNewStageDurationDays] = useState(1)
  const [newStageAutoshift, setNewStageAutoshift] = useState(true)
  const [telegramRecipients, setTelegramRecipients] = useState<any[]>([])
  const [telegramRecipientsLoading, setTelegramRecipientsLoading] = useState(false)
  const [telegramDrafts, setTelegramDrafts] = useState<Record<string, any>>({})
  const [notificationSavingKey, setNotificationSavingKey] = useState<string | null>(null)
  const [notificationTestingKey, setNotificationTestingKey] = useState<string | null>(null)
  const [telegramSettingsModal, setTelegramSettingsModal] = useState<{
    stageId: string
    subStageId: string | null
  } | null>(null)
  const [templateApplyId, setTemplateApplyId] = useState(initial.productTemplateId || '')
  const [templateResetNotificationOverrides, setTemplateResetNotificationOverrides] = useState(false)
  const [templateApplying, setTemplateApplying] = useState(false)
  const [subStageDrafts, setSubStageDrafts] = useState<Record<string, string>>({})
  const [subStageSavingKey, setSubStageSavingKey] = useState<string | null>(null)
  const [newRecipientDraft, setNewRecipientDraft] = useState({
    type: 'user',
    name: '',
    telegramId: '',
    telegramUsername: '',
    chatId: '',
  })

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
  const [renameProductOpen, setRenameProductOpen] = useState(false)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)
  const commentsScrollRef = useRef<HTMLDivElement>(null)
  const markedSeenProductRef = useRef<string | null>(null)
  const priorityMenuRef = useRef<HTMLDivElement>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false)
  const [prioritySaving, setPrioritySaving] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
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
  const canArchiveProduct = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER', 'EMPLOYEE'].includes(currentUser?.role)
  const currentPriorityOption = getEditableProductPriorityOption(product.priority)
  const currentStatusOption = getEditableProductStatusOption(product.status)
  const currentProductTemplate = productTemplates.find((template) => template.id === product.productTemplateId) || null
  const hasTelegramNotificationOverrides = (product.stages || []).some((stage: any) => {
    const stageHasOverride = (stage.telegramNotificationSettings || []).some((setting: any) => setting.isOverride)
    const subStageHasOverride = (stage.subStages || []).some((subStage: any) =>
      (subStage.telegramNotificationSettings || []).some((setting: any) => setting.isOverride)
    )

    return stageHasOverride || subStageHasOverride
  })

  useEffect(() => {
    let cancelled = false
    setTelegramRecipientsLoading(true)
    fetch('/api/telegram/recipients')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Не удалось загрузить Telegram-получателей')))
      .then((data) => {
        if (!cancelled) setTelegramRecipients(Array.isArray(data?.recipients) ? data.recipients : [])
      })
      .catch(() => {
        if (!cancelled) setTelegramRecipients([])
      })
      .finally(() => {
        if (!cancelled) setTelegramRecipientsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!priorityMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (priorityMenuRef.current?.contains(target)) return
      setPriorityMenuOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPriorityMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [priorityMenuOpen])

  useEffect(() => {
    if (!statusMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (statusMenuRef.current?.contains(target)) return
      setStatusMenuOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStatusMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [statusMenuOpen])

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

  const confirmRenameProduct = async (nextName: string) => {
    if (!canEdit) return

    setLifecycleSaving(true)
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName.trim() }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось переименовать продукт')
      }

      setProduct((prev: any) => ({ ...prev, name: data.name ?? nextName.trim() }))
      setRenameProductOpen(false)
      router.refresh()
    } catch (error: any) {
      alert(error.message || 'Не удалось переименовать продукт')
    } finally {
      setLifecycleSaving(false)
    }
  }

  const changeProductStatus = async (nextStatus: string) => {
    if (!canEdit || product.status === nextStatus) {
      setStatusMenuOpen(false)
      return
    }

    const previousProduct = product
    setStatusSaving(true)
    setStatusMenuOpen(false)
    setProduct((prev: any) => ({ ...prev, status: nextStatus }))

    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось изменить статус продукта')
      }

      setProduct((prev: any) => ({ ...prev, ...data, status: data?.status ?? nextStatus }))
      router.refresh()
    } catch (error: any) {
      setProduct(previousProduct)
      alert(error.message || 'Не удалось изменить статус продукта')
    } finally {
      setStatusSaving(false)
    }
  }

  const changeProductPriority = async (nextPriority: string) => {
    if (!canEdit || product.priority === nextPriority) {
      setPriorityMenuOpen(false)
      return
    }

    const previousProduct = product
    setPrioritySaving(true)
    setPriorityMenuOpen(false)
    setProduct((prev: any) => ({ ...prev, priority: nextPriority }))

    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: nextPriority }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось изменить приоритет продукта')
      }

      setProduct((prev: any) => ({ ...prev, ...data, priority: data?.priority ?? nextPriority }))
      router.refresh()
    } catch (error: any) {
      setProduct(previousProduct)
      alert(error.message || 'Не удалось изменить приоритет продукта')
    } finally {
      setPrioritySaving(false)
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
        body: JSON.stringify({
          stageId,
          updates: {
            ...vals,
            ...(Object.prototype.hasOwnProperty.call(vals, 'dateValue')
              ? { dateValue: serializeDateOnly(vals.dateValue ?? null) }
              : {}),
          },
          applyAutomations: true,
        }),
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

  const getStageDurationValue = (stage: any) => {
    const rawDuration = stage.durationDays ?? stage.stageTemplate?.durationDays ?? 1
    const parsedDuration = Number(rawDuration)

    return Number.isFinite(parsedDuration) && parsedDuration > 0 ? Math.floor(parsedDuration) : 1
  }

  const beginStageEdit = (stage: any) => {
    setEditingStageId(stage.id)
    setStageEditValues((prev) => ({
      ...prev,
      [stage.id]: {
        ...prev[stage.id],
        dateValue: stage.dateValue ? new Date(stage.dateValue) : null,
        durationDays: getStageDurationValue(stage),
      },
    }))
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
    setNewStageDurationDays(1)
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
          dateValue: serializeDateOnly(newStageDate),
          durationDays: newStageDurationDays,
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

  const mergeNotificationSetting = (items: any[] | undefined, nextSetting: any) => {
    const existingItems = Array.isArray(items) ? items : []
    return [
      nextSetting,
      ...existingItems.filter((item) => item.id !== nextSetting.id && item.eventType !== nextSetting.eventType),
    ]
  }

  const updateStageSubStages = (stageId: string, subStages: any[]) => {
    setProduct((prev: any) => ({
      ...prev,
      stages: prev.stages.map((stage: any) => (
        stage.id === stageId ? { ...stage, subStages } : stage
      )),
    }))
  }

  const mergeStagePatch = (stageId: string, patch: Record<string, any>) => {
    setProduct((prev: any) => ({
      ...prev,
      stages: prev.stages.map((stage: any) => (
        stage.id === stageId
          ? {
              ...stage,
              ...patch,
              subStages: patch.subStages || stage.subStages,
            }
          : stage
      )),
    }))
  }

  const getNotificationKey = (stageId: string, subStageId?: string | null) =>
    subStageId ? `substage:${subStageId}` : `stage:${stageId}`

  const getNotificationSetting = (stage: any, subStage?: any) => {
    const eventType = subStage ? 'substage_completed' : 'stage_completed'
    const settings = subStage?.telegramNotificationSettings || stage.telegramNotificationSettings || []
    return settings.find((setting: any) => setting.eventType === eventType) || null
  }

  const getTelegramTemplatesForTarget = (subStage?: any) => {
    const fallbackTemplate = subStage ? 'substage_completed_simple' : 'stage_completed_simple'
    return TELEGRAM_TEMPLATES.filter((template) => template.id === fallbackTemplate || template.id === 'custom')
  }

  const getNotificationDraft = (stage: any, subStage?: any) => {
    const eventType = subStage ? 'substage_completed' : 'stage_completed'
    const key = getNotificationKey(stage.id, subStage?.id)
    const setting = getNotificationSetting(stage, subStage)
    return {
      isEnabled: setting ? setting.isEnabled : true,
      eventType,
      recipientType: setting?.recipientType || 'user',
      recipientId: setting?.recipientId || '',
      messageTemplate: setting?.messageTemplate || (subStage ? 'substage_completed_simple' : 'stage_completed_simple'),
      customMessage: setting?.customMessage || '',
      ...telegramDrafts[key],
    }
  }

  const getNotificationStatusMeta = (stage: any, subStage?: any) => {
    const setting = getNotificationSetting(stage, subStage)
    if (setting?.lastError) {
      return { label: 'Ошибка', chipClass: 'status-chip-danger', iconClass: 'text-red-500' }
    }
    if (setting?.sentAt) {
      return { label: 'Отправлено', chipClass: 'status-chip-success', iconClass: 'text-emerald-500' }
    }
    if (setting?.isEnabled) {
      return { label: 'Включено', chipClass: 'status-chip-info', iconClass: 'text-sky-500' }
    }
    return { label: 'Не настроено', chipClass: 'status-chip-neutral', iconClass: 'text-muted-foreground' }
  }

  const getTelegramErrorText = (error?: string | null) => {
    if (!error) return null
    if (/chat not found/i.test(error)) {
      return 'Telegram не нашёл чат. Откройте бота, нажмите Start и повторите тест.'
    }
    if (/bot was blocked/i.test(error)) {
      return 'Бот заблокирован у получателя. Разблокируйте бота и повторите тест.'
    }
    if (/TELEGRAM_BOT_TOKEN/i.test(error)) {
      return 'TELEGRAM_BOT_TOKEN не задан для сервера.'
    }
    return error
  }

  const getStageNotificationSummary = (stage: any) => {
    const targets = [
      { subStage: null },
      ...(Array.isArray(stage.subStages) ? stage.subStages : []).map((subStage: any) => ({ subStage })),
    ]
    const settings = targets.map((target) => getNotificationSetting(stage, target.subStage))
    return {
      total: targets.length,
      enabled: settings.filter((setting) => setting?.isEnabled).length,
      errors: settings.filter((setting) => setting?.lastError).length,
      sent: settings.filter((setting) => setting?.sentAt).length,
    }
  }

  const getTelegramMessagePreview = (stage: any, subStage?: any) => {
    const draft = getNotificationDraft(stage, subStage)
    const defaultMessage = subStage
      ? 'Подэтап закрыт\n\nПроект: {product_name}\nЭтап: {stage_name}\nПодэтап: {substage_name}\nОтветственный: {responsible_user}\nДата закрытия: {end_date}'
      : 'Этап завершён\n\nПроект: {product_name}\nЭтап: {stage_name}\nВыполнено подэтапов: {completed_substages} / {total_substages}\nДата завершения: {end_date}'
    const rawMessage = draft.messageTemplate === 'custom'
      ? draft.customMessage.trim() || 'Ваш текст уведомления появится здесь'
      : defaultMessage
    const responsibleName = product.responsible
      ? [product.responsible.name, product.responsible.lastName].filter(Boolean).join(' ')
      : 'не указано'

    return rawMessage
      .replaceAll('{product_name}', product.name || 'не указано')
      .replaceAll('{stage_name}', stage.stageName || 'не указано')
      .replaceAll('{substage_name}', subStage?.name || 'не указано')
      .replaceAll('{responsible_user}', responsibleName || 'не указано')
      .replaceAll('{start_date}', formatDate(subStage?.startDate || stage.startDate || stage.dateValue) || 'не указано')
      .replaceAll('{end_date}', formatDate(subStage?.endDate || stage.endDate || stage.dateEnd) || 'не указано')
      .replaceAll('{status}', STAGE_STATUS_LABELS[subStage?.status || stage.status] || subStage?.status || stage.status || 'не указано')
      .replaceAll('{description}', subStage?.description || stage.description || stage.comment || 'не указано')
      .replaceAll('{completed_substages}', String((stage.subStages || []).filter((item: any) => item.status === 'COMPLETED').length))
      .replaceAll('{total_substages}', String((stage.subStages || []).length))
  }

  const openTelegramSettingsModal = (stage: any, subStage?: any) => {
    setTelegramSettingsModal({
      stageId: stage.id,
      subStageId: subStage?.id || null,
    })
  }

  const setTelegramSettingsTarget = (subStageId: string | null) => {
    setTelegramSettingsModal((prev) => prev ? { ...prev, subStageId } : prev)
  }

  const setTelegramDraftValue = (stageId: string, subStageId: string | null, patch: Record<string, any>) => {
    const key = getNotificationKey(stageId, subStageId)
    setTelegramDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        ...patch,
      },
    }))
  }

  const handleCreateTelegramRecipient = async () => {
    const name = newRecipientDraft.name.trim()
    const telegramId = newRecipientDraft.telegramId.trim()
    const chatId = newRecipientDraft.chatId.trim()
    if (!name) {
      alert('Укажите имя Telegram-получателя')
      return
    }
    if (newRecipientDraft.type === 'chat' && !chatId && !telegramId) {
      alert('Для Telegram-чата укажите chat_id')
      return
    }
    if (newRecipientDraft.type === 'user' && !telegramId && !chatId) {
      alert('Для Telegram-пользователя укажите Telegram ID')
      return
    }

    try {
      const res = await fetch('/api/telegram/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecipientDraft),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось добавить Telegram-получателя')
      }

      setTelegramRecipients((prev) => [...prev, data.recipient].sort((a, b) => a.name.localeCompare(b.name, 'ru')))
      if (telegramSettingsModal) {
        setTelegramDraftValue(telegramSettingsModal.stageId, telegramSettingsModal.subStageId, {
          recipientType: data.recipient.type,
          recipientId: data.recipient.id,
        })
      }
      setNewRecipientDraft({
        type: 'user',
        name: '',
        telegramId: '',
        telegramUsername: '',
        chatId: '',
      })
    } catch (error: any) {
      alert(error.message || 'Не удалось добавить Telegram-получателя')
    }
  }

  const handleSaveTelegramNotification = async (stage: any, subStage?: any) => {
    const key = getNotificationKey(stage.id, subStage?.id)
    const setting = getNotificationSetting(stage, subStage)
    const draft = getNotificationDraft(stage, subStage)
    const currentTelegramSettingsModal = telegramSettingsModal
    const templateOptions = getTelegramTemplatesForTarget(subStage)
    const messageTemplate = templateOptions.some((template) => template.id === draft.messageTemplate)
      ? draft.messageTemplate
      : templateOptions[0]?.id || 'custom'
    const nextIsEnabled = Boolean(draft.isEnabled)

    if (nextIsEnabled && !draft.recipientId) {
      alert('Выберите Telegram-получателя перед сохранением')
      return
    }

    setNotificationSavingKey(key)
    try {
      const res = await fetch('/api/telegram/notification-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: setting?.id,
          productId: product.id,
          stageId: stage.id,
          subStageId: subStage?.id || null,
          eventType: draft.eventType,
          recipientType: draft.recipientType,
          recipientId: draft.recipientId || null,
          messageTemplate,
          customMessage: draft.customMessage,
          isEnabled: nextIsEnabled,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось сохранить Telegram-уведомление')
      }

      setProduct((prev: any) => ({
        ...prev,
        stages: prev.stages.map((item: any) => {
          if (item.id !== stage.id) return item
          if (!subStage) {
            return {
              ...item,
              telegramNotificationSettings: mergeNotificationSetting(item.telegramNotificationSettings, data.setting),
            }
          }

          return {
            ...item,
            subStages: (item.subStages || []).map((candidate: any) => (
              candidate.id === subStage.id
                ? {
                    ...candidate,
                    telegramNotificationSettings: mergeNotificationSetting(candidate.telegramNotificationSettings, data.setting),
                  }
                : candidate
            )),
          }
        }),
      }))
      setTelegramDrafts((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      if (
        currentTelegramSettingsModal &&
        currentTelegramSettingsModal.stageId === stage.id &&
        (currentTelegramSettingsModal.subStageId || null) === (subStage?.id || null)
      ) {
        setTelegramSettingsModal(null)
      }
    } catch (error: any) {
      alert(error.message || 'Не удалось сохранить Telegram-уведомление')
    } finally {
      setNotificationSavingKey(null)
    }
  }

  const handleSendTelegramTest = async (stage: any, subStage?: any) => {
    const key = getNotificationKey(stage.id, subStage?.id)
    const setting = getNotificationSetting(stage, subStage)
    const draft = getNotificationDraft(stage, subStage)
    const preview = getTelegramMessagePreview(stage, subStage)

    if (!draft.recipientId) {
      alert('Выберите Telegram-получателя для теста')
      return
    }

    setNotificationTestingKey(key)
    try {
      const res = await fetch('/api/telegram/test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: draft.recipientId,
          settingId: setting?.id || null,
          message: preview,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось отправить тестовое сообщение')
      }

      if (data?.setting) {
        setProduct((prev: any) => ({
          ...prev,
          stages: prev.stages.map((item: any) => {
            if (item.id !== stage.id) return item
            if (!subStage) {
              return {
                ...item,
                telegramNotificationSettings: mergeNotificationSetting(item.telegramNotificationSettings, data.setting),
              }
            }

            return {
              ...item,
              subStages: (item.subStages || []).map((candidate: any) => (
                candidate.id === subStage.id
                  ? {
                      ...candidate,
                      telegramNotificationSettings: mergeNotificationSetting(candidate.telegramNotificationSettings, data.setting),
                    }
                  : candidate
              )),
            }
          }),
        }))
      }

      alert('Тестовое сообщение отправлено в Telegram')
    } catch (error: any) {
      alert(error.message || 'Не удалось отправить тестовое сообщение')
    } finally {
      setNotificationTestingKey(null)
    }
  }

  const handleApplyProductTemplate = async () => {
    if (!templateApplyId) {
      alert('Выберите шаблон')
      return
    }

    setTemplateApplying(true)
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(product.id)}/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTemplateId: templateApplyId,
          resetNotificationOverrides: templateResetNotificationOverrides,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось применить шаблон')
      }

      setProduct((prev: any) => ({
        ...prev,
        ...(data.product || {}),
        stages: Array.isArray(data.stages) ? data.stages : prev.stages,
      }))
      setTemplateResetNotificationOverrides(false)
      router.refresh()
    } catch (error: any) {
      alert(error.message || 'Не удалось применить шаблон')
    } finally {
      setTemplateApplying(false)
    }
  }

  const handleAddSubStage = async (stage: any) => {
    const key = `add:${stage.id}`
    const name = (subStageDrafts[key] || '').trim()
    if (!name) return
    setSubStageSavingKey(key)
    try {
      const res = await fetch('/api/substages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: stage.id, name }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось добавить подэтап')
      }

      updateStageSubStages(stage.id, data.subStages || [])
      setSubStageDrafts((prev) => ({ ...prev, [key]: '' }))
    } catch (error: any) {
      alert(error.message || 'Не удалось добавить подэтап')
    } finally {
      setSubStageSavingKey(null)
    }
  }

  const handleToggleSubStageComplete = async (stage: any, subStage: any) => {
    const key = `complete:${subStage.id}`
    const nextCompleted = subStage.status !== 'COMPLETED'
    setSubStageSavingKey(key)
    try {
      const res = await fetch('/api/substages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subStageId: subStage.id,
          updates: {
            status: nextCompleted ? 'COMPLETED' : 'IN_PROGRESS',
            ...(nextCompleted ? { endDate: new Date().toISOString() } : { endDate: null }),
          },
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось обновить подэтап')
      }

      if (data.stage) {
        mergeStagePatch(stage.id, data.stage)
      } else {
        updateStageSubStages(stage.id, data.subStages || [])
      }
    } catch (error: any) {
      alert(error.message || 'Не удалось обновить подэтап')
    } finally {
      setSubStageSavingKey(null)
    }
  }

  const handleDeleteSubStage = async (stage: any, subStage: any) => {
    const key = `delete:${subStage.id}`
    setSubStageSavingKey(key)
    try {
      const res = await fetch(`/api/substages?subStageId=${encodeURIComponent(subStage.id)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось удалить подэтап')
      }

      updateStageSubStages(stage.id, data.subStages || [])
    } catch (error: any) {
      alert(error.message || 'Не удалось удалить подэтап')
    } finally {
      setSubStageSavingKey(null)
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

  const renderTelegramRecipientManager = () => (
    <details className="group rounded-[20px] border border-border/70 bg-card/80">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <Bell className="h-4 w-4 flex-shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold text-foreground">Получатели</span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {telegramRecipientsLoading ? 'Загрузка...' : `${telegramRecipients.length} шт.`}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="border-t border-border/70 px-4 pb-4 pt-3">
        {telegramRecipients.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {telegramRecipients.slice(0, 6).map((recipient) => (
              <span key={recipient.id} className="badge status-chip-neutral max-w-full px-2 py-1 text-xs">
                {recipient.name}
              </span>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                Тип
                <select
                  value={newRecipientDraft.type}
                  onChange={(e) => setNewRecipientDraft((prev) => ({ ...prev, type: e.target.value }))}
                  className="input h-10 w-full py-1 text-sm"
                >
                  <option value="user">Личный Telegram</option>
                  <option value="chat">Групповой чат</option>
                </select>
              </label>

              <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                Название
                <input
                  value={newRecipientDraft.name}
                  onChange={(e) => setNewRecipientDraft((prev) => ({ ...prev, name: e.target.value }))}
                  className="input h-10 w-full py-1 text-sm"
                  placeholder={newRecipientDraft.type === 'chat' ? 'Чат запуска' : 'Мой Telegram'}
                />
              </label>
            </div>

            <label className="block min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
              {newRecipientDraft.type === 'chat' ? 'chat_id группы' : 'Telegram ID'}
              <input
                value={newRecipientDraft.type === 'chat' ? newRecipientDraft.chatId : newRecipientDraft.telegramId}
                onChange={(e) => setNewRecipientDraft((prev) => (
                  prev.type === 'chat'
                    ? { ...prev, chatId: e.target.value }
                    : { ...prev, telegramId: e.target.value }
                ))}
                className="input h-10 w-full py-1 text-sm"
                placeholder={newRecipientDraft.type === 'chat' ? '-1001234567890' : '6778090342'}
              />
            </label>

            <button
              type="button"
              onClick={handleCreateTelegramRecipient}
              className="btn-secondary h-10 w-full justify-center rounded-[16px] px-3 py-1 text-sm"
            >
              <Plus className="h-4 w-4" />
              Добавить получателя
            </button>
          </div>
        )}
      </div>
    </details>
  )

  const renderTelegramSettingsModal = () => {
    if (!telegramSettingsModal || typeof document === 'undefined') return null

    const stage = product.stages.find((item: any) => item.id === telegramSettingsModal.stageId)
    if (!stage) return null

    const subStages = Array.isArray(stage.subStages) ? stage.subStages : []
    const targets = [
      {
        key: getNotificationKey(stage.id, null),
        subStage: null,
        number: '1',
        title: 'Этап завершён',
        description: 'После завершения',
      },
      ...subStages.map((subStage: any, index: number) => ({
        key: getNotificationKey(stage.id, subStage.id),
        subStage,
        number: `1.${index + 1}`,
        title: `Подэтап завершён`,
        description: subStage.name,
      })),
    ]
    const activeTarget = targets.find((target) => (target.subStage?.id || null) === telegramSettingsModal.subStageId) || targets[0]
    const activeSubStage = activeTarget.subStage
    const key = getNotificationKey(stage.id, activeSubStage?.id)
    const setting = getNotificationSetting(stage, activeSubStage)
    const draft = getNotificationDraft(stage, activeSubStage)
    const recipients = telegramRecipients.filter((recipient) => recipient.type === draft.recipientType)
    const templateOptions = getTelegramTemplatesForTarget(activeSubStage)
    const selectedTemplate = templateOptions.some((template) => template.id === draft.messageTemplate)
      ? draft.messageTemplate
      : templateOptions[0]?.id || 'custom'
    const statusMeta = getNotificationStatusMeta(stage, activeSubStage)
    const preview = getTelegramMessagePreview(stage, activeSubStage)
    const selectedRecipient = telegramRecipients.find((recipient) => recipient.id === draft.recipientId)
    const isSavingNotification = notificationSavingKey === key
    const isTestingNotification = notificationTestingKey === key
    const saveDisabled = isSavingNotification || (draft.isEnabled && !draft.recipientId)
    const isCustomMessage = selectedTemplate === 'custom'
    const targetKindLabel = activeSubStage ? 'Завершение подэтапа' : 'Завершение этапа'

    return createPortal(
      <motion.div
        className="modal-backdrop flex items-end justify-center px-4 pb-4 pt-8 sm:items-center"
        onClick={() => setTelegramSettingsModal(null)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Настройки Telegram после завершения"
          className="flex h-[min(760px,calc(100vh-40px))] w-full max-w-[1180px] flex-col overflow-hidden rounded-[28px] border border-border/80 bg-card shadow-modal"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex-shrink-0 border-b border-border/70 px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[18px] bg-primary/10 text-primary">
                  <Bell className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold text-foreground">Telegram после завершения</h3>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{stage.stageName}</p>
                </div>
              </div>
              <button
                onClick={() => setTelegramSettingsModal(null)}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Закрыть настройки Telegram"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[292px_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-y-auto border-b border-border/70 bg-muted/35 p-4 sm:p-5 lg:border-b-0 lg:border-r">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">Что уведомлять</p>
                <span className={cn('badge flex-shrink-0 px-2 py-1 text-xs', statusMeta.chipClass)}>{statusMeta.label}</span>
              </div>
              <div className="space-y-2">
                {targets.map((target) => {
                  const targetStatus = getNotificationStatusMeta(stage, target.subStage)
                  const targetActive = target.key === activeTarget.key
                  return (
                    <button
                      key={target.key}
                      type="button"
                      onClick={() => setTelegramSettingsTarget(target.subStage?.id || null)}
                      className={cn(
                        'grid w-full grid-cols-[3.25rem_minmax(0,1fr)_1.25rem] items-center gap-3 rounded-[18px] border p-3 text-left transition-colors',
                        targetActive
                          ? 'border-primary/45 bg-primary/10'
                          : 'border-border/70 bg-card/80 hover:bg-accent'
                      )}
                    >
                      <span className={cn(
                        'flex h-8 w-10 flex-shrink-0 items-center justify-center rounded-[14px] text-xs font-semibold',
                        targetActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      )}>
                        {target.number}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {target.subStage ? target.description : target.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {target.subStage ? target.title : target.description}
                        </span>
                      </span>
                      {targetStatus.label !== 'Не настроено' && (
                        <CheckCircle2 className={cn('mt-1 h-4 w-4 flex-shrink-0', targetStatus.iconClass)} />
                      )}
                      {targetStatus.label === 'Не настроено' && (
                        <span aria-hidden className="h-4 w-4" />
                      )}
                    </button>
                  )
                })}
              </div>
            </aside>

            <section className="grid min-h-0 gap-4 overflow-hidden p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
                <div className="rounded-[22px] border border-border/70 bg-muted/45 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{targetKindLabel}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {activeSubStage ? activeSubStage.name : 'После того как этап станет завершённым'}
                      </p>
                    </div>
                    <label className="inline-flex flex-shrink-0 items-center gap-2 text-sm font-medium text-foreground">
                      <input
                        type="checkbox"
                        checked={Boolean(draft.isEnabled)}
                        onChange={(e) => setTelegramDraftValue(stage.id, activeSubStage?.id || null, { isEnabled: e.target.checked })}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                        disabled={!canEdit}
                      />
                      Отправлять
                    </label>
                  </div>
                  {setting?.lastError && (
                    <div className="mt-3 rounded-[16px] border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                      {getTelegramErrorText(setting.lastError)}
                    </div>
                  )}
                </div>

                <div className="rounded-[22px] border border-border/70 bg-card p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Bell className="h-4 w-4 text-primary" />
                    Получатель
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                      Тип
                      <select
                        value={draft.recipientType}
                        onChange={(e) => setTelegramDraftValue(stage.id, activeSubStage?.id || null, { recipientType: e.target.value, recipientId: '' })}
                        className="input h-11 w-full min-w-0 py-1 text-sm"
                        disabled={!canEdit}
                      >
                        <option value="user">Личный Telegram</option>
                        <option value="chat">Групповой чат</option>
                      </select>
                    </label>
                    <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                      Получатель
                      <select
                        value={draft.recipientId}
                        onChange={(e) => setTelegramDraftValue(stage.id, activeSubStage?.id || null, { recipientId: e.target.value })}
                        className="input h-11 w-full min-w-0 py-1 text-sm"
                        disabled={!canEdit || recipients.length === 0}
                      >
                        <option value="">Не выбран</option>
                        {recipients.map((recipient) => (
                          <option key={recipient.id} value={recipient.id}>
                            {recipient.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {draft.isEnabled && !draft.recipientId && (
                    <div className="mt-3 rounded-[16px] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                      Выберите получателя, чтобы включить уведомление.
                    </div>
                  )}
                  {selectedRecipient && (
                    <p className="mt-3 truncate text-xs text-muted-foreground">
                      Сейчас выбран: <span className="font-medium text-foreground">{selectedRecipient.name}</span>
                    </p>
                  )}
                </div>

                <div className="rounded-[22px] border border-border/70 bg-card p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Settings className="h-4 w-4 text-primary" />
                    Сообщение
                  </div>
                  <label className="block min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                    Формат
                    <select
                      value={selectedTemplate}
                      onChange={(e) => setTelegramDraftValue(stage.id, activeSubStage?.id || null, { messageTemplate: e.target.value })}
                      className="input h-11 w-full min-w-0 py-1 text-sm"
                      disabled={!canEdit}
                    >
                      {templateOptions.map((template) => (
                        <option key={template.id} value={template.id}>{template.label}</option>
                      ))}
                    </select>
                  </label>
                  {isCustomMessage && (
                    <label className="mt-3 block min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                      Свой текст
                      <textarea
                        value={draft.customMessage}
                        onChange={(e) => setTelegramDraftValue(stage.id, activeSubStage?.id || null, { customMessage: e.target.value, messageTemplate: 'custom' })}
                        className="input min-h-[112px] w-full rounded-[18px] py-2 text-sm"
                        placeholder={activeSubStage
                          ? 'Например: Подэтап {substage_name} закрыт по продукту {product_name}'
                          : 'Например: Этап {stage_name} завершён по продукту {product_name}'}
                        disabled={!canEdit}
                      />
                    </label>
                  )}
                </div>

                {renderTelegramRecipientManager()}
              </div>

              <div className="flex min-h-0 flex-col rounded-[22px] border border-border/70 bg-background/75 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <SendHorizontal className="h-4 w-4 text-primary" />
                  Превью
                </div>
                <pre className="min-h-0 flex-1 whitespace-pre-wrap overflow-y-auto rounded-[18px] bg-muted/70 p-3 text-sm leading-6 text-foreground">{preview}</pre>
                <button
                  type="button"
                  onClick={() => handleSendTelegramTest(stage, activeSubStage)}
                  disabled={!draft.recipientId || isTestingNotification || !canEdit}
                  className="btn-secondary mt-3 h-11 w-full flex-shrink-0 justify-center rounded-[16px] px-3 py-1 text-sm"
                >
                  <SendHorizontal className="h-4 w-4" />
                  {isTestingNotification ? 'Отправляем...' : 'Отправить тест'}
                </button>
              </div>
            </section>
          </div>

          <div className="flex flex-shrink-0 flex-col-reverse gap-3 border-t border-border/70 bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <button
              type="button"
              onClick={() => setTelegramSettingsModal(null)}
              className="btn-secondary w-full justify-center sm:w-auto"
            >
              Закрыть
            </button>

            <button
              type="button"
              onClick={() => handleSaveTelegramNotification(stage, activeSubStage)}
              disabled={saveDisabled || !canEdit}
              className="btn-primary w-full justify-center text-sm sm:w-auto"
            >
              <Save className="h-4 w-4" />
              {isSavingNotification ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </motion.div>
      </motion.div>,
      document.body
    )
  }

  const renderTemplateNotificationPanel = () => {
    if (!canEdit || productTemplates.length === 0) return null

    return (
      <div className="rounded-[24px] border border-border/70 bg-muted/60 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">Шаблон продукта</p>
              {currentProductTemplate ? (
                <span className="badge status-chip-info px-2.5 py-1 text-xs">Используется шаблон</span>
              ) : (
                <span className="badge status-chip-neutral px-2.5 py-1 text-xs">Без шаблона</span>
              )}
              {hasTelegramNotificationOverrides && (
                <span className="badge status-chip-warning px-2.5 py-1 text-xs">Есть индивидуальные TG</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {currentProductTemplate
                ? `Сейчас применён: ${currentProductTemplate.name}`
                : 'Выберите шаблон, чтобы подтянуть этапы и Telegram-уведомления.'}
            </p>
          </div>

          <div className="grid w-full gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] xl:w-auto xl:min-w-[620px]">
            <label className="min-w-0">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Шаблон
              </span>
              <select
                value={templateApplyId}
                onChange={(event) => setTemplateApplyId(event.target.value)}
                className="input h-10 w-full text-sm"
              >
                <option value="">Выберите шаблон</option>
                {productTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-end">
              <span className="flex h-10 items-center gap-2 rounded-lg border border-border/70 bg-card px-3 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={templateResetNotificationOverrides}
                  onChange={(event) => setTemplateResetNotificationOverrides(event.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                />
                Использовать TG из шаблона
              </span>
            </label>

            <button
              type="button"
              onClick={handleApplyProductTemplate}
              disabled={templateApplying || !templateApplyId}
              className="btn-primary h-10 justify-center px-4 text-sm"
            >
              {templateApplying ? 'Применяем...' : 'Применить'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderStageCard = (stage: any, idx: number) => {
    const isEditing = editingStageId === stage.id
    const cellStyle = getStageCellStyle(stage)
    const subStages = Array.isArray(stage.subStages) ? stage.subStages : []
    const addSubStageKey = `add:${stage.id}`
    const telegramSummary = getStageNotificationSummary(stage)

    return (
      <div
        key={stage.id}
        onContextMenu={(e) => handleStageContextMenu(e, stage)}
        className={cn(
          'space-y-3 rounded-[24px] p-3 transition-all',
          stage.isCompleted
            ? 'bg-emerald-500/10'
            : stage.status === 'IN_PROGRESS'
              ? 'bg-sky-500/10'
              : 'bg-muted/70 hover:bg-accent/70'
        )}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex w-full min-w-0 items-start gap-3 lg:items-center">
            <div className="flex-shrink-0" title="Этап закрывается автоматически после выполнения чек-листа">
              {stage.isCompleted
                ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                : <Circle className="h-5 w-5 text-muted-foreground/40" />
              }
            </div>

            <div className="w-6 flex-shrink-0 pt-0.5 text-center text-xs text-muted-foreground lg:pt-0">{idx + 1}</div>

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
                </p>
              )}
              {stage.comment && !isEditing && renamingStageId !== stage.id && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{stage.comment}</p>
              )}
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row lg:items-center lg:justify-end">
            <span className={cn('badge justify-center px-2.5 py-1 text-xs', getStageStatusStyle(stage.status, stage.isCompleted))}>
              {STAGE_STATUS_LABELS[stage.status] || stage.status}
            </span>
            {telegramSummary.errors > 0 ? (
              <span className="badge status-chip-danger justify-center px-2.5 py-1 text-xs">TG ошибка</span>
            ) : telegramSummary.enabled > 0 ? (
              <span className="badge status-chip-info justify-center px-2.5 py-1 text-xs">
                TG {telegramSummary.enabled}/{telegramSummary.total}
              </span>
            ) : null}
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

            {isEditing ? (
              <label className="flex w-full flex-shrink-0 items-center gap-2 text-xs text-muted-foreground sm:w-28">
                <span className="sr-only">Количество дней</span>
                <input
                  type="number"
                  min={1}
                  value={stageEditValues[stage.id]?.durationDays ?? getStageDurationValue(stage)}
                  onChange={(e) => setStageEditValues((prev) => ({
                    ...prev,
                    [stage.id]: {
                      ...prev[stage.id],
                      durationDays: Math.max(1, Number(e.target.value) || 1),
                    },
                  }))}
                  className="input h-10 w-full text-xs"
                  aria-label="Количество дней этапа"
                />
              </label>
            ) : (
              Boolean(stage.durationDays ?? stage.stageTemplate?.durationDays) && (
                <div className="w-full flex-shrink-0 text-left text-xs text-muted-foreground sm:w-16 sm:text-center">
                  {formatDurationDays(stage.durationDays ?? stage.stageTemplate?.durationDays ?? null)}
                </div>
              )
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
                  <>
                    <button
                      type="button"
                      onClick={() => openTelegramSettingsModal(stage)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="Настроить Telegram после завершения"
                      aria-label="Настроить Telegram после завершения этапа"
                    >
                      <Settings className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => beginStageEdit(stage)}
                      className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                      title="Изменить дату и дни"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-l border-border/80 pl-3">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Подэтапы
              <span className="text-xs font-medium text-muted-foreground">{subStages.length}</span>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <input
                  value={subStageDrafts[addSubStageKey] || ''}
                  onChange={(e) => setSubStageDrafts((prev) => ({ ...prev, [addSubStageKey]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSubStage(stage)
                  }}
                  className="input h-10 min-w-0 py-1 text-xs sm:w-64"
                  placeholder="Название подэтапа"
                />
                <button
                  onClick={() => handleAddSubStage(stage)}
                  disabled={subStageSavingKey === addSubStageKey || !(subStageDrafts[addSubStageKey] || '').trim()}
                  className="btn-secondary h-10 rounded-[16px] px-3 py-1 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {subStages.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
              Подэтапов пока нет
            </div>
          ) : (
            <div className="space-y-2">
              {subStages.map((subStage: any, subIndex: number) => (
	                <div key={subStage.id} className="rounded-[18px] bg-background/55 p-3">
	                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
	                    <div className="flex min-w-0 gap-3">
	                      {canEdit ? (
	                        <button
	                          type="button"
	                          onClick={() => handleToggleSubStageComplete(stage, subStage)}
	                          disabled={subStageSavingKey === `complete:${subStage.id}`}
	                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
	                          title={subStage.status === 'COMPLETED' ? 'Вернуть подэтап в работу' : 'Закрыть подэтап'}
	                          aria-label={subStage.status === 'COMPLETED' ? 'Вернуть подэтап в работу' : 'Закрыть подэтап'}
	                        >
	                          {subStage.status === 'COMPLETED'
	                            ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
	                            : <Circle className="h-5 w-5" />
	                          }
	                        </button>
	                      ) : (
	                        <div className="mt-0.5 h-5 w-5 shrink-0">
	                          {subStage.status === 'COMPLETED'
	                            ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
	                            : <Circle className="h-5 w-5 text-muted-foreground/50" />
	                          }
	                        </div>
	                      )}
	                    <div className="min-w-0">
	                      <div className="flex flex-wrap items-center gap-2">
	                        <span className="text-xs text-muted-foreground">{idx + 1}.{subIndex + 1}</span>
	                        <p className={cn('text-sm font-medium', subStage.status === 'COMPLETED' ? 'text-muted-foreground line-through' : 'text-foreground')}>{subStage.name}</p>
                        <span className={cn('badge px-2 py-1 text-xs', getStageStatusStyle(subStage.status))}>
                          {STAGE_STATUS_LABELS[subStage.status] || subStage.status}
                        </span>
                        {(() => {
                          const subStageStatus = getNotificationStatusMeta(stage, subStage)
                          const showTelegramStatus = subStageStatus.label !== 'Не настроено'
                          return showTelegramStatus ? (
                            <span className={cn('badge px-2 py-1 text-xs', subStageStatus.chipClass)}>
                              TG {subStageStatus.label}
                            </span>
                          ) : null
                        })()}
                      </div>
	                      {subStage.description && (
	                        <p className="mt-1 text-xs text-muted-foreground">{subStage.description}</p>
	                      )}
	                    </div>
	                    </div>
	                    {canEdit && (
	                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openTelegramSettingsModal(stage, subStage)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          title="Настроить Telegram после завершения подэтапа"
                          aria-label="Настроить Telegram после завершения подэтапа"
                        >
                          <Settings className="h-5 w-5" />
                        </button>
	                        <button
                          onClick={() => handleDeleteSubStage(stage, subStage)}
                          disabled={subStageSavingKey === `delete:${subStage.id}`}
                          className="rounded-lg p-1.5 text-red-500/70 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                          title="Удалить подэтап"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

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
              {canEdit && currentPriorityOption ? (
                <div ref={priorityMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setPriorityMenuOpen((open) => !open)}
                    disabled={prioritySaving}
                    className={cn(
                      'badge border transition hover:shadow-sm disabled:opacity-60',
                      currentPriorityOption.badgeClassName
                    )}
                    aria-haspopup="menu"
                    aria-expanded={priorityMenuOpen}
                    title="Изменить приоритет продукта"
                  >
                    <span className={cn('h-2 w-2 rounded-full', currentPriorityOption.dotClassName)} />
                    {currentPriorityOption.label}
                  </button>
                  {priorityMenuOpen && (
                    <div className="absolute left-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-[18px] border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-xl" role="menu">
                      {EDITABLE_PRODUCT_PRIORITIES.map((priorityOption) => {
                        const active = product.priority === priorityOption.value

                        return (
                          <button
                            key={priorityOption.value}
                            type="button"
                            onClick={() => changeProductPriority(priorityOption.value)}
                            disabled={prioritySaving}
                            className={cn(
                              'flex w-full items-start gap-2 rounded-[14px] px-3 py-2 text-left text-sm transition disabled:opacity-60',
                              active ? 'bg-accent text-popover-foreground' : 'hover:bg-accent/70'
                            )}
                            role="menuitem"
                          >
                            <span className={cn('mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full', priorityOption.dotClassName)} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium">{priorityOption.label}</span>
                              <span className="block text-xs text-muted-foreground">{priorityOption.description}</span>
                            </span>
                            {active && <span className="mt-0.5 text-xs text-muted-foreground">сейчас</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <span className={cn('badge border', getPriorityColor(product.priority))}>{getPriorityLabel(product.priority)}</span>
              )}
              {canEdit && currentStatusOption ? (
                <div ref={statusMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setStatusMenuOpen((open) => !open)}
                    disabled={statusSaving}
                    className={cn(
                      'badge border transition hover:shadow-sm disabled:opacity-60',
                      currentStatusOption.badgeClassName
                    )}
                    aria-haspopup="menu"
                    aria-expanded={statusMenuOpen}
                    title="Изменить статус продукта"
                  >
                    <span className={cn('h-2 w-2 rounded-full', currentStatusOption.dotClassName)} />
                    {currentStatusOption.label}
                  </button>
                  {statusMenuOpen && (
                    <div className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-[18px] border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-xl" role="menu">
                      {EDITABLE_PRODUCT_STATUSES.map((statusOption) => {
                        const active = product.status === statusOption.value

                        return (
                          <button
                            key={statusOption.value}
                            type="button"
                            onClick={() => changeProductStatus(statusOption.value)}
                            disabled={statusSaving}
                            className={cn(
                              'flex w-full items-start gap-2 rounded-[14px] px-3 py-2 text-left text-sm transition disabled:opacity-60',
                              active ? 'bg-accent text-popover-foreground' : 'hover:bg-accent/70'
                            )}
                            role="menuitem"
                          >
                            <span className={cn('mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full', statusOption.dotClassName)} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium">{statusOption.label}</span>
                              <span className="block text-xs text-muted-foreground">{statusOption.description}</span>
                            </span>
                            {active && <span className="mt-0.5 text-xs text-muted-foreground">сейчас</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <span className={cn('badge', getStatusColor(product.status))}>{getStatusLabel(product.status)}</span>
              )}
              {product.country && <span className="badge bg-muted text-muted-foreground">{product.country}</span>}
            </div>
            <div className="mb-2 flex items-start gap-3">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setRenameProductOpen(true)}
                  disabled={lifecycleSaving}
                  className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
                  title="Переименовать продукт"
                  aria-label="Переименовать продукт"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-bold leading-tight text-foreground">{product.name}</h1>
                {canEdit && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Нажми на иконку слева, чтобы переименовать продукт
                  </div>
                )}
              </div>
            </div>
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
                        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground sm:w-40">
                          Кол-во дней
                          <input
                            type="number"
                            min={1}
                            value={newStageDurationDays}
                            onChange={(e) => setNewStageDurationDays(Math.max(1, Number(e.target.value) || 1))}
                            className="input h-11 w-full text-sm normal-case tracking-normal"
                          />
                        </label>
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
	                    {renderTemplateNotificationPanel()}
	                    {product.stages.map((stage: any, idx: number) => renderStageCard(stage, idx))}
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

      {renderTelegramSettingsModal()}

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
                beginStageEdit(stage)
                closeStageMenu()
              }}
            >
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
              Изменить дату и дни
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-popover-foreground hover:bg-accent"
              onClick={() => {
                openTelegramSettingsModal(stage)
                closeStageMenu()
              }}
            >
              <Settings className="w-3.5 h-3.5 text-muted-foreground" />
              Telegram-уведомления
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

      <ProductRenameDialog
        open={renameProductOpen}
        initialName={product.name}
        loading={lifecycleSaving}
        onCancel={() => setRenameProductOpen(false)}
        onConfirm={confirmRenameProduct}
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

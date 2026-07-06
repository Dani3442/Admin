'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bell, Check, ChevronDown, Layers3, ListChecks, Plus, Save, Trash2, Zap } from 'lucide-react'
import Link from 'next/link'
import { DatePicker } from '@/components/ui/DatePicker'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { ProductTemplateData, ProductTemplateStageData, StageStartTrigger } from '@/types'
import { serializeDateOnly } from '@/lib/date-only'
import {
  applySequentialStageDateOverride,
  fillMissingSequentialStageDates,
} from '@/lib/stage-schedule'
import {
  normalizeStageStartDelayDays,
  normalizeStageStartReferenceOrder,
  normalizeStageStartTrigger,
} from '@/lib/stage-start-rules'

const PRIORITIES = [
  { value: 'CRITICAL', label: 'Критический' },
  { value: 'HIGH', label: 'Высокий' },
  { value: 'MEDIUM', label: 'Средний' },
  { value: 'LOW', label: 'Низкий' },
]

const STAGE_START_TRIGGER_OPTIONS: Array<{ value: StageStartTrigger; label: string }> = [
  { value: 'PRODUCT_CREATED', label: 'От создания' },
  { value: 'PREVIOUS_STAGE_COMPLETED', label: 'После предыдущего' },
  { value: 'STAGE_STARTED', label: 'После старта этапа' },
  { value: 'STAGE_COMPLETED', label: 'После завершения этапа' },
]

interface TemplateDraftStage {
  id: string
  stageName: string
  plannedDate: Date | null
  durationDays: number | null
  effectiveDurationDays?: number | null
  participatesInAutoshift: boolean
  startTrigger: StageStartTrigger
  startDelayDays: number
  startReferenceStageOrder: number | null
  subStages: TemplateChecklistItem[]
}

interface SelectedTemplateStageOverride extends ProductTemplateStageData {
  effectiveDurationDays?: number | null
  subStages?: TemplateChecklistItem[]
}

interface TemplateChecklistItem {
  id: string
  name: string
  description: string | null
  responsibleId: string | null
  notifyOnStart: boolean
  notifyOnComplete: boolean
  telegramRecipientType: 'user' | 'chat'
  telegramRecipientId: string
  telegramMessageTemplate: string
  telegramCustomMessage: string
  sortOrder: number
}

interface TemplateTelegramDraft {
  isEnabled: boolean
  recipientType: 'user' | 'chat'
  recipientId: string
  messageTemplate: string
  customMessage: string
}

type TemplateStageCardLike = {
  id: string
  stageName: string
  plannedDate: Date | null
  durationDays?: number | null
  effectiveDurationDays?: number | null
  participatesInAutoshift: boolean
  startTrigger?: StageStartTrigger
  startDelayDays?: number | null
  startReferenceStageOrder?: number | null
  subStages?: TemplateChecklistItem[]
}

const TEMPLATE_TELEGRAM_EVENTS = [
  { value: 'stage_completed', label: 'Завершение этапа', defaultTemplate: 'stage_completed_simple' },
  { value: 'stage_started', label: 'Начало этапа', defaultTemplate: 'stage_started_simple' },
] as const

type TemplateTelegramEventType = (typeof TEMPLATE_TELEGRAM_EVENTS)[number]['value']

interface NewProductFormProps {
  users: Array<{ id: string; name: string }>
  productTemplates: ProductTemplateData[]
  stageSuggestions: Array<{ id: string; name: string }>
  mode?: 'page' | 'modal'
  onCancel?: () => void
  onCreated?: (productId: string) => void
  returnTo?: string
}

function createDraftStage(index = 0): TemplateDraftStage {
  return {
    id: `stage-${Math.random().toString(36).slice(2, 10)}`,
    stageName: '',
    plannedDate: null,
    durationDays: index === 0 ? 1 : null,
    effectiveDurationDays: index === 0 ? 1 : null,
    participatesInAutoshift: true,
    startTrigger: index === 0 ? 'PRODUCT_CREATED' : 'PREVIOUS_STAGE_COMPLETED',
    startDelayDays: 0,
    startReferenceStageOrder: null,
    subStages: [],
  }
}

function createTemplateChecklistItem(index = 0): TemplateChecklistItem {
  return {
    id: `substage-${Math.random().toString(36).slice(2, 10)}`,
    name: '',
    description: null,
    responsibleId: null,
    notifyOnStart: false,
    notifyOnComplete: true,
    telegramRecipientType: 'user',
    telegramRecipientId: '',
    telegramMessageTemplate: 'substage_completed_simple',
    telegramCustomMessage: '',
    sortOrder: index,
  }
}

function normalizeTemplateChecklistItems(subStages: any[] | undefined): TemplateChecklistItem[] {
  return (Array.isArray(subStages) ? subStages : [])
    .map((subStage, index) => ({
      id: String(subStage?.id || `substage-${Math.random().toString(36).slice(2, 10)}`),
      name: String(subStage?.name || ''),
      description: subStage?.description || null,
      responsibleId: subStage?.responsibleId || null,
      notifyOnStart: false,
      notifyOnComplete: subStage?.notifyOnComplete !== false,
      telegramRecipientType: (subStage?.telegramRecipientType === 'chat' ? 'chat' : 'user') as 'user' | 'chat',
      telegramRecipientId: String(subStage?.telegramRecipientId || ''),
      telegramMessageTemplate: String(subStage?.telegramMessageTemplate || 'substage_completed_simple'),
      telegramCustomMessage: String(subStage?.telegramCustomMessage || ''),
      sortOrder: Number.isInteger(Number(subStage?.sortOrder)) ? Number(subStage.sortOrder) : index,
    }))
    .filter((subStage) => subStage.name.trim())
    .map((subStage, index) => ({ ...subStage, sortOrder: index }))
}

function hydrateSelectedTemplateStages(stages: ProductTemplateStageData[]) {
  return fillMissingSequentialStageDates(
    stages.map((stage) => ({
      ...stage,
      plannedDate: stage.plannedDate ? new Date(stage.plannedDate) : null,
      durationDays: stage.durationDays ?? null,
      stageTemplateDurationDays: stage.stageTemplateDurationDays ?? null,
      startTrigger: normalizeStageStartTrigger(stage.startTrigger, stage.stageOrder),
      startDelayDays: normalizeStageStartDelayDays(stage.startDelayDays),
      startReferenceStageOrder: normalizeStageStartReferenceOrder(stage.startReferenceStageOrder),
      subStages: normalizeTemplateChecklistItems(stage.subStages as any),
    }))
  ).map((stage) => ({
    ...stage,
    durationDays: stage.durationDays ?? null,
    effectiveDurationDays: stage.effectiveDurationDays,
    startTrigger: normalizeStageStartTrigger(stage.startTrigger, stage.stageOrder),
    startDelayDays: normalizeStageStartDelayDays(stage.startDelayDays),
    startReferenceStageOrder: normalizeStageStartReferenceOrder(stage.startReferenceStageOrder),
    subStages: normalizeTemplateChecklistItems(stage.subStages as any),
  }))
}

function getTemplateTelegramDraftKey(stageId: string, eventType: TemplateTelegramEventType) {
  return `${stageId}:${eventType}`
}

function getDefaultTemplateTelegramMessage(_eventType: TemplateTelegramEventType) {
  return _eventType === 'stage_started' ? 'stage_started_simple' : 'stage_completed_simple'
}

function createTemplateTelegramDraft(setting?: any, eventType: TemplateTelegramEventType = 'stage_completed'): TemplateTelegramDraft {
  return {
    isEnabled: Boolean(setting?.isEnabled),
    recipientType: setting?.recipientType === 'chat' ? 'chat' : 'user',
    recipientId: setting?.recipientId || '',
    messageTemplate: setting?.messageTemplate || getDefaultTemplateTelegramMessage(eventType),
    customMessage: setting?.customMessage || '',
  }
}

function getTemplateStageTelegramSetting(stage: { telegramNotificationSettings?: any[] }, eventType: TemplateTelegramEventType) {
  return (stage.telegramNotificationSettings || []).find((setting) => setting.eventType === eventType) || null
}

function hydrateTemplateTelegramDrafts(stages: Array<{ id: string; telegramNotificationSettings?: any[] }>) {
  const next: Record<string, TemplateTelegramDraft> = {}

  for (const stage of stages) {
    for (const eventOption of TEMPLATE_TELEGRAM_EVENTS) {
      const setting = getTemplateStageTelegramSetting(stage, eventOption.value)
      if (setting) {
        next[getTemplateTelegramDraftKey(stage.id, eventOption.value)] = createTemplateTelegramDraft(
          setting,
          eventOption.value
        )
      }
    }
  }

  return next
}

function getTemplateTelegramDraft(
  drafts: Record<string, TemplateTelegramDraft>,
  stageId: string,
  eventType: TemplateTelegramEventType
) {
  return drafts[getTemplateTelegramDraftKey(stageId, eventType)] || createTemplateTelegramDraft(null, eventType)
}

function buildTemplateTelegramSettingsPayload(
  stages: Array<{ id: string }>,
  drafts: Record<string, TemplateTelegramDraft>
) {
  return stages.flatMap((stage, index) =>
    TEMPLATE_TELEGRAM_EVENTS.flatMap((eventOption) => {
      const draft = drafts[getTemplateTelegramDraftKey(stage.id, eventOption.value)]
      if (!draft) return []

      const hasCustomContent = draft.customMessage.trim().length > 0
      const hasRecipient = draft.recipientId.trim().length > 0
      if (!draft.isEnabled && !hasRecipient && !hasCustomContent) return []

      return [{
        stageOrder: index,
        eventType: eventOption.value,
        recipientType: draft.recipientType,
        recipientId: draft.recipientId || null,
        messageTemplate: draft.messageTemplate || eventOption.defaultTemplate,
        customMessage: draft.customMessage.trim() || null,
        isEnabled: draft.isEnabled,
      }]
    })
  )
}

export function NewProductForm({
  users,
  productTemplates,
  stageSuggestions,
  mode = 'page',
  onCancel,
  onCreated,
  returnTo = '/products',
}: NewProductFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [templates, setTemplates] = useState(productTemplates)
  const [templateSelectOpen, setTemplateSelectOpen] = useState(false)
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [selectedTemplateSaving, setSelectedTemplateSaving] = useState(false)
  const [templateDeleting, setTemplateDeleting] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const [templateDeleteError, setTemplateDeleteError] = useState('')
  const [selectedTemplateError, setSelectedTemplateError] = useState('')
  const [templateToDelete, setTemplateToDelete] = useState<ProductTemplateData | null>(null)
  const [templateDraftName, setTemplateDraftName] = useState('')
  const [templateDraftDescription, setTemplateDraftDescription] = useState('')
  const [templateStages, setTemplateStages] = useState<TemplateDraftStage[]>([createDraftStage(0)])
  const [selectedTemplateStages, setSelectedTemplateStages] = useState<SelectedTemplateStageOverride[]>([])
  const [selectedTemplateName, setSelectedTemplateName] = useState('')
  const [selectedTemplateDescription, setSelectedTemplateDescription] = useState('')
  const [telegramRecipients, setTelegramRecipients] = useState<any[]>([])
  const [telegramRecipientsLoading, setTelegramRecipientsLoading] = useState(false)
  const [templateTelegramDrafts, setTemplateTelegramDrafts] = useState<Record<string, TemplateTelegramDraft>>({})
  const [selectedTemplateTelegramDrafts, setSelectedTemplateTelegramDrafts] = useState<Record<string, TemplateTelegramDraft>>({})
  const templateSelectRef = useRef<HTMLDivElement | null>(null)

  const [form, setForm] = useState({
    name: '',
    country: '',
    category: '',
    sku: '',
    priority: 'MEDIUM',
    responsibleId: '',
    notes: '',
    productTemplateId: '',
  })

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === form.productTemplateId) || null,
    [form.productTemplateId, templates]
  )

  const selectedTemplateLabel = selectedTemplate
    ? `${selectedTemplate.name} (${selectedTemplate.stages.length} этапов)`
    : 'Стандартный набор этапов'

  useEffect(() => {
    if (!selectedTemplate) {
      setSelectedTemplateStages([])
      setSelectedTemplateName('')
      setSelectedTemplateDescription('')
      setSelectedTemplateError('')
      setSelectedTemplateTelegramDrafts({})
      return
    }

    setSelectedTemplateName(selectedTemplate.name)
    setSelectedTemplateDescription(selectedTemplate.description ?? '')
    setSelectedTemplateError('')
    setSelectedTemplateStages(
      hydrateSelectedTemplateStages(selectedTemplate.stages)
    )
    setSelectedTemplateTelegramDrafts(hydrateTemplateTelegramDrafts(selectedTemplate.stages))
  }, [selectedTemplate])

  useEffect(() => {
    let cancelled = false
    setTelegramRecipientsLoading(true)

    fetch('/api/telegram/recipients')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Не удалось загрузить Telegram-получателей')))
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
    if (!templateSelectOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!templateSelectRef.current?.contains(event.target as Node)) {
        setTemplateSelectOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTemplateSelectOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [templateSelectOpen])

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const updateTemplateStage = (stageId: string, patch: Partial<TemplateDraftStage>) => {
    setTemplateStages((prev) =>
      {
        const targetIndex = prev.findIndex((stage) => stage.id === stageId)
        const nextStages = prev.map((stage) => {
          if (stage.id !== stageId) return stage

          return { ...stage, ...patch }
        })

        const affectsSchedule =
          'plannedDate' in patch ||
          'durationDays' in patch ||
          'participatesInAutoshift' in patch

        if (affectsSchedule && targetIndex >= 0) {
          return applySequentialStageDateOverride(
            nextStages,
            targetIndex,
            nextStages[targetIndex].plannedDate
          ).map((stage, index) => ({
            id: stage.id,
            stageName: stage.stageName,
            plannedDate: stage.plannedDate,
            durationDays: stage.durationDays ?? null,
            effectiveDurationDays: stage.effectiveDurationDays,
            participatesInAutoshift: stage.participatesInAutoshift,
            startTrigger: normalizeStageStartTrigger(stage.startTrigger, index),
            startDelayDays: normalizeStageStartDelayDays(stage.startDelayDays),
            startReferenceStageOrder: normalizeStageStartReferenceOrder(stage.startReferenceStageOrder),
            subStages: normalizeTemplateChecklistItems((stage as any).subStages),
          }))
        }

        if (nextStages[0]?.plannedDate === null) {
          return nextStages.map((stage) => ({ ...stage, plannedDate: null, effectiveDurationDays: null }))
        }

        return nextStages
      }
    )
  }

  const updateSelectedTemplateStage = (
    stageId: string,
    patch: Partial<SelectedTemplateStageOverride>
  ) => {
    setSelectedTemplateStages((prev) =>
      {
        const targetIndex = prev.findIndex((stage) => stage.id === stageId)
        const nextStages = prev.map((stage) => {
          if (stage.id !== stageId) return stage

          return { ...stage, ...patch }
        })

        const affectsSchedule =
          'plannedDate' in patch ||
          'durationDays' in patch ||
          'participatesInAutoshift' in patch

        if (affectsSchedule && targetIndex >= 0) {
          return applySequentialStageDateOverride(
            nextStages,
            targetIndex,
            nextStages[targetIndex].plannedDate
          ).map((stage) => ({
            ...stage,
            durationDays: stage.durationDays ?? null,
            effectiveDurationDays: stage.effectiveDurationDays,
            startTrigger: normalizeStageStartTrigger(stage.startTrigger, stage.stageOrder),
            startDelayDays: normalizeStageStartDelayDays(stage.startDelayDays),
            startReferenceStageOrder: normalizeStageStartReferenceOrder(stage.startReferenceStageOrder),
            subStages: normalizeTemplateChecklistItems((stage as any).subStages),
          }))
        }

        if (nextStages[0]?.plannedDate === null) {
          return nextStages.map((stage) => ({ ...stage, plannedDate: null, effectiveDurationDays: null }))
        }

        return nextStages
      }
    )
  }

  const addTemplateStage = () => {
    setTemplateStages((prev) => {
      const nextStages = [...prev, createDraftStage(prev.length)]
      const anchorIndex = Math.max(0, prev.length - 1)

      return applySequentialStageDateOverride(
        nextStages,
        anchorIndex,
        nextStages[anchorIndex].plannedDate
      ).map((stage, index) => ({
        id: stage.id,
        stageName: stage.stageName,
        plannedDate: stage.plannedDate,
        durationDays: stage.durationDays ?? null,
        effectiveDurationDays: stage.effectiveDurationDays,
        participatesInAutoshift: stage.participatesInAutoshift,
        startTrigger: normalizeStageStartTrigger(stage.startTrigger, index),
        startDelayDays: normalizeStageStartDelayDays(stage.startDelayDays),
        startReferenceStageOrder: normalizeStageStartReferenceOrder(stage.startReferenceStageOrder),
        subStages: normalizeTemplateChecklistItems((stage as any).subStages),
      }))
    })
  }

  const removeTemplateStage = (stageId: string) => {
    setTemplateStages((prev) => {
      if (prev.length === 1) {
        return [{
          ...prev[0],
          stageName: '',
          plannedDate: null,
          durationDays: 1,
          effectiveDurationDays: 1,
          participatesInAutoshift: true,
          startTrigger: 'PRODUCT_CREATED',
          startDelayDays: 0,
          startReferenceStageOrder: null,
          subStages: [],
        }]
      }
      const removedIndex = prev.findIndex((stage) => stage.id === stageId)
      const nextStages = prev.filter((stage) => stage.id !== stageId)
      const anchorIndex = Math.max(0, Math.min(removedIndex - 1, nextStages.length - 1))

      return applySequentialStageDateOverride(
        nextStages,
        anchorIndex,
        nextStages[anchorIndex].plannedDate
      ).map((stage, index) => ({
        id: stage.id,
        stageName: stage.stageName,
        plannedDate: stage.plannedDate,
        durationDays: stage.durationDays ?? null,
        effectiveDurationDays: stage.effectiveDurationDays,
        participatesInAutoshift: stage.participatesInAutoshift,
        startTrigger: normalizeStageStartTrigger(stage.startTrigger, index),
        startDelayDays: normalizeStageStartDelayDays(stage.startDelayDays),
        startReferenceStageOrder: normalizeStageStartReferenceOrder(stage.startReferenceStageOrder),
        subStages: normalizeTemplateChecklistItems((stage as any).subStages),
      }))
    })
  }

  const updateTemplateChecklistItem = (
    stageId: string,
    itemId: string,
    patch: Partial<TemplateChecklistItem>
  ) => {
    updateTemplateStage(stageId, {
      subStages: (templateStages.find((stage) => stage.id === stageId)?.subStages || []).map((item) =>
        item.id === itemId ? { ...item, ...patch } : item
      ),
    })
  }

  const addTemplateChecklistItem = (stageId: string) => {
    const stage = templateStages.find((candidate) => candidate.id === stageId)
    updateTemplateStage(stageId, {
      subStages: [...(stage?.subStages || []), createTemplateChecklistItem(stage?.subStages?.length || 0)],
    })
  }

  const removeTemplateChecklistItem = (stageId: string, itemId: string) => {
    const stage = templateStages.find((candidate) => candidate.id === stageId)
    updateTemplateStage(stageId, {
      subStages: (stage?.subStages || [])
        .filter((item) => item.id !== itemId)
        .map((item, index) => ({ ...item, sortOrder: index })),
    })
  }

  const updateSelectedTemplateChecklistItem = (
    stageId: string,
    itemId: string,
    patch: Partial<TemplateChecklistItem>
  ) => {
    updateSelectedTemplateStage(stageId, {
      subStages: (selectedTemplateStages.find((stage) => stage.id === stageId)?.subStages || []).map((item) =>
        item.id === itemId ? { ...item, ...patch } : item
      ),
    })
  }

  const addSelectedTemplateChecklistItem = (stageId: string) => {
    const stage = selectedTemplateStages.find((candidate) => candidate.id === stageId)
    updateSelectedTemplateStage(stageId, {
      subStages: [...(stage?.subStages || []), createTemplateChecklistItem(stage?.subStages?.length || 0)],
    })
  }

  const removeSelectedTemplateChecklistItem = (stageId: string, itemId: string) => {
    const stage = selectedTemplateStages.find((candidate) => candidate.id === stageId)
    updateSelectedTemplateStage(stageId, {
      subStages: (stage?.subStages || [])
        .filter((item) => item.id !== itemId)
        .map((item, index) => ({ ...item, sortOrder: index })),
    })
  }

  const resetTemplateBuilder = () => {
    setTemplateDraftName('')
    setTemplateDraftDescription('')
    setTemplateStages([createDraftStage(0)])
    setTemplateTelegramDrafts({})
    setTemplateError('')
    setShowTemplateBuilder(false)
  }

  const buildTemplateDraftPayload = () => {
    const normalizedName = templateDraftName.trim()
    const normalizedStages = templateStages
      .map((stage, index) => ({
        id: stage.id,
        stageName: stage.stageName.trim(),
        plannedDate: stage.plannedDate,
        durationDays: stage.durationDays ?? null,
        participatesInAutoshift: stage.participatesInAutoshift,
        startTrigger: normalizeStageStartTrigger(stage.startTrigger, index),
        startDelayDays: normalizeStageStartDelayDays(stage.startDelayDays),
        startReferenceStageOrder: normalizeStageStartReferenceOrder(stage.startReferenceStageOrder),
        subStages: normalizeTemplateChecklistItems(stage.subStages),
      }))
      .filter((stage) => stage.stageName)

    return {
      normalizedName,
      normalizedStages,
    }
  }

  const persistTemplateDraft = async () => {
    const { normalizedName, normalizedStages } = buildTemplateDraftPayload()

    if (!normalizedName) {
      setTemplateError('Укажите название шаблона')
      return null
    }

    if (normalizedStages.length === 0) {
      setTemplateError('Добавьте хотя бы один этап в шаблон')
      return null
    }

    setTemplateSaving(true)
    setTemplateError('')

    try {
      const response = await fetch('/api/product-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          description: templateDraftDescription.trim() || null,
          stages: normalizedStages.map((stage) => ({
            stageName: stage.stageName,
            plannedDate: serializeDateOnly(stage.plannedDate),
            durationDays: stage.durationDays ?? null,
            participatesInAutoshift: stage.participatesInAutoshift,
            startTrigger: stage.startTrigger,
            startDelayDays: stage.startDelayDays,
            startReferenceStageOrder: stage.startReferenceStageOrder,
            subStages: normalizeTemplateChecklistItems(stage.subStages),
          })),
          telegramNotificationSettings: buildTemplateTelegramSettingsPayload(normalizedStages, templateTelegramDrafts),
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось создать шаблон этапов')
      }

      setTemplates((prev) => [data, ...prev])
      setSelectedTemplateStages(hydrateSelectedTemplateStages(Array.isArray(data?.stages) ? data.stages : []))
      setSelectedTemplateTelegramDrafts(hydrateTemplateTelegramDrafts(Array.isArray(data?.stages) ? data.stages : []))
      setForm((prev) => ({ ...prev, productTemplateId: data.id }))
      resetTemplateBuilder()
      return data as ProductTemplateData
    } catch (err: any) {
      setTemplateError(err.message || 'Не удалось создать шаблон этапов')
      return null
    } finally {
      setTemplateSaving(false)
    }
  }

  const handleCreateTemplate = async () => {
    await persistTemplateDraft()
  }

  const handleSelectTemplate = (templateId: string) => {
    update('productTemplateId', templateId)
    setTemplateSelectOpen(false)
    setTemplateDeleteError('')
  }

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return

    setTemplateDeleting(true)
    setTemplateDeleteError('')

    try {
      const response = await fetch(`/api/product-templates/${encodeURIComponent(templateToDelete.id)}`, {
        method: 'DELETE',
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось удалить шаблон этапов')
      }

      setTemplates((prev) => prev.filter((template) => template.id !== templateToDelete.id))
      if (form.productTemplateId === templateToDelete.id) {
        setForm((prev) => ({ ...prev, productTemplateId: '' }))
      setSelectedTemplateStages([])
      setSelectedTemplateTelegramDrafts({})
    }
      setTemplateSelectOpen(false)
      setTemplateToDelete(null)
      router.refresh()
    } catch (err: any) {
      setTemplateDeleteError(err.message || 'Не удалось удалить шаблон этапов')
    } finally {
      setTemplateDeleting(false)
    }
  }

  const handleUpdateSelectedTemplate = async () => {
    if (!selectedTemplate) return

    const normalizedName = selectedTemplateName.trim()
    const normalizedStages = selectedTemplateStages
      .map((stage, index) => ({
        id: stage.id,
        stageName: stage.stageName.trim(),
        plannedDate: stage.plannedDate,
        durationDays: stage.durationDays ?? null,
        participatesInAutoshift: stage.participatesInAutoshift,
        startTrigger: normalizeStageStartTrigger(stage.startTrigger, index),
        startDelayDays: normalizeStageStartDelayDays(stage.startDelayDays),
        startReferenceStageOrder: normalizeStageStartReferenceOrder(stage.startReferenceStageOrder),
        subStages: normalizeTemplateChecklistItems(stage.subStages),
      }))
      .filter((stage) => stage.stageName)

    if (!normalizedName) {
      setSelectedTemplateError('Укажите название шаблона')
      return
    }

    if (normalizedStages.length === 0) {
      setSelectedTemplateError('Добавьте хотя бы один этап в шаблон')
      return
    }

    setSelectedTemplateSaving(true)
    setSelectedTemplateError('')

    try {
      const response = await fetch(`/api/product-templates/${encodeURIComponent(selectedTemplate.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: normalizedName,
          description: selectedTemplateDescription.trim() || null,
          stages: normalizedStages.map((stage) => ({
            id: stage.id,
            stageName: stage.stageName,
            plannedDate: serializeDateOnly(stage.plannedDate),
            durationDays: stage.durationDays ?? null,
            participatesInAutoshift: stage.participatesInAutoshift,
            startTrigger: stage.startTrigger,
            startDelayDays: stage.startDelayDays,
            startReferenceStageOrder: stage.startReferenceStageOrder,
            subStages: normalizeTemplateChecklistItems(stage.subStages),
          })),
          telegramNotificationSettings: buildTemplateTelegramSettingsPayload(
            selectedTemplateStages,
            selectedTemplateTelegramDrafts
          ),
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось обновить шаблон этапов')
      }

      setTemplates((prev) =>
        prev.map((template) => (template.id === data.id ? (data as ProductTemplateData) : template))
      )
      setSelectedTemplateName(data.name)
      setSelectedTemplateDescription(data.description ?? '')
      setSelectedTemplateStages(
        hydrateSelectedTemplateStages(Array.isArray(data?.stages) ? data.stages : [])
      )
      setSelectedTemplateTelegramDrafts(hydrateTemplateTelegramDrafts(Array.isArray(data?.stages) ? data.stages : []))
      router.refresh()
    } catch (err: any) {
      setSelectedTemplateError(err.message || 'Не удалось обновить шаблон этапов')
    } finally {
      setSelectedTemplateSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Укажите название продукта')
      return
    }

    setSaving(true)
    setError('')

    try {
      const templateDraftHasContent = (() => {
        const { normalizedName, normalizedStages } = buildTemplateDraftPayload()
        return Boolean(normalizedName || normalizedStages.length > 0)
      })()

      let productTemplateId = form.productTemplateId || null
      let templateStageOverrides = selectedTemplateStages

      if (showTemplateBuilder && templateDraftHasContent) {
        const createdTemplate = await persistTemplateDraft()
        if (!createdTemplate?.id) {
          throw new Error('Не удалось сохранить шаблон этапов')
        }

        productTemplateId = createdTemplate.id
        templateStageOverrides = hydrateSelectedTemplateStages(createdTemplate.stages)
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          productTemplateId,
          templateStagesOverride: templateStageOverrides.map((stage) => ({
            id: stage.id,
            stageTemplateId: stage.stageTemplateId,
            stageOrder: stage.stageOrder,
            stageName: stage.stageName,
            plannedDate: serializeDateOnly(stage.plannedDate),
            durationDays: stage.durationDays ?? null,
            participatesInAutoshift: stage.participatesInAutoshift,
            startTrigger: stage.startTrigger,
            startDelayDays: stage.startDelayDays,
            startReferenceStageOrder: stage.startReferenceStageOrder,
            subStages: normalizeTemplateChecklistItems(stage.subStages),
          })),
          responsibleId: form.responsibleId || null,
          country: form.country || null,
          category: form.category || null,
          sku: form.sku || null,
          notes: form.notes || null,
        }),
      })

      const text = await res.text()
      let data: any = null

      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          data = null
        }
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Ошибка создания продукта')
      }

      const productId = typeof data?.id === 'string' ? data.id : ''

      if (!productId) {
        throw new Error('Продукт создан, но не удалось открыть его карточку')
      }

      if (onCreated) {
        onCreated(productId)
      } else {
        router.push(`/products/${encodeURIComponent(productId)}`)
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const serializedTemplateStageOverrides = useMemo(
    () =>
      JSON.stringify(
        selectedTemplateStages.map((stage) => ({
          id: stage.id,
          stageTemplateId: stage.stageTemplateId,
          stageOrder: stage.stageOrder,
          stageName: stage.stageName,
          plannedDate: serializeDateOnly(stage.plannedDate),
          durationDays: stage.durationDays ?? null,
          participatesInAutoshift: stage.participatesInAutoshift,
          startTrigger: stage.startTrigger,
          startDelayDays: stage.startDelayDays,
          startReferenceStageOrder: stage.startReferenceStageOrder,
          subStages: normalizeTemplateChecklistItems(stage.subStages),
        }))
      ),
    [selectedTemplateStages]
  )

  const updateTemplateTelegramDraft = (
    stageId: string,
    eventType: TemplateTelegramEventType,
    patch: Partial<TemplateTelegramDraft>
  ) => {
    setTemplateTelegramDrafts((prev) => ({
      ...prev,
      [getTemplateTelegramDraftKey(stageId, eventType)]: {
        ...getTemplateTelegramDraft(prev, stageId, eventType),
        ...patch,
      },
    }))
  }

  const updateSelectedTemplateTelegramDraft = (
    stageId: string,
    eventType: TemplateTelegramEventType,
    patch: Partial<TemplateTelegramDraft>
  ) => {
    setSelectedTemplateTelegramDrafts((prev) => ({
      ...prev,
      [getTemplateTelegramDraftKey(stageId, eventType)]: {
        ...getTemplateTelegramDraft(prev, stageId, eventType),
        ...patch,
      },
    }))
  }

  const renderStageStartRuleControls = <T extends {
    id: string
    stageName: string
    startTrigger?: StageStartTrigger
    startDelayDays?: number | null
    startReferenceStageOrder?: number | null
  }>(
    stage: T,
    index: number,
    stages: T[],
    onChange: (stageId: string, patch: Partial<T>) => void
  ) => {
    const trigger = normalizeStageStartTrigger(stage.startTrigger, index)
    const requiresReference = trigger === 'STAGE_STARTED' || trigger === 'STAGE_COMPLETED'
    const referenceOrder = normalizeStageStartReferenceOrder(stage.startReferenceStageOrder)

    return (
      <details className="group rounded-[18px] bg-background/40">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 marker:hidden">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
            <Zap className="h-4 w-4 flex-shrink-0 text-primary" />
            <span className="truncate">Дополнительно: автостарт</span>
          </span>
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-3 px-3 pb-3 pt-1 sm:grid-cols-[minmax(0,1fr)_96px] xl:grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)]">
          <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
            Условие запуска
            <select
              value={trigger}
              onChange={(event) => {
                const nextTrigger = event.target.value as StageStartTrigger
                onChange(stage.id, {
                  startTrigger: nextTrigger,
                  startReferenceStageOrder:
                    nextTrigger === 'STAGE_STARTED' || nextTrigger === 'STAGE_COMPLETED'
                      ? referenceOrder ?? Math.max(0, index - 1)
                      : null,
                } as Partial<T>)
              }}
              className="input h-10 w-full min-w-0 py-1 text-sm"
            >
              {STAGE_START_TRIGGER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
            Через дней
            <input
              type="number"
              min={0}
              step={1}
              value={normalizeStageStartDelayDays(stage.startDelayDays)}
              onChange={(event) =>
                onChange(stage.id, {
                  startDelayDays: normalizeStageStartDelayDays(event.target.value),
                } as Partial<T>)
              }
              className="input h-10 w-full min-w-0 py-1 text-sm"
            />
          </label>

          <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2 xl:col-span-1">
            Опорный этап
            <select
              value={requiresReference ? referenceOrder ?? '' : ''}
              onChange={(event) =>
                onChange(stage.id, {
                  startReferenceStageOrder: normalizeStageStartReferenceOrder(event.target.value),
                } as Partial<T>)
              }
              disabled={!requiresReference}
              className="input h-10 w-full min-w-0 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">{requiresReference ? 'Выберите этап' : 'Не требуется'}</option>
              {stages.map((candidate, candidateIndex) => {
                if (candidateIndex === index) return null

                return (
                  <option key={candidate.id} value={candidateIndex}>
                    {candidateIndex + 1}. {candidate.stageName || 'Без названия'}
                  </option>
                )
              })}
            </select>
          </label>
        </div>
      </details>
    )
  }

  const renderTemplateChecklist = (
    stageId: string,
    items: TemplateChecklistItem[] = [],
    onAdd: (stageId: string) => void,
    onUpdate: (stageId: string, itemId: string, patch: Partial<TemplateChecklistItem>) => void,
    onRemove: (stageId: string, itemId: string) => void
  ) => (
    <div className="space-y-3 rounded-[20px] bg-background/35 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ListChecks className="h-4 w-4 text-primary" />
            Подэтапы
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {items.length > 0 ? `${items.length} в шаблоне` : 'Добавьте пункты, которые нужно закрывать внутри этапа'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onAdd(stageId)}
          className="btn-secondary h-9 rounded-[14px] px-3 text-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          Подэтап
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[16px] bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
          Подэтапов пока нет
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const availableRecipients = telegramRecipients.filter((recipient) => recipient.type === item.telegramRecipientType)
            const selectedRecipient = availableRecipients.find((recipient) => recipient.id === item.telegramRecipientId)
            const telegramStatus = !item.notifyOnComplete
              ? 'Выключено'
              : selectedRecipient?.name || 'Нужен получатель'

            return (
              <div
                key={item.id}
                className="grid gap-3 rounded-[16px] bg-card/70 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(150px,180px)_minmax(150px,180px)_44px]"
              >
                <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                  Подэтап {index + 1}
                  <input
                    type="text"
                    value={item.name}
                    onChange={(event) => onUpdate(stageId, item.id, { name: event.target.value })}
                    className="input h-10 w-full min-w-0 py-1 text-sm"
                    placeholder="Название подэтапа"
                  />
                </label>

                <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                  Ответственный
                  <select
                    value={item.responsibleId || ''}
                    onChange={(event) => onUpdate(stageId, item.id, { responsibleId: event.target.value || null })}
                    className="input h-10 w-full min-w-0 py-1 text-sm"
                  >
                    <option value="">Не выбран</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                  Telegram
                  <span className="flex h-10 w-full min-w-0 items-center justify-between gap-3 rounded-[14px] border border-border/60 bg-background px-3 text-sm text-foreground">
                    <span className="truncate">{telegramStatus}</span>
                    <input
                      type="checkbox"
                      checked={item.notifyOnComplete}
                      onChange={(event) => onUpdate(stageId, item.id, { notifyOnComplete: event.target.checked })}
                      className="h-4 w-4 flex-shrink-0 rounded border-border text-primary focus:ring-ring"
                    />
                  </span>
                </label>

                <div className="flex items-end justify-end lg:justify-start">
                  <button
                    type="button"
                    onClick={() => onRemove(stageId, item.id)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] border border-red-100 text-red-500 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                    title="Удалить подэтап"
                    aria-label={`Удалить подэтап ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <details className="group lg:col-span-4">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] bg-primary/5 px-3 py-2 text-sm text-foreground transition hover:bg-primary/10 [&::-webkit-details-marker]:hidden">
                    <span className="flex min-w-0 items-center gap-2">
                      <Bell className="h-4 w-4 flex-shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">Telegram после завершения подэтапа</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.notifyOnComplete ? telegramStatus : 'Уведомление выключено'}
                        </span>
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground transition group-open:rotate-180" />
                  </summary>

                  <div className="mt-3 rounded-[16px] bg-background/55 p-3">
                    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,150px)_minmax(0,1fr)_minmax(0,170px)]">
                      <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                        Тип
                        <select
                          value={item.telegramRecipientType}
                          onChange={(event) =>
                            onUpdate(stageId, item.id, {
                              telegramRecipientType: event.target.value as 'user' | 'chat',
                              telegramRecipientId: '',
                            })
                          }
                          className="input h-10 w-full min-w-0 py-1 text-sm"
                        >
                          <option value="user">Личный Telegram</option>
                          <option value="chat">Групповой чат</option>
                        </select>
                      </label>

                      <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                        Получатель
                        <select
                          value={item.telegramRecipientId}
                          onChange={(event) => onUpdate(stageId, item.id, { telegramRecipientId: event.target.value })}
                          disabled={availableRecipients.length === 0}
                          className="input h-10 w-full min-w-0 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="">Не выбран</option>
                          {availableRecipients.map((recipient) => (
                            <option key={recipient.id} value={recipient.id}>
                              {recipient.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                        Сообщение
                        <select
                          value={item.telegramMessageTemplate}
                          onChange={(event) => onUpdate(stageId, item.id, { telegramMessageTemplate: event.target.value })}
                          className="input h-10 w-full min-w-0 py-1 text-sm"
                        >
                          <option value="substage_completed_simple">Стандартное</option>
                          <option value="custom">Свой текст</option>
                        </select>
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="badge status-chip-neutral px-2 py-1">
                        {telegramRecipientsLoading ? 'Получатели загружаются' : `${availableRecipients.length} доступно`}
                      </span>
                      {selectedRecipient && (
                        <span className="badge status-chip-info px-2 py-1">Выбран: {selectedRecipient.name}</span>
                      )}
                      {item.notifyOnComplete && !item.telegramRecipientId && (
                        <span className="badge status-chip-danger px-2 py-1">Выберите получателя</span>
                      )}
                    </div>

                    {item.telegramMessageTemplate === 'custom' && (
                      <label className="mt-3 block min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                        Свой текст
                        <textarea
                          value={item.telegramCustomMessage}
                          onChange={(event) =>
                            onUpdate(stageId, item.id, {
                              telegramCustomMessage: event.target.value,
                              telegramMessageTemplate: 'custom',
                            })
                          }
                          className="input min-h-[92px] w-full resize-y rounded-[16px] py-2 text-sm"
                          placeholder="Подэтап закрыт: {substage_name}\nПродукт: {product_name}"
                        />
                      </label>
                    )}
                  </div>
                </details>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  function renderTemplateStageTelegramSettings(
    stage: { id: string; stageName: string },
    drafts: Record<string, TemplateTelegramDraft>,
    onChange: (stageId: string, eventType: TemplateTelegramEventType, patch: Partial<TemplateTelegramDraft>) => void
  ) {
    return (
      <div className="grid min-w-0 gap-3 xl:grid-cols-2">
        {TEMPLATE_TELEGRAM_EVENTS.map((eventOption) => {
          const draft = getTemplateTelegramDraft(drafts, stage.id, eventOption.value)
          const recipients = telegramRecipients.filter((recipient) => recipient.type === draft.recipientType)
          const selectedRecipient = recipients.find((recipient) => recipient.id === draft.recipientId)
          const isStartEvent = eventOption.value === 'stage_started'
          const Icon = isStartEvent ? Zap : Bell
          const title = isStartEvent ? 'Telegram о начале этапа' : 'Telegram после завершения этапа'
          const helper = isStartEvent
            ? `Сработает, когда этап «${stage.stageName || 'Без названия'}» будет запущен.`
            : `Сработает, когда этап «${stage.stageName || 'Без названия'}» будет закрыт.`

          return (
            <div key={eventOption.value} className="min-w-0 rounded-[20px] bg-background/40 p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Icon className="h-4 w-4 text-primary" />
                    {title}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
                </div>
                <label className="inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-[14px] border border-border/70 bg-card px-3 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={draft.isEnabled}
                    onChange={(event) => onChange(stage.id, eventOption.value, { isEnabled: event.target.checked })}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                  />
                  Отправлять
                </label>
              </div>

              {draft.isEnabled && (
                <>
                  {telegramRecipients.length === 0 && !telegramRecipientsLoading && (
                    <div className="mt-3 rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">
                      Получателей пока нет. Добавьте «Мой Telegram» в настройках уведомлений продукта, затем выберите его в шаблоне.
                    </div>
                  )}

                  <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-[minmax(0,150px)_minmax(0,1fr)_minmax(0,150px)] xl:grid-cols-1">
                    <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                      Тип
                      <select
                        value={draft.recipientType}
                        onChange={(event) => onChange(stage.id, eventOption.value, { recipientType: event.target.value as 'user' | 'chat', recipientId: '' })}
                        className="input h-10 w-full min-w-0 py-1 text-sm"
                      >
                        <option value="user">Личный Telegram</option>
                        <option value="chat">Групповой чат</option>
                      </select>
                    </label>

                    <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                      Получатель
                      <select
                        value={draft.recipientId}
                        onChange={(event) => onChange(stage.id, eventOption.value, { recipientId: event.target.value })}
                        disabled={recipients.length === 0}
                        className="input h-10 w-full min-w-0 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="">Не выбран</option>
                        {recipients.map((recipient) => (
                          <option key={recipient.id} value={recipient.id}>
                            {recipient.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                      Сообщение
                      <select
                        value={draft.messageTemplate}
                        onChange={(event) => onChange(stage.id, eventOption.value, { messageTemplate: event.target.value })}
                        className="input h-10 w-full min-w-0 py-1 text-sm"
                      >
                        <option value={eventOption.defaultTemplate}>Стандартное</option>
                        <option value="custom">Свой текст</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="badge status-chip-neutral px-2 py-1">
                      {telegramRecipientsLoading ? 'Получатели загружаются' : `${recipients.length} доступно`}
                    </span>
                    {selectedRecipient && (
                      <span className="badge status-chip-info px-2 py-1">Выбран: {selectedRecipient.name}</span>
                    )}
                    {!draft.recipientId && (
                      <span className="badge status-chip-danger px-2 py-1">Выберите получателя</span>
                    )}
                  </div>

                  {draft.messageTemplate === 'custom' && (
                    <label className="mt-3 block min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
                      Свой текст уведомления
                      <textarea
                        value={draft.customMessage}
                        onChange={(event) => onChange(stage.id, eventOption.value, { customMessage: event.target.value, messageTemplate: 'custom' })}
                        className="input min-h-[96px] w-full resize-y rounded-[16px] py-2 text-sm"
                        placeholder={`${eventOption.label}: {stage_name}\nПродукт: {product_name}`}
                      />
                    </label>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  function renderTemplateStageCard<T extends TemplateStageCardLike>(params: {
    stage: T
    index: number
    stages: T[]
    onUpdate: (stageId: string, patch: Partial<T>) => void
    onRemove?: (stageId: string) => void
    onAddSubStage: (stageId: string) => void
    onUpdateSubStage: (stageId: string, itemId: string, patch: Partial<TemplateChecklistItem>) => void
    onRemoveSubStage: (stageId: string, itemId: string) => void
    telegramDrafts: Record<string, TemplateTelegramDraft>
    onTelegramChange: (stageId: string, eventType: TemplateTelegramEventType, patch: Partial<TemplateTelegramDraft>) => void
  }) {
    const { stage, index, stages, onUpdate, onRemove, onAddSubStage, onUpdateSubStage, onRemoveSubStage, telegramDrafts, onTelegramChange } = params
    const subStages = stage.subStages || []
    const durationValue = stage.durationDays ?? stage.effectiveDurationDays ?? 1

    return (
      <div className="rounded-[24px] border border-border/55 bg-muted/45 p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[16px] bg-primary text-sm font-semibold text-primary-foreground">
              {index + 1}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">
                {stage.stageName.trim() || `Этап ${index + 1}`}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {subStages.length > 0
                  ? `${subStages.length} подэтапов · Telegram настраивается ниже`
                  : 'Добавьте название этапа и подэтапы, если они нужны'}
              </p>
            </div>
          </div>

          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(stage.id)}
              className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[14px] border border-red-100 text-red-500 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
              title="Удалить этап"
              aria-label={`Удалить этап ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,190px)_minmax(0,130px)_minmax(0,150px)]">
          <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
            Название этапа
            <input
              type="text"
              value={stage.stageName}
              onChange={(event) => onUpdate(stage.id, { stageName: event.target.value } as Partial<T>)}
              className="input h-11 w-full min-w-0 py-1 text-sm"
              list="stage-suggestions"
              placeholder="Например: Поиск поставщика"
            />
          </label>

          <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
            Дата этапа
            <DatePicker
              value={stage.plannedDate}
              onChange={(date) => onUpdate(stage.id, { plannedDate: date } as Partial<T>)}
              inputClassName="h-11 w-full text-sm"
              panelClassName="w-[320px]"
              placeholder="Без даты"
            />
          </label>

          <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
            Дней
            <input
              type="number"
              min={1}
              step={1}
              value={durationValue}
              onChange={(event) =>
                onUpdate(stage.id, {
                  durationDays: event.target.value ? Math.max(1, Number(event.target.value)) : null,
                } as Partial<T>)
              }
              className="input h-11 w-full min-w-0 py-1 text-sm"
              placeholder="1"
            />
          </label>

          <label className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground">
            Автосдвиг
            <span className="flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-[16px] border border-border/70 bg-card px-3 text-sm text-foreground">
              <span className="truncate">{stage.participatesInAutoshift ? 'Включён' : 'Выключен'}</span>
              <input
                type="checkbox"
                checked={stage.participatesInAutoshift}
                onChange={(event) => onUpdate(stage.id, { participatesInAutoshift: event.target.checked } as Partial<T>)}
                className="h-4 w-4 flex-shrink-0 rounded border-border text-primary focus:ring-ring"
              />
            </span>
          </label>
        </div>

        <div className="mt-4">
          {renderTemplateChecklist(
            stage.id,
            subStages,
            onAddSubStage,
            onUpdateSubStage,
            onRemoveSubStage
          )}
        </div>

        <div className="mt-4">
          {renderTemplateStageTelegramSettings(stage, telegramDrafts, onTelegramChange)}
        </div>

        <div className="mt-4">
          {renderStageStartRuleControls(stage, index, stages, onUpdate)}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="name" value={form.name} />
      <input type="hidden" name="country" value={form.country} />
      <input type="hidden" name="category" value={form.category} />
      <input type="hidden" name="sku" value={form.sku} />
      <input type="hidden" name="priority" value={form.priority} />
      <input type="hidden" name="responsibleId" value={form.responsibleId} />
      <input type="hidden" name="notes" value={form.notes} />
      <input type="hidden" name="productTemplateId" value={form.productTemplateId} />
      <input type="hidden" name="templateStagesOverride" value={serializedTemplateStageOverrides} />
      <div className="space-y-5 rounded-[28px] bg-card/30 p-4 sm:p-5">
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-4 rounded-[24px] bg-muted/35 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Layers3 className="h-4 w-4 text-primary" />
                Шаблон этапов
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Выбери готовый шаблон, чтобы этапы и даты подтянулись сразу при создании продукта.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowTemplateBuilder((prev) => !prev)
                setTemplateError('')
              }}
              className="btn-secondary text-sm"
            >
              <Plus className="w-4 h-4" />
              Создать шаблон
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Использовать шаблон</label>
            <div ref={templateSelectRef} className="relative">
              <button
                type="button"
                onClick={() => setTemplateSelectOpen((prev) => !prev)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-card/95"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{selectedTemplateLabel}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {selectedTemplate
                      ? 'Готовый шаблон этапов для быстрого старта'
                      : 'Создать продукт со стандартным набором этапов'}
                  </div>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    templateSelectOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {templateSelectOpen && (
                <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-border/70 bg-popover shadow-2xl shadow-black/20">
                  <div className="max-h-72 overflow-y-auto p-2">
                    <button
                      type="button"
                      onClick={() => handleSelectTemplate('')}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                        !form.productTemplateId
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-accent'
                      }`}
                    >
                      <Check className={`h-4 w-4 ${!form.productTemplateId ? 'opacity-100' : 'opacity-0'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">Стандартный набор этапов</div>
                        <div className={`${!form.productTemplateId ? 'text-primary-foreground/80' : 'text-muted-foreground'} mt-0.5 text-xs`}>
                          Создать продукт без отдельного шаблона
                        </div>
                      </div>
                    </button>

                    {templates.length > 0 && <div className="my-2 border-t border-border/60" />}

                    {templates.map((template) => {
                      const isSelected = template.id === form.productTemplateId

                      return (
                        <div
                          key={template.id}
                          className={`flex items-center gap-2 rounded-xl px-2 py-1 ${
                            isSelected ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectTemplate(template.id)}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-2 text-left"
                          >
                            <Check className={`h-4 w-4 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{template.name}</div>
                              <div className={`${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'} mt-0.5 text-xs`}>
                                {template.stages.length} этапов
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setTemplateSelectOpen(false)
                              setTemplateToDelete(template)
                            }}
                            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition ${
                              isSelected
                                ? 'border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10'
                                : 'border-border/60 text-red-500 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10'
                            }`}
                            title={`Удалить шаблон ${template.name}`}
                            aria-label={`Удалить шаблон ${template.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Если шаблон не выбран, продукт создастся со всеми текущими глобальными этапами.
            </p>
            {templateDeleteError && (
              <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {templateDeleteError}
              </div>
            )}
          </div>

          {selectedTemplate && (
            <div className="space-y-4 rounded-[22px] bg-background/30 p-3 sm:p-4">
              <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Название шаблона
                    </label>
                    <input
                      type="text"
                      value={selectedTemplateName}
                      onChange={(e) => setSelectedTemplateName(e.target.value)}
                      className="input h-10 w-full text-sm"
                      placeholder="Название шаблона"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Описание
                    </label>
                    <input
                      type="text"
                      value={selectedTemplateDescription}
                      onChange={(e) => setSelectedTemplateDescription(e.target.value)}
                      className="input h-10 w-full text-sm"
                      placeholder="Описание шаблона"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-start gap-2 xl:justify-end">
                  <div className="pt-2 text-xs text-muted-foreground">{selectedTemplateStages.length} этапов</div>
                  <button
                    type="button"
                    onClick={handleUpdateSelectedTemplate}
                    disabled={selectedTemplateSaving}
                    className="btn-secondary h-9 px-3 text-sm"
                  >
                    <Save className="h-4 w-4" />
                    {selectedTemplateSaving ? 'Сохраняем...' : 'Сохранить'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateSelectOpen(false)
                      setTemplateToDelete(selectedTemplate)
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 text-red-500 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                    title={`Удалить шаблон ${selectedTemplate.name}`}
                    aria-label={`Удалить шаблон ${selectedTemplate.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {selectedTemplateError && (
                <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                  {selectedTemplateError}
                </div>
              )}
              <div className="space-y-3">
                {selectedTemplateStages.map((stage, index) => (
                  <div key={stage.id}>
                    {renderTemplateStageCard({
                      stage,
                      index,
                      stages: selectedTemplateStages,
                      onUpdate: updateSelectedTemplateStage,
                      onAddSubStage: addSelectedTemplateChecklistItem,
                      onUpdateSubStage: updateSelectedTemplateChecklistItem,
                      onRemoveSubStage: removeSelectedTemplateChecklistItem,
                      telegramDrafts: selectedTemplateTelegramDrafts,
                      onTelegramChange: updateSelectedTemplateTelegramDraft,
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showTemplateBuilder && (
            <div className="space-y-4 rounded-[22px] bg-background/30 p-3 sm:p-4">
              <div>
                <div className="text-sm font-semibold text-foreground">Новый шаблон этапов</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Укажи этапы в нужном порядке. Даты можно заполнить сразу, но это необязательно.
                </p>
              </div>

              {templateError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                  {templateError}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Название шаблона <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={templateDraftName}
                    onChange={(e) => setTemplateDraftName(e.target.value)}
                    className="input w-full"
                    placeholder="Например: Запуск в Китае"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Описание</label>
                  <input
                    type="text"
                    value={templateDraftDescription}
                    onChange={(e) => setTemplateDraftDescription(e.target.value)}
                    className="input w-full"
                    placeholder="Короткая подсказка для команды"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {templateStages.map((stage, index) => (
                  <div key={stage.id}>
                    {renderTemplateStageCard({
                      stage,
                      index,
                      stages: templateStages,
                      onUpdate: updateTemplateStage,
                      onRemove: removeTemplateStage,
                      onAddSubStage: addTemplateChecklistItem,
                      onUpdateSubStage: updateTemplateChecklistItem,
                      onRemoveSubStage: removeTemplateChecklistItem,
                      telegramDrafts: templateTelegramDrafts,
                      onTelegramChange: updateTemplateTelegramDraft,
                    })}
                  </div>
                ))}
              </div>

              <button type="button" onClick={addTemplateStage} className="btn-secondary text-sm">
                <Plus className="w-4 h-4" />
                Добавить этап
              </button>

              <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
                <button type="button" onClick={resetTemplateBuilder} className="btn-secondary text-sm">
                  Отмена
                </button>
                <button type="button" onClick={handleCreateTemplate} disabled={templateSaving} className="btn-primary text-sm">
                  <Save className="w-4 h-4" />
                  {templateSaving ? 'Сохраняем шаблон...' : 'Сохранить шаблон'}
                </button>
              </div>
            </div>
          )}

          <datalist id="stage-suggestions">
            {stageSuggestions.map((stage) => (
              <option key={stage.id} value={stage.name} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Название продукта <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className="input w-full"
            placeholder="Например: Увлажняющий крем для лица 50мл"
            autoFocus
            required
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Страна производства</label>
            <input
              type="text"
              value={form.country}
              onChange={(e) => update('country', e.target.value)}
              className="input w-full"
              placeholder="Китай"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Категория</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
              className="input w-full"
              placeholder="Уход за лицом"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Артикул (SKU)</label>
            <input
              type="text"
              value={form.sku}
              onChange={(e) => update('sku', e.target.value)}
              className="input w-full"
              placeholder="MONA-001"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Приоритет</label>
            <select
              value={form.priority}
              onChange={(e) => update('priority', e.target.value)}
              className="input w-full"
            >
              {PRIORITIES.map((priority) => (
                <option key={priority.value} value={priority.value}>
                  {priority.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Ответственный</label>
          <select
            value={form.responsibleId}
            onChange={(e) => update('responsibleId', e.target.value)}
            className="input w-full"
          >
            <option value="">Не назначен</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Заметки</label>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className="input w-full min-h-[80px] resize-y"
            placeholder="Дополнительная информация..."
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        {mode === 'modal' ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-[15px] font-medium text-primary transition-colors hover:bg-accent"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад
          </button>
        ) : (
          <Link
            href={returnTo}
            className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-[15px] font-medium text-primary transition-colors hover:bg-accent"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад
          </Link>
        )}
        <button type="submit" disabled={saving} className="btn-primary">
          <Save className="w-4 h-4" />
          {saving ? 'Создание...' : 'Создать продукт'}
        </button>
      </div>

      <ConfirmDialog
        open={Boolean(templateToDelete)}
        title="Удалить шаблон?"
        description={
          templateToDelete
            ? `Шаблон «${templateToDelete.name}» будет удалён из системы. У уже созданных продуктов данные останутся, но шаблон больше нельзя будет выбрать.`
            : ''
        }
        confirmLabel="Удалить шаблон"
        loading={templateDeleting}
        onConfirm={handleDeleteTemplate}
        onCancel={() => {
          if (templateDeleting) return
          setTemplateToDelete(null)
        }}
      />
    </form>
  )
}

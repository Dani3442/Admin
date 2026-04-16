'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Layers3, Plus, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { DatePicker } from '@/components/ui/DatePicker'
import type { ProductTemplateData, ProductTemplateStageData } from '@/types'
import { formatDate } from '@/lib/utils'
import { applySequentialStageDateOverride, buildSequentialStageSchedule } from '@/lib/stage-schedule'

const PRIORITIES = [
  { value: 'CRITICAL', label: 'Критический' },
  { value: 'HIGH', label: 'Высокий' },
  { value: 'MEDIUM', label: 'Средний' },
  { value: 'LOW', label: 'Низкий' },
]

interface TemplateDraftStage {
  id: string
  stageName: string
  plannedDate: Date | null
  durationDays: number | null
  effectiveDurationDays?: number | null
  participatesInAutoshift: boolean
}

interface SelectedTemplateStageOverride extends ProductTemplateStageData {
  effectiveDurationDays?: number | null
}

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
  }
}

function recalculateDraftStages(stages: TemplateDraftStage[]) {
  return buildSequentialStageSchedule(
    stages.map((stage) => ({
      ...stage,
      stageTemplateDurationDays: null,
    }))
  ).map((stage) => ({
    id: stage.id,
    stageName: stage.stageName,
    plannedDate: stage.plannedDate,
    durationDays: stage.durationDays ?? null,
    effectiveDurationDays: stage.effectiveDurationDays,
    participatesInAutoshift: stage.participatesInAutoshift,
  }))
}

function recalculateSelectedTemplateStages(stages: SelectedTemplateStageOverride[]) {
  return buildSequentialStageSchedule(
    stages.map((stage) => ({
      ...stage,
      stageTemplateDurationDays: stage.stageTemplateDurationDays ?? null,
    }))
  ).map((stage) => ({
    ...stage,
    durationDays: stage.durationDays ?? null,
    effectiveDurationDays: stage.effectiveDurationDays,
  }))
}

function hydrateSelectedTemplateStages(stages: ProductTemplateStageData[]) {
  return recalculateSelectedTemplateStages(
    stages.map((stage) => ({
      ...stage,
      plannedDate: stage.plannedDate ? new Date(stage.plannedDate) : null,
      durationDays: stage.durationDays ?? null,
    }))
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
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const [templateDraftName, setTemplateDraftName] = useState('')
  const [templateDraftDescription, setTemplateDraftDescription] = useState('')
  const [templateStages, setTemplateStages] = useState<TemplateDraftStage[]>([createDraftStage(0)])
  const [selectedTemplateStages, setSelectedTemplateStages] = useState<SelectedTemplateStageOverride[]>([])

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

  useEffect(() => {
    if (!selectedTemplate) {
      setSelectedTemplateStages([])
      return
    }

    setSelectedTemplateStages(
      hydrateSelectedTemplateStages(selectedTemplate.stages)
    )
  }, [selectedTemplate])

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

        if ('plannedDate' in patch && targetIndex >= 0) {
          return applySequentialStageDateOverride(nextStages, targetIndex, patch.plannedDate ?? null).map((stage) => ({
            id: stage.id,
            stageName: stage.stageName,
            plannedDate: stage.plannedDate,
            durationDays: stage.durationDays ?? null,
            effectiveDurationDays: stage.effectiveDurationDays,
            participatesInAutoshift: stage.participatesInAutoshift,
          }))
        }

        if (nextStages[0]?.plannedDate === null) {
          return nextStages.map((stage) => ({ ...stage, plannedDate: null, effectiveDurationDays: null }))
        }

        return recalculateDraftStages(nextStages)
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

        if ('plannedDate' in patch && targetIndex >= 0) {
          return applySequentialStageDateOverride(nextStages, targetIndex, patch.plannedDate ?? null).map((stage) => ({
            ...stage,
            durationDays: stage.durationDays ?? null,
            effectiveDurationDays: stage.effectiveDurationDays,
          }))
        }

        if (nextStages[0]?.plannedDate === null) {
          return nextStages.map((stage) => ({ ...stage, plannedDate: null, effectiveDurationDays: null }))
        }

        return recalculateSelectedTemplateStages(nextStages)
      }
    )
  }

  const addTemplateStage = () => {
    setTemplateStages((prev) => recalculateDraftStages([...prev, createDraftStage(prev.length)]))
  }

  const removeTemplateStage = (stageId: string) => {
    setTemplateStages((prev) => {
      if (prev.length === 1) {
        return [{ ...prev[0], stageName: '', plannedDate: null, durationDays: 1, effectiveDurationDays: 1, participatesInAutoshift: true }]
      }
      return recalculateDraftStages(prev.filter((stage) => stage.id !== stageId))
    })
  }

  const resetTemplateBuilder = () => {
    setTemplateDraftName('')
    setTemplateDraftDescription('')
    setTemplateStages([createDraftStage(0)])
    setTemplateError('')
    setShowTemplateBuilder(false)
  }

  const buildTemplateDraftPayload = () => {
    const normalizedName = templateDraftName.trim()
    const normalizedStages = templateStages
      .map((stage) => ({
        stageName: stage.stageName.trim(),
        plannedDate: stage.plannedDate,
        durationDays: stage.durationDays ?? null,
        participatesInAutoshift: stage.participatesInAutoshift,
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
            plannedDate: stage.plannedDate ? stage.plannedDate.toISOString() : null,
            durationDays: stage.durationDays ?? null,
            participatesInAutoshift: stage.participatesInAutoshift,
          })),
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось создать шаблон этапов')
      }

      setTemplates((prev) => [data, ...prev])
      setSelectedTemplateStages(hydrateSelectedTemplateStages(Array.isArray(data?.stages) ? data.stages : []))
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
            plannedDate: stage.plannedDate ? stage.plannedDate.toISOString() : null,
            durationDays: stage.durationDays ?? null,
            participatesInAutoshift: stage.participatesInAutoshift,
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
          plannedDate: stage.plannedDate ? stage.plannedDate.toISOString() : null,
          durationDays: stage.durationDays ?? null,
          participatesInAutoshift: stage.participatesInAutoshift,
        }))
      ),
    [selectedTemplateStages]
  )

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
      <div className="card p-6 space-y-5">
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-4 rounded-xl border border-border/70 bg-muted/55 p-4">
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
            <select
              value={form.productTemplateId}
              onChange={(e) => update('productTemplateId', e.target.value)}
              className="input w-full"
            >
              <option value="">Стандартный набор этапов</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({template.stages.length} этапов)
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Если шаблон не выбран, продукт создастся со всеми текущими глобальными этапами.
            </p>
          </div>

          {selectedTemplate && (
            <div className="rounded-xl border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{selectedTemplate.name}</div>
                  {selectedTemplate.description && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{selectedTemplate.description}</div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">{selectedTemplate.stages.length} этапов</div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {selectedTemplateStages.map((stage, index) => (
                  <div
                    key={stage.id}
                    className="grid gap-3 rounded-lg border border-border/60 px-3 py-3 md:grid-cols-[minmax(0,1fr)_220px_150px_120px]"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {index + 1}. {stage.stageName}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Дата этапа
                      </div>
                      <DatePicker
                        value={stage.plannedDate}
                        onChange={(date) => updateSelectedTemplateStage(stage.id, { plannedDate: date })}
                        inputClassName="h-9 w-full text-xs"
                        panelClassName="w-[320px]"
                        placeholder="Без даты"
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Количество дней
                      </div>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={stage.durationDays ?? stage.effectiveDurationDays ?? 1}
                        onChange={(e) =>
                          updateSelectedTemplateStage(stage.id, {
                            durationDays: e.target.value ? Math.max(1, Number(e.target.value)) : null,
                            ...(e.target.value ? {} : { durationDays: null }),
                          })
                        }
                        className="input h-9 w-full text-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <span className="flex h-9 w-full items-center justify-between rounded-lg border border-border/70 bg-card px-3 text-xs font-medium text-muted-foreground">
                        <span>Автосдвиг</span>
                        <input
                          type="checkbox"
                          checked={stage.participatesInAutoshift}
                          onChange={(e) =>
                            updateSelectedTemplateStage(stage.id, {
                              participatesInAutoshift: e.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                        />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showTemplateBuilder && (
            <div className="space-y-4 rounded-xl border border-primary/20 bg-card p-4">
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
                  <div key={stage.id} className="grid gap-3 rounded-xl border border-border/70 bg-muted/55 p-3 md:grid-cols-[minmax(0,1fr)_220px_140px_180px_44px]">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Этап {index + 1}
                      </label>
                      <input
                        type="text"
                        value={stage.stageName}
                        onChange={(e) => updateTemplateStage(stage.id, { stageName: e.target.value })}
                        className="input w-full"
                        list="stage-suggestions"
                        placeholder="Название этапа"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Дата этапа
                      </label>
                      <DatePicker
                        value={stage.plannedDate}
                        onChange={(date) => updateTemplateStage(stage.id, { plannedDate: date })}
                        inputClassName="h-11 text-sm"
                        panelClassName="w-[320px]"
                        placeholder="Необязательно"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Количество дней
                      </label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={stage.durationDays ?? stage.effectiveDurationDays ?? 1}
                        onChange={(e) =>
                          updateTemplateStage(stage.id, {
                            durationDays: e.target.value ? Math.max(1, Number(e.target.value)) : null,
                          })
                        }
                        className="input h-11 w-full"
                        placeholder="1"
                      />
                    </div>
                    <label className="flex items-end">
                      <span className="w-full rounded-[18px] border border-border/70 bg-card px-3 py-3 text-sm text-muted-foreground">
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Автосдвиг
                        </span>
                        <span className="flex items-center justify-between gap-3">
                          <span>{stage.participatesInAutoshift ? 'Включён' : 'Выключен'}</span>
                          <input
                            type="checkbox"
                            checked={stage.participatesInAutoshift}
                            onChange={(e) => updateTemplateStage(stage.id, { participatesInAutoshift: e.target.checked })}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                          />
                        </span>
                      </span>
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeTemplateStage(stage.id)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-100 text-red-500 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                        title="Удалить этап"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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

        <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-2 gap-4">
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
    </form>
  )
}

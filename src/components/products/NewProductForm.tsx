'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Layers3, Plus, Save, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { DatePicker } from '@/components/ui/DatePicker'
import { formatDate } from '@/lib/utils'
import type { ProductTemplateData } from '@/types'

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
  participatesInAutoshift: boolean
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

function createDraftStage(): TemplateDraftStage {
  return {
    id: `stage-${Math.random().toString(36).slice(2, 10)}`,
    stageName: '',
    plannedDate: null,
    participatesInAutoshift: true,
  }
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
  const [templateStages, setTemplateStages] = useState<TemplateDraftStage[]>([createDraftStage()])

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

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const updateTemplateStage = (stageId: string, patch: Partial<TemplateDraftStage>) => {
    setTemplateStages((prev) =>
      prev.map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage))
    )
  }

  const addTemplateStage = () => {
    setTemplateStages((prev) => [...prev, createDraftStage()])
  }

  const removeTemplateStage = (stageId: string) => {
    setTemplateStages((prev) => {
      if (prev.length === 1) {
        return [{ ...prev[0], stageName: '', plannedDate: null, participatesInAutoshift: true }]
      }
      return prev.filter((stage) => stage.id !== stageId)
    })
  }

  const resetTemplateBuilder = () => {
    setTemplateDraftName('')
    setTemplateDraftDescription('')
    setTemplateStages([createDraftStage()])
    setTemplateError('')
    setShowTemplateBuilder(false)
  }

  const handleCreateTemplate = async () => {
    const normalizedName = templateDraftName.trim()
    const normalizedStages = templateStages
      .map((stage) => ({
        stageName: stage.stageName.trim(),
        plannedDate: stage.plannedDate,
        participatesInAutoshift: stage.participatesInAutoshift,
      }))
      .filter((stage) => stage.stageName)

    if (!normalizedName) {
      setTemplateError('Укажите название шаблона')
      return
    }

    if (normalizedStages.length === 0) {
      setTemplateError('Добавьте хотя бы один этап в шаблон')
      return
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
            participatesInAutoshift: stage.participatesInAutoshift,
          })),
        }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось создать шаблон этапов')
      }

      setTemplates((prev) => [data, ...prev])
      setForm((prev) => ({ ...prev, productTemplateId: data.id }))
      resetTemplateBuilder()
    } catch (err: any) {
      setTemplateError(err.message || 'Не удалось создать шаблон этапов')
    } finally {
      setTemplateSaving(false)
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
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          productTemplateId: form.productTemplateId || null,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-slate-900 font-semibold">
                <Layers3 className="w-4 h-4 text-brand-600" />
                Шаблон этапов
              </div>
              <p className="text-sm text-slate-500 mt-1">
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Использовать шаблон</label>
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
            <p className="text-xs text-slate-400 mt-1.5">
              Если шаблон не выбран, продукт создастся со всеми текущими глобальными этапами.
            </p>
          </div>

          {selectedTemplate && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{selectedTemplate.name}</div>
                  {selectedTemplate.description && (
                    <div className="text-xs text-slate-500 mt-0.5">{selectedTemplate.description}</div>
                  )}
                </div>
                <div className="text-xs text-slate-400">{selectedTemplate.stages.length} этапов</div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {selectedTemplate.stages.map((stage, index) => (
                  <div key={stage.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-700">
                        {index + 1}. {stage.stageName}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 whitespace-nowrap">
                      {stage.plannedDate ? formatDate(stage.plannedDate) : 'Без даты'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showTemplateBuilder && (
            <div className="rounded-xl border border-brand-200 bg-white p-4 space-y-4">
              <div>
                <div className="text-sm font-semibold text-slate-800">Новый шаблон этапов</div>
                <p className="text-xs text-slate-500 mt-1">
                  Укажи этапы в нужном порядке. Даты можно заполнить сразу, но это необязательно.
                </p>
              </div>

              {templateError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {templateError}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Описание</label>
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
                  <div key={stage.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 md:grid-cols-[minmax(0,1fr)_220px_180px_44px]">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
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
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
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
                    <label className="flex items-end">
                      <span className="w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Автосдвиг
                        </span>
                        <span className="flex items-center justify-between gap-3">
                          <span>{stage.participatesInAutoshift ? 'Включён' : 'Выключен'}</span>
                          <input
                            type="checkbox"
                            checked={stage.participatesInAutoshift}
                            onChange={(e) => updateTemplateStage(stage.id, { participatesInAutoshift: e.target.checked })}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                        </span>
                      </span>
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeTemplateStage(stage.id)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-red-100 text-red-500 transition hover:bg-red-50"
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

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
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
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Название продукта <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className="input w-full"
            placeholder="Например: Увлажняющий крем для лица 50мл"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Страна производства</label>
            <input
              type="text"
              value={form.country}
              onChange={(e) => update('country', e.target.value)}
              className="input w-full"
              placeholder="Китай"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Категория</label>
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Артикул (SKU)</label>
            <input
              type="text"
              value={form.sku}
              onChange={(e) => update('sku', e.target.value)}
              className="input w-full"
              placeholder="MONA-001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Приоритет</label>
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
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Ответственный</label>
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
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Заметки</label>
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
            className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-[15px] font-medium text-brand-700 transition-colors hover:bg-brand-950/8"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад
          </button>
        ) : (
          <Link
            href={returnTo}
            className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-[15px] font-medium text-brand-700 transition-colors hover:bg-brand-950/8"
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

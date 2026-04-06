'use client'

import { useState } from 'react'
import { Zap, CheckCircle2, Circle, Info, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InfoPopover } from '@/components/ui/InfoPopover'

const ACTION_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  SHIFT_ALL_FOLLOWING: {
    label: 'Сдвиг всех следующих',
    desc: 'При изменении даты — сдвигает все последующие этапы на такое же кол-во дней',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  SHIFT_FINAL_DATE_ONLY: {
    label: 'Только финальная дата',
    desc: 'Смещает только итоговую дату готовности продукта',
    color: 'text-violet-600 bg-violet-50 border-violet-200',
  },
  MARK_AS_RISK: {
    label: 'Пометить как риск',
    desc: 'Помечает продукт как "под риском срыва сроков" без изменения дат',
    color: 'text-amber-600 bg-amber-50 border-amber-200',
  },
  RECALCULATE_BY_DURATIONS: {
    label: 'Пересчёт по длительностям',
    desc: 'Пересчитывает все следующие этапы на основе заданных нормативных длительностей',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  NOTIFY_ONLY: {
    label: 'Только уведомление',
    desc: 'Не изменяет даты, только отправляет уведомление ответственным',
    color: 'text-slate-600 bg-slate-50 border-slate-200',
  },
}

export function AutomationsClient({ automations: initial, stages }: { automations: any[]; stages: any[] }) {
  const [automations, setAutomations] = useState(initial)
  const [saving, setSaving] = useState<string | null>(null)

  const toggleAutomation = async (id: string, isActive: boolean) => {
    setSaving(id)
    try {
      const res = await fetch('/api/automations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: !isActive }),
      })
      const updated = await res.json()
      setAutomations((prev) => prev.map((a) => a.id === id ? updated : a))
    } finally {
      setSaving(null)
    }
  }

  const templates = automations.filter((a) => a.isTemplate)
  const custom = automations.filter((a) => !a.isTemplate)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Автоматизации</h1>
        <InfoPopover title="Что делает этот раздел">
          <p>Здесь выбирается логика автоматической реакции на изменение дат этапов.</p>
          <p>Одновременно активна только одна глобальная автоматизация.</p>
          <p>Ниже можно посмотреть шаблоны правил и понять, как именно система будет сдвигать сроки.</p>
        </InfoPopover>
      </div>

      {/* How it works */}
      <div className="card bg-brand-50 border-brand-200">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-brand-800 mb-1">Как работают автоматизации</h3>
            <p className="text-sm text-brand-700 leading-relaxed">
              Когда вы меняете дату любого этапа в таблице или карточке продукта — система автоматически применяет
              активную автоматизацию. Только <strong>одна</strong> автоматизация может быть активна одновременно.
              Активируйте нужную ниже.
            </p>
          </div>
        </div>
      </div>

      {/* Template Automations */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Глобальные правила (шаблоны)</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {templates.map((automation) => {
            const info = ACTION_LABELS[automation.actionType] || { label: automation.actionType, desc: '', color: 'text-slate-600 bg-slate-50 border-slate-200' }
            const isActive = automation.isActive
            const isSaving = saving === automation.id

            return (
              <div
                key={automation.id}
                className={cn(
                  'card border transition-all duration-200',
                  isActive ? 'ring-2 ring-brand-500 border-brand-200 bg-brand-50/30' : 'hover:shadow-card-hover'
                )}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={cn('badge border text-xs mt-0.5', info.color)}>{info.label}</div>
                  <div className="ml-auto flex-shrink-0">
                    <button
                      onClick={() => toggleAutomation(automation.id, isActive)}
                      disabled={isSaving}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                        isActive
                          ? 'bg-brand-600 text-white shadow-sm hover:bg-brand-700'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      )}
                    >
                      {isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                      {isSaving ? 'Сохраняем...' : isActive ? 'Активна' : 'Включить'}
                    </button>
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-slate-800 mb-1">{automation.name}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{automation.description || info.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Example */}
      <div className="card border-dashed border-2 border-slate-200">
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Пример работы</h3>
        <div className="space-y-2 text-sm text-slate-500">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
            <span>Вы меняете дату этапа «Рассчитать стоимость логистики» с <strong>11.04.2026</strong> на <strong>12.04.2026</strong></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 text-blue-600">2</span>
            <span>Активная автоматизация <strong>«{templates.find(a => a.isActive)?.name || 'выберите'}»</strong> запускается</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 text-emerald-600">3</span>
            <span>Все следующие этапы автоматически сдвигаются на <strong>+1 день</strong> (или по настроенной логике)</span>
          </div>
        </div>
      </div>

      {custom.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Правила для конкретных продуктов</h2>
          <div className="space-y-3">
            {custom.map((a) => {
              const info = ACTION_LABELS[a.actionType] || { label: a.actionType, desc: '', color: 'text-slate-600 bg-slate-50 border-slate-200' }
              return (
                <div key={a.id} className="card flex items-center gap-4">
                  <span className={cn('badge border text-xs', info.color)}>{info.label}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{a.name}</p>
                    <p className="text-xs text-slate-400 truncate">{a.description}</p>
                  </div>
                  <span className={cn('badge text-xs', a.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                    {a.isActive ? 'Активна' : 'Отключена'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

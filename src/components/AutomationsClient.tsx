'use client'

import { useState } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACTION_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  SHIFT_ALL_FOLLOWING: {
    label: 'Сдвиг всех следующих',
    desc: 'При изменении даты — сдвигает все последующие этапы на такое же кол-во дней',
    color: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-300',
  },
  SHIFT_FINAL_DATE_ONLY: {
    label: 'Только финальная дата',
    desc: 'Смещает только итоговую дату готовности продукта',
    color: 'text-violet-600 bg-violet-50 border-violet-200 dark:text-violet-300',
  },
  MARK_AS_RISK: {
    label: 'Пометить как риск',
    desc: 'Помечает продукт как "под риском срыва сроков" без изменения дат',
    color: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-300',
  },
  RECALCULATE_BY_DURATIONS: {
    label: 'Пересчёт по длительностям',
    desc: 'Пересчитывает все следующие этапы на основе заданных нормативных длительностей',
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-300',
  },
  NOTIFY_ONLY: {
    label: 'Только уведомление',
    desc: 'Не изменяет даты, только отправляет уведомление ответственным',
    color: 'text-muted-foreground bg-muted/75 border-border/70',
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
        <h1 className="text-2xl font-bold text-foreground">Автоматизации</h1>
      </div>

      {/* Template Automations */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Глобальные правила (шаблоны)</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {templates.map((automation) => {
            const info = ACTION_LABELS[automation.actionType] || { label: automation.actionType, desc: '', color: 'text-muted-foreground bg-muted/75 border-border/70' }
            const isActive = automation.isActive
            const isSaving = saving === automation.id
            const isDefaultCascade = automation.actionType === 'SHIFT_ALL_FOLLOWING'

            return (
              <div
                key={automation.id}
                className={cn('card transition-all duration-200', isActive ? 'ring-2 ring-ring/20 bg-accent/35' : 'hover:shadow-card-hover')}
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
                          : 'bg-muted text-muted-foreground hover:bg-accent'
                      )}
                    >
                      {isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                      {isSaving ? 'Сохраняем...' : isActive ? 'Активна' : 'Включить'}
                    </button>
                  </div>
                </div>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{automation.name}</h3>
                  {isDefaultCascade && (
                    <span className="badge bg-brand-100 text-brand-700 dark:text-blue-300">По умолчанию</span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{automation.description || info.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Example */}
      <div className="card">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Пример работы</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs">1</span>
            <span>Вы меняете дату этапа «Рассчитать стоимость логистики» с <strong>11.04.2026</strong> на <strong>12.04.2026</strong></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs text-blue-600 dark:text-blue-300">2</span>
            <span>Активная автоматизация <strong>«{templates.find(a => a.isActive)?.name || 'выберите'}»</strong> запускается</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-600 dark:text-emerald-300">3</span>
            <span>Все следующие этапы автоматически сдвигаются на <strong>+1 день</strong> (или по настроенной логике)</span>
          </div>
        </div>
      </div>

      {custom.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Правила для конкретных продуктов</h2>
          <div className="space-y-3">
            {custom.map((a) => {
              const info = ACTION_LABELS[a.actionType] || { label: a.actionType, desc: '', color: 'text-muted-foreground bg-muted/75 border-border/70' }
              return (
                <div key={a.id} className="card flex items-center gap-4">
                  <span className={cn('badge border text-xs', info.color)}>{info.label}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.description}</p>
                  </div>
                  <span className={cn('badge text-xs', a.isActive ? 'bg-emerald-100 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
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

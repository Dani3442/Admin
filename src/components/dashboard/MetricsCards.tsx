'use client'

import { Package, Clock, CheckCircle2, AlertTriangle, XCircle, TrendingUp, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MetricsCardsProps {
  metrics: {
    total: number
    inProgress: number
    completed: number
    atRisk: number
    delayed: number
    planned: number
    completionRate: number
    avgDaysDeviation: number
    dueSoon7: number
    dueSoon14: number
    dueSoon30: number
  }
}

export function DashboardMetricsCards({ metrics }: MetricsCardsProps) {
  const cards = [
    {
      label: 'Всего продуктов',
      value: metrics.total,
      icon: Package,
      color: 'text-slate-600',
      bg: 'bg-slate-50',
      border: 'border-slate-200',
    },
    {
      label: 'В работе',
      value: metrics.inProgress,
      icon: Clock,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
    },
    {
      label: 'Завершено',
      value: metrics.completed,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      sub: `${metrics.completionRate}% выполнено`,
    },
    {
      label: 'Под риском',
      value: metrics.atRisk,
      icon: AlertTriangle,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
    },
    {
      label: 'Просрочено',
      value: metrics.delayed,
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
    },
    {
      label: 'Отклонение',
      value: `${metrics.avgDaysDeviation}д`,
      icon: TrendingUp,
      color: metrics.avgDaysDeviation > 5 ? 'text-red-600' : 'text-slate-600',
      bg: metrics.avgDaysDeviation > 5 ? 'bg-red-50' : 'bg-slate-50',
      border: metrics.avgDaysDeviation > 5 ? 'border-red-200' : 'border-slate-200',
      sub: 'Среднее по датам',
    },
    {
      label: 'Срок через 7 дней',
      value: metrics.dueSoon7,
      icon: CalendarClock,
      color: metrics.dueSoon7 > 0 ? 'text-orange-600' : 'text-slate-500',
      bg: metrics.dueSoon7 > 0 ? 'bg-orange-50' : 'bg-slate-50',
      border: metrics.dueSoon7 > 0 ? 'border-orange-200' : 'border-slate-200',
      sub: `${metrics.dueSoon30} за 30 дней`,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon
        return (
          <div
            key={i}
            className={cn('bg-white rounded-xl border p-4 shadow-card transition-all duration-200 hover:shadow-card-hover', card.border)}
          >
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-3', card.bg)}>
              <Icon className={cn('w-4 h-4', card.color)} />
            </div>
            <div className={cn('text-2xl font-bold', card.color)}>{card.value}</div>
            <div className="text-xs text-slate-500 mt-1 font-medium">{card.label}</div>
            {card.sub && <div className="text-xs text-slate-400 mt-0.5">{card.sub}</div>}
          </div>
        )
      })}
    </div>
  )
}

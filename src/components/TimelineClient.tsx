'use client'

import { useState, useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, differenceInDays, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { cn, formatDate, detectStageOverlaps } from '@/lib/utils'
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { buildProductHref, getRouteWithSearch } from '@/lib/navigation'

interface ProductStage {
  id: string; stageName: string; stageOrder: number;
  dateValue: Date | null; isCompleted: boolean; isCritical: boolean; status: string
}

interface Product {
  id: string; name: string; finalDate: Date | null; progressPercent: number; riskScore: number
  responsible?: { name: string } | null
  stages: ProductStage[]
}

export function TimelineClient({ products }: { products: Product[] }) {
  const now = new Date()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [viewStart, setViewStart] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [search, setSearch] = useState('')
  const currentRoute = getRouteWithSearch(pathname, searchParams.toString())

  const viewEnd = addDays(viewStart, 89) // 3 months view
  const days = eachDayOfInterval({ start: viewStart, end: viewEnd })
  const weekdays = days.filter((_, i) => i % 7 === 0) // week markers

  const filtered = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const DAY_WIDTH = 12 // px per day
  const totalWidth = days.length * DAY_WIDTH

  const monthHeaders = useMemo(() => {
    const months: Array<{ label: string; start: number; width: number }> = []
    let current = ''
    let startIdx = 0
    days.forEach((day, i) => {
      const month = format(day, 'LLLL yyyy', { locale: ru })
      if (month !== current) {
        if (current) months.push({ label: current, start: startIdx * DAY_WIDTH, width: (i - startIdx) * DAY_WIDTH })
        current = month
        startIdx = i
      }
    })
    if (current) months.push({ label: current, start: startIdx * DAY_WIDTH, width: (days.length - startIdx) * DAY_WIDTH })
    return months
  }, [days])

  const getStageLeft = (date: Date | null): number | null => {
    if (!date) return null
    const idx = differenceInDays(date, viewStart)
    if (idx < 0 || idx >= days.length) return null
    return idx * DAY_WIDTH
  }

  const todayLeft = getStageLeft(now)

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Timeline</h1>
          <p className="text-slate-500 text-sm mt-0.5">Временная шкала продуктов и этапов (90 дней)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewStart(d => addDays(d, -30))} className="btn-secondary p-2">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-slate-600 font-medium min-w-36 text-center">
            {format(viewStart, 'MMM yyyy', { locale: ru })} – {format(viewEnd, 'MMM yyyy', { locale: ru })}
          </span>
          <button onClick={() => setViewStart(d => addDays(d, 30))} className="btn-secondary p-2">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setViewStart(new Date(now.getFullYear(), now.getMonth(), 1))} className="btn-secondary text-xs">
            Сегодня
          </button>
        </div>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input max-w-xs text-sm"
        placeholder="Фильтр по продукту..."
      />

      <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${200 + totalWidth}px` }}>
            {/* Header: Months */}
            <div className="flex border-b border-slate-100 bg-slate-50">
              <div className="w-48 flex-shrink-0 px-3 py-2 text-xs font-semibold text-slate-500 border-r border-slate-100">
                Продукт
              </div>
              <div className="relative flex-1" style={{ height: 28 }}>
                {monthHeaders.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex items-center px-2 text-xs font-medium text-slate-500 border-r border-slate-200 capitalize"
                    style={{ left: m.start, width: m.width }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Header: Days */}
            <div className="flex border-b border-slate-100 bg-slate-50">
              <div className="w-48 flex-shrink-0 border-r border-slate-100" />
              <div className="relative flex-1 h-5">
                {days.map((day, i) => {
                  const isWeekend = [0, 6].includes(day.getDay())
                  const isToday = isSameDay(day, now)
                  return (
                    <div
                      key={i}
                      className={cn(
                        'absolute top-0 h-full flex items-center justify-center text-[9px]',
                        isWeekend ? 'text-slate-300' : 'text-slate-400',
                        isToday ? 'text-brand-600 font-bold' : ''
                      )}
                      style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                    >
                      {day.getDate() === 1 || day.getDate() % 5 === 0 ? day.getDate() : ''}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Product Rows */}
            {filtered.map((product) => {
              const { overlappingIds, overlaps: productOverlaps } = detectStageOverlaps(product.stages)
              return (
              <div key={product.id} className="flex border-b border-slate-50 hover:bg-slate-50/60 group" style={{ height: 52 }}>
                {/* Name */}
                <div className="w-48 flex-shrink-0 px-3 py-2 border-r border-slate-100 flex flex-col justify-center">
                  <Link href={buildProductHref(product.id, currentRoute)} className="text-xs font-medium text-slate-700 hover:text-brand-700 truncate">
                    {product.name.length > 28 ? product.name.slice(0, 28) + '…' : product.name}
                  </Link>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="progress-bar flex-1">
                      <div className="progress-fill bg-brand-400" style={{ width: `${product.progressPercent}%` }} />
                    </div>
                    <span className="text-[9px] text-slate-400">{product.progressPercent}%</span>
                    {product.riskScore >= 40 && <AlertTriangle className="w-2.5 h-2.5 text-amber-500" />}
                    {productOverlaps.length > 0 && (
                      <span className="text-[9px] text-orange-600 font-medium" title={productOverlaps.map(o => `${o.fromName} → ${o.toName}`).join(', ')}>
                        ⚠{productOverlaps.length}
                      </span>
                    )}
                  </div>
                </div>

                {/* Gantt Area */}
                <div className="relative flex-1" style={{ height: 52 }}>
                  {/* Weekend backgrounds */}
                  {days.map((day, i) => (
                    [0, 6].includes(day.getDay()) && (
                      <div
                        key={i}
                        className="absolute top-0 h-full bg-slate-50"
                        style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                      />
                    )
                  ))}

                  {/* Today line */}
                  {todayLeft !== null && (
                    <div
                      className="absolute top-0 h-full border-l-2 border-brand-500 z-10 opacity-60"
                      style={{ left: todayLeft }}
                    />
                  )}

                  {/* Stage dots */}
                  {product.stages.map((stage) => {
                    const left = getStageLeft(stage.dateValue)
                    if (left === null) return null
                    const hasOverlap = overlappingIds.has(stage.id)
                    return (
                      <div
                        key={stage.id}
                        className={cn(
                          'absolute top-1/2 -translate-y-1/2 rounded-full border cursor-pointer transition-all hover:scale-125 hover:z-20',
                          hasOverlap ? 'w-3.5 h-3.5 bg-orange-400 border-orange-600 ring-2 ring-orange-300' :
                          stage.isCompleted ? 'w-3 h-3 bg-emerald-500 border-emerald-600' :
                          stage.isCritical ? 'w-3 h-3 bg-red-500 border-red-600' :
                          stage.dateValue && new Date(stage.dateValue) < now ? 'w-2.5 h-2.5 bg-red-400 border-red-500' :
                          'w-2.5 h-2.5 bg-blue-400 border-blue-500'
                        )}
                        style={{ left: left - 5, zIndex: hasOverlap ? 8 : 5 }}
                        title={`${stage.stageName}\n${formatDate(stage.dateValue)}${stage.isCritical ? '\n⚠️ Критичный' : ''}${hasOverlap ? '\n⚠️ Пересечение дат' : ''}`}
                      />
                    )
                  })}

                  {/* Final date diamond */}
                  {(() => {
                    const left = getStageLeft(product.finalDate)
                    if (left === null) return null
                    return (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rotate-45 bg-amber-500 border-2 border-amber-600 z-10"
                        style={{ left: left - 8 }}
                        title={`Финальная дата: ${formatDate(product.finalDate)}`}
                      />
                    )
                  })()}
                </div>
              </div>
              )
            })}

            {filtered.length === 0 && (
              <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
                Продукты не найдены
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-emerald-500" /> Выполнен</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-blue-400" /> Запланирован</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-red-500" /> Критичный / просрочен</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-orange-400 ring-2 ring-orange-300" /> Пересечение дат</div>
          <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rotate-45 bg-amber-500 border border-amber-600" /> Финальная дата</div>
          <div className="flex items-center gap-1.5"><div className="w-0.5 h-4 bg-brand-500" /> Сегодня</div>
        </div>
      </div>
    </div>
  )
}

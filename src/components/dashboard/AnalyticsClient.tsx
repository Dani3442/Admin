'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { DashboardMetricsCards } from './MetricsCards'
import { TrendingDown, Users, Globe } from 'lucide-react'

interface AnalyticsClientProps {
  data: {
    metrics: any
    statusData: any[]
    topBottlenecks: any[]
    progressBuckets: any[]
    countryStats: any[]
    responsibleStats: any[]
  }
  showHeader?: boolean
}

export function AnalyticsClient({ data, showHeader = true }: AnalyticsClientProps) {
  const tooltipStyle = {
    borderRadius: 16,
    border: '1px solid hsl(var(--border))',
    fontSize: 12,
    backgroundColor: 'hsl(var(--popover) / 0.96)',
    color: 'hsl(var(--popover-foreground))',
    boxShadow: '0 24px 50px -28px hsl(var(--shadow-color) / 0.55)',
  }

  return (
    <div className="space-y-6">
      {showHeader && (
        <>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Аналитика</h1>
          </div>
          <DashboardMetricsCards metrics={data.metrics} />
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {showHeader && (
          <>
            {/* Status Distribution */}
            <div className="card">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Распределение по статусам</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={data.statusData.filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                    {data.statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {data.statusData.filter(d => d.value > 0).map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="truncate">{item.name}</span>
                    <span className="ml-auto font-bold text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottlenecks */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-300" />
                <h3 className="text-sm font-semibold text-foreground">Проблемные этапы (задержки)</h3>
              </div>
              {data.topBottlenecks.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Задержек нет</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.topBottlenecks} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={{ stroke: 'hsl(var(--border))' }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={{ stroke: 'hsl(var(--border))' }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v}`, 'Задержек']} />
                    <Bar dataKey="count" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}

        {/* Progress Distribution */}
        <div className="card">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Распределение по прогрессу</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.progressBuckets}>
              <XAxis dataKey="range" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={{ stroke: 'hsl(var(--border))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={{ stroke: 'hsl(var(--border))' }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, 'Продуктов']} />
              <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Country */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">По стране производства</h3>
          </div>
          <div className="space-y-3">
            {data.countryStats.slice(0, 6).map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-24 flex-shrink-0 text-sm text-foreground">{item.country}</span>
                <div className="flex-1 progress-bar">
                  <div
                    className="progress-fill bg-primary"
                    style={{ width: `${data.metrics.total > 0 ? (item.total / data.metrics.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-semibold text-foreground">{item.total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Responsible Stats */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">По ответственным</h3>
        </div>
        <div className="space-y-3 lg:hidden">
          {data.responsibleStats.map((r, i) => (
            <div key={i} className="rounded-[22px] border border-border/70 bg-muted/45 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{r.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Всего: {r.total} • Завершено: {r.completed}
                  </p>
                </div>
                {r.atRisk > 0 ? (
                  <span className="badge bg-amber-100 text-xs text-amber-700 dark:text-amber-300">{r.atRisk} риск</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Без риска</span>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="progress-bar flex-1">
                  <div
                    className={`progress-fill ${r.atRisk > 0 ? 'bg-amber-500' : 'bg-primary'}`}
                    style={{ width: `${data.metrics.total > 0 ? (r.total / data.metrics.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {data.metrics.total > 0 ? Math.round((r.total / data.metrics.total) * 100) : 0}%
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/80">
                <th className="table-header">Ответственный</th>
                <th className="table-header text-center">Всего</th>
                <th className="table-header text-center">Завершено</th>
                <th className="table-header text-center">Под риском</th>
                <th className="table-header">Загрузка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {data.responsibleStats.map((r, i) => (
                <tr key={i} className="hover:bg-accent/45">
                  <td className="table-cell font-medium">{r.name}</td>
                  <td className="table-cell text-center">{r.total}</td>
                  <td className="table-cell text-center font-medium text-emerald-600 dark:text-emerald-300">{r.completed}</td>
                  <td className="table-cell text-center">
                    {r.atRisk > 0 ? (
                      <span className="badge bg-amber-100 text-amber-700 dark:text-amber-300">{r.atRisk}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="progress-bar flex-1 max-w-24">
                        <div
                          className={`progress-fill ${r.atRisk > 0 ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${data.metrics.total > 0 ? (r.total / data.metrics.total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {data.metrics.total > 0 ? Math.round((r.total / data.metrics.total) * 100) : 0}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

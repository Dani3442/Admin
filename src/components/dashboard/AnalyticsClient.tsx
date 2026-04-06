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
  return (
    <div className="space-y-6">
      {showHeader && (
        <>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Аналитика</h1>
            <p className="text-slate-500 text-sm mt-1">Метрики и инсайты по всем продуктам</p>
          </div>
          <DashboardMetricsCards metrics={data.metrics} />
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {showHeader && (
          <>
            {/* Status Distribution */}
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Распределение по статусам</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={data.statusData.filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                    {data.statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {data.statusData.filter(d => d.value > 0).map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="truncate">{item.name}</span>
                    <span className="font-bold text-slate-800 ml-auto">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottlenecks */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <h3 className="text-sm font-semibold text-slate-700">Проблемные этапы (задержки)</h3>
              </div>
              {data.topBottlenecks.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Задержек нет</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.topBottlenecks} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v) => [`${v}`, 'Задержек']} />
                    <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}

        {/* Progress Distribution */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Распределение по прогрессу</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.progressBuckets}>
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v) => [v, 'Продуктов']} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Country */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">По стране производства</h3>
          </div>
          <div className="space-y-3">
            {data.countryStats.slice(0, 6).map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-slate-700 w-24 flex-shrink-0">{item.country}</span>
                <div className="flex-1 progress-bar">
                  <div
                    className="progress-fill bg-brand-500"
                    style={{ width: `${data.metrics.total > 0 ? (item.total / data.metrics.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-slate-700 w-8 text-right">{item.total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Responsible Stats */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">По ответственным</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="table-header">Ответственный</th>
                <th className="table-header text-center">Всего</th>
                <th className="table-header text-center">Завершено</th>
                <th className="table-header text-center">Под риском</th>
                <th className="table-header">Загрузка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.responsibleStats.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="table-cell font-medium">{r.name}</td>
                  <td className="table-cell text-center">{r.total}</td>
                  <td className="table-cell text-center text-emerald-600 font-medium">{r.completed}</td>
                  <td className="table-cell text-center">
                    {r.atRisk > 0 ? (
                      <span className="badge bg-amber-100 text-amber-700">{r.atRisk}</span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="progress-bar flex-1 max-w-24">
                        <div
                          className={`progress-fill ${r.atRisk > 0 ? 'bg-amber-500' : 'bg-brand-500'}`}
                          style={{ width: `${data.metrics.total > 0 ? (r.total / data.metrics.total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">
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

'use client'

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface ChartsProps {
  statusData: Array<{ name: string; value: number; color: string }>
  topBottlenecks: Array<{ name: string; count: number }>
}

export function DashboardCharts({ statusData, topBottlenecks }: ChartsProps) {
  const tooltipStyle = {
    borderRadius: 16,
    border: '1px solid hsl(var(--border))',
    fontSize: 12,
    backgroundColor: 'hsl(var(--popover) / 0.96)',
    color: 'hsl(var(--popover-foreground))',
    boxShadow: '0 24px 50px -28px hsl(var(--shadow-color) / 0.55)',
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Status Distribution */}
      <div className="card">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Статусы продуктов</h3>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={statusData.filter((d) => d.value > 0)}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={2}
              dataKey="value"
            >
              {statusData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [value, name]}
              contentStyle={tooltipStyle}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-2 gap-1 mt-2">
          {statusData.filter((d) => d.value > 0).map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              <span className="truncate">{item.name}</span>
              <span className="ml-auto font-semibold text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottleneck Stages */}
      <div className="card">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Проблемные этапы</h3>
        {topBottlenecks.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Задержек не найдено
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={topBottlenecks}
              layout="vertical"
              margin={{ left: 0, right: 10 }}
            >
              <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={{ stroke: 'hsl(var(--border))' }} tickLine={{ stroke: 'hsl(var(--border))' }} />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
              />
              <Tooltip
                formatter={(v) => [`${v} задержек`, 'Кол-во']}
                contentStyle={tooltipStyle}
              />
              <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

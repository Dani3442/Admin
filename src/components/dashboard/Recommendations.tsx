'use client'

import { Lightbulb } from 'lucide-react'

export function Recommendations({ items }: { items: string[] }) {
  return (
    <div className="card h-full">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-700">Умные подсказки</h3>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-sm text-slate-600 leading-relaxed">{item}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

'use client'

import { Lightbulb } from 'lucide-react'

export function Recommendations({ items }: { items: string[] }) {
  return (
    <div className="card h-full">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-4 h-4 text-amber-500 dark:text-amber-300" />
        <h3 className="text-sm font-semibold text-foreground">Умные подсказки</h3>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-border/70 bg-muted/55 p-3">
            <p className="text-sm leading-relaxed text-muted-foreground">{item}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

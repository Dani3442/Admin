'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { getStatusColor, getStatusLabel, formatDate, cn } from '@/lib/utils'
import type { ProductStatus } from '@/types'
// Types are string-based (no Prisma enums needed)

interface RiskListProps {
  products: Array<{
    id: string
    name: string
    riskScore: number
    finalDate: Date | null
    status: string
    responsible?: string
    progressPercent: number
    riskReasons?: string[]
  }>
}

export function RiskList({ products }: RiskListProps) {
  if (products.length === 0) return null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-700">Продукты под риском</h3>
        </div>
        <Link href="/products?status=AT_RISK" className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
          Все <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="divide-y divide-slate-50">
        {products.map((product) => (
          <Link
            key={product.id}
            href={`/products/${product.id}`}
            className="flex items-center gap-4 py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors group"
          >
            {/* Risk Score */}
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0',
              product.riskScore >= 70 ? 'bg-red-100 text-red-700' :
              product.riskScore >= 40 ? 'bg-amber-100 text-amber-700' :
              'bg-blue-100 text-blue-700'
            )}>
              {product.riskScore}
            </div>

            {/* Name & Status */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate group-hover:text-brand-700">{product.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={cn('badge text-xs', getStatusColor(product.status as ProductStatus))}>
                  {getStatusLabel(product.status as ProductStatus)}
                </span>
                {product.responsible && (
                  <span className="text-xs text-slate-400">{product.responsible}</span>
                )}
              </div>
              {product.riskReasons && product.riskReasons.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {product.riskReasons.map((reason, i) => (
                    <span
                      key={i}
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                        reason.includes('Пересечение') ? 'bg-orange-100 text-orange-700' :
                        reason.includes('просроч') ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      )}
                    >
                      {reason}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Progress */}
            <div className="flex-shrink-0 text-right">
              <div className="text-xs font-medium text-slate-600">{product.progressPercent}%</div>
              <div className="progress-bar w-16 mt-1">
                <div
                  className={cn('progress-fill', product.progressPercent < 30 ? 'bg-red-500' : product.progressPercent < 70 ? 'bg-amber-500' : 'bg-emerald-500')}
                  style={{ width: `${product.progressPercent}%` }}
                />
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{formatDate(product.finalDate)}</div>
            </div>

            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 transition-colors flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}

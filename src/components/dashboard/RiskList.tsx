'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { getStatusColor, getStatusLabel, formatDate, cn } from '@/lib/utils'
import { buildProductHref, getRouteWithSearch } from '@/lib/navigation'
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
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentRoute = getRouteWithSearch(pathname, searchParams.toString())

  if (products.length === 0) return null

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-300" />
          <h3 className="text-sm font-semibold text-foreground">Продукты под риском</h3>
        </div>
        <Link href="/products?status=AT_RISK" className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 dark:text-blue-300">
          Все <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="divide-y divide-border/70">
        {products.map((product) => (
          <Link
            key={product.id}
            href={buildProductHref(product.id, currentRoute)}
            className="group -mx-2 flex items-center gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-accent/45"
          >
            {/* Risk Score */}
            <div className={cn(
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold',
              product.riskScore >= 70 ? 'bg-red-100 text-red-700 dark:text-red-300' :
              product.riskScore >= 40 ? 'bg-amber-100 text-amber-700 dark:text-amber-300' :
              'bg-blue-100 text-blue-700 dark:text-blue-300'
            )}>
              {product.riskScore}
            </div>

            {/* Name & Status */}
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-foreground group-hover:text-brand-700 dark:group-hover:text-blue-300">{product.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={cn('badge text-xs', getStatusColor(product.status as ProductStatus))}>
                  {getStatusLabel(product.status as ProductStatus)}
                </span>
                {product.responsible && (
                  <span className="text-xs text-muted-foreground">{product.responsible}</span>
                )}
              </div>
              {product.riskReasons && product.riskReasons.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {product.riskReasons.map((reason, i) => (
                    <span
                      key={i}
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                        reason.includes('Пересечение') ? 'bg-orange-100 text-orange-700 dark:text-amber-300' :
                        reason.includes('просроч') ? 'bg-red-100 text-red-700 dark:text-red-300' :
                        'bg-amber-100 text-amber-700 dark:text-amber-300'
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
              <div className="text-xs font-medium text-muted-foreground">{product.progressPercent}%</div>
              <div className="progress-bar w-16 mt-1">
                <div
                  className={cn('progress-fill', product.progressPercent < 30 ? 'bg-red-500' : product.progressPercent < 70 ? 'bg-amber-500' : 'bg-emerald-500')}
                  style={{ width: `${product.progressPercent}%` }}
                />
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{formatDate(product.finalDate)}</div>
            </div>

            <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-brand-500 dark:group-hover:text-blue-300" />
          </Link>
        ))}
      </div>
    </div>
  )
}

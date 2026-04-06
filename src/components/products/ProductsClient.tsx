'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Plus, ArrowUpDown, AlertTriangle, Trash2 } from 'lucide-react'
import { cn, getStatusColor, getStatusLabel, getPriorityColor, getPriorityLabel, formatDate, detectStageOverlaps } from '@/lib/utils'

const ALL_STATUSES = ['PLANNED', 'IN_PROGRESS', 'AT_RISK', 'DELAYED', 'COMPLETED', 'CANCELLED'] as const
const ALL_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

interface Product {
  id: string
  name: string
  country: string | null
  status: string
  priority: string
  finalDate: Date | null
  progressPercent: number
  riskScore: number
  isArchived: boolean
  responsible?: { id: string; name: string } | null
  stages: Array<{ id: string; stageOrder: number; isCompleted: boolean; dateValue: Date | null; isCritical: boolean; status: string; stageName: string }>
  _count: { comments: number; stages: number }
}

interface ProductsClientProps {
  products: Product[]
  users: Array<{ id: string; name: string }>
  currentUserRole: string
}

export function ProductsClient({ products: initialProducts, users, currentUserRole }: ProductsClientProps) {
  const [products, setProducts] = useState(initialProducts)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [responsibleFilter, setResponsibleFilter] = useState('')
  const [sortField, setSortField] = useState<'name' | 'finalDate' | 'riskScore' | 'progressPercent'>('riskScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null)
  const canDeleteProducts = ['ADMIN', 'DIRECTOR'].includes(currentUserRole)

  useEffect(() => {
    setProducts(initialProducts)
  }, [initialProducts])

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      if (statusFilter && p.status !== statusFilter) return false
      if (priorityFilter && p.priority !== priorityFilter) return false
      if (responsibleFilter && p.responsible?.id !== responsibleFilter) return false
      return true
    })
    list.sort((a, b) => {
      let av: any = a[sortField]
      let bv: any = b[sortField]
      if (av instanceof Date) av = av.getTime()
      if (bv instanceof Date) bv = bv.getTime()
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [products, search, statusFilter, priorityFilter, responsibleFilter, sortField, sortDir])

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const router = useRouter()
  const now = new Date()

  const handleDeleteProduct = async (productId: string, productName: string) => {
    const confirmed = window.confirm(`Удалить продукт «${productName}»?`)
    if (!confirmed) return

    setDeletingProductId(productId)
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось удалить продукт')
      }

      setProducts((prev) => prev.filter((product) => product.id !== productId))
      router.refresh()
    } catch (error: any) {
      window.alert(error.message || 'Не удалось удалить продукт')
    } finally {
      setDeletingProductId(null)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Продукты</h1>
          <p className="text-slate-500 text-sm mt-0.5">{filtered.length} из {products.length} продуктов</p>
        </div>
        <Link href="/products/new" className="btn-primary">
          <Plus className="w-4 h-4" /> Новый продукт
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" placeholder="Поиск по названию..." />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-40">
          <option value="">Все статусы</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="input w-36">
          <option value="">Все приоритеты</option>
          {ALL_PRIORITIES.map((p) => <option key={p} value={p}>{getPriorityLabel(p)}</option>)}
        </select>
        <select value={responsibleFilter} onChange={(e) => setResponsibleFilter(e.target.value)} className="input w-40">
          <option value="">Все ответственные</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {(search || statusFilter || priorityFilter || responsibleFilter) && (
          <button onClick={() => { setSearch(''); setStatusFilter(''); setPriorityFilter(''); setResponsibleFilter('') }} className="text-xs text-slate-400 hover:text-slate-600 underline">
            Сбросить
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="table-header w-10 text-center">#</th>
                <th className="table-header">
                  <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-slate-700">
                    Название <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="table-header w-24">Страна</th>
                <th className="table-header w-32">Статус</th>
                <th className="table-header w-28">Приоритет</th>
                <th className="table-header w-28">Ответственный</th>
                <th className="table-header w-32">
                  <button onClick={() => toggleSort('progressPercent')} className="flex items-center gap-1 hover:text-slate-700">
                    Прогресс <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="table-header w-28">
                  <button onClick={() => toggleSort('finalDate')} className="flex items-center gap-1 hover:text-slate-700">
                    Дата готовн. <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="table-header w-20">
                  <button onClick={() => toggleSort('riskScore')} className="flex items-center gap-1 hover:text-slate-700">
                    Риск <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                {canDeleteProducts && <th className="table-header w-24 text-center">Действия</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((product, idx) => {
                const isOverdue = product.finalDate && new Date(product.finalDate) < now && product.status !== 'COMPLETED'
                const { overlaps } = detectStageOverlaps(product.stages)
                return (
                  <tr key={product.id} className="hover:bg-slate-50/60 transition-colors cursor-pointer" onClick={() => router.push(`/products/${product.id}`)}>
                    <td className="table-cell text-center text-slate-400 text-xs">{idx + 1}</td>
                    <td className="table-cell">
                      <Link href={`/products/${product.id}`} className="font-medium text-slate-800 hover:text-brand-700 transition-colors">
                        {product.name.length > 55 ? product.name.slice(0, 55) + '…' : product.name}
                      </Link>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {product._count.stages} этапов • {product._count.comments} комм.
                        {overlaps.length > 0 && (
                          <span className="ml-1.5 text-orange-600 font-medium" title={overlaps.map(o => `${o.fromName} → ${o.toName}`).join(', ')}>
                            • ⚠ {overlaps.length} пересеч.
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table-cell"><span className="text-xs text-slate-500">{product.country || '—'}</span></td>
                    <td className="table-cell">
                      <span className={cn('badge text-xs', getStatusColor(product.status))}>{getStatusLabel(product.status)}</span>
                    </td>
                    <td className="table-cell">
                      <span className={cn('badge text-xs border', getPriorityColor(product.priority))}>{getPriorityLabel(product.priority)}</span>
                    </td>
                    <td className="table-cell"><span className="text-xs text-slate-600">{product.responsible?.name || '—'}</span></td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="progress-bar flex-1">
                          <div className={cn('progress-fill', product.progressPercent < 30 ? 'bg-red-400' : product.progressPercent < 70 ? 'bg-amber-400' : 'bg-emerald-500')}
                            style={{ width: `${product.progressPercent}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 w-8 text-right">{product.progressPercent}%</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className={cn('text-xs font-medium', isOverdue ? 'text-red-600' : 'text-slate-600')}>{formatDate(product.finalDate)}</span>
                      {isOverdue && <div className="text-xs text-red-500 mt-0.5">просрочен</div>}
                    </td>
                    <td className="table-cell">
                      <div className={cn('inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold',
                        product.riskScore >= 70 ? 'bg-red-100 text-red-700' :
                        product.riskScore >= 40 ? 'bg-amber-100 text-amber-700' :
                        product.riskScore > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}>
                        {product.riskScore}
                      </div>
                    </td>
                    {canDeleteProducts && (
                      <td className="table-cell text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDeleteProduct(product.id, product.name)}
                          disabled={deletingProductId === product.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {deletingProductId === product.id ? 'Удаление...' : 'Удалить'}
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-slate-400">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Продукты не найдены</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

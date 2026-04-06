import { detectStageOverlaps } from '@/lib/utils'

export type ProductListSortField = 'manual' | 'name' | 'finalDate' | 'riskScore' | 'progressPercent' | 'createdAt'
export type ProductListSortDirection = 'asc' | 'desc'
export type ProductQuickView = 'all' | 'pinned' | 'favorite' | 'overdue' | 'atRisk'

export interface ProductListStage {
  id: string
  stageOrder: number
  isCompleted: boolean
  dateValue: Date | null
  isCritical: boolean
  status: string
  stageName: string
}

export interface ProductListItem {
  id: string
  name: string
  category?: string | null
  country: string | null
  status: string
  priority: string
  finalDate: Date | string | null
  progressPercent: number
  riskScore: number
  sortOrder: number
  isPinned: boolean
  isFavorite: boolean
  createdAt: Date | string
  responsible?: { id: string; name: string } | null
  stages: ProductListStage[]
  _count: { comments: number; stages: number }
}

export interface ProductListFilters {
  search: string
  status: string
  responsibleId: string
  priority: string
  country: string
  quickView: ProductQuickView
  onlyWithOverlaps: boolean
}

function compareNullableDates(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined,
  direction: ProductListSortDirection
) {
  const leftValue = left ? new Date(left).getTime() : null
  const rightValue = right ? new Date(right).getTime() : null

  if (leftValue === rightValue) return 0
  if (leftValue === null) return 1
  if (rightValue === null) return -1

  return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue
}

function compareValues(
  left: string | number,
  right: string | number,
  direction: ProductListSortDirection
) {
  if (typeof left === 'string' && typeof right === 'string') {
    return direction === 'asc' ? left.localeCompare(right, 'ru') : right.localeCompare(left, 'ru')
  }

  return direction === 'asc' ? Number(left) - Number(right) : Number(right) - Number(left)
}

function isProductOverdue(product: Pick<ProductListItem, 'finalDate' | 'status'>, now: Date) {
  if (!product.finalDate || product.status === 'COMPLETED') return false
  return new Date(product.finalDate) < now
}

export function hasActiveProductFilters(filters: ProductListFilters) {
  return Boolean(
    filters.search ||
      filters.status ||
      filters.responsibleId ||
      filters.priority ||
      filters.country.trim() ||
      filters.quickView !== 'all' ||
      filters.onlyWithOverlaps
  )
}

export function filterProducts(products: ProductListItem[], filters: ProductListFilters, now = new Date()) {
  const countrySearch = filters.country.trim().toLowerCase()

  return products.filter((product) => {
    if (filters.search && !product.name.toLowerCase().includes(filters.search.toLowerCase())) return false
    if (filters.status && product.status !== filters.status) return false
    if (filters.responsibleId && product.responsible?.id !== filters.responsibleId) return false
    if (filters.priority && product.priority !== filters.priority) return false
    if (countrySearch && !(product.country || '').toLowerCase().includes(countrySearch)) return false

    const { overlaps } = detectStageOverlaps(product.stages)
    const overdue = isProductOverdue(product, now)
    const atRisk = product.status === 'AT_RISK' || product.riskScore >= 40

    if (filters.onlyWithOverlaps && overlaps.length === 0) return false

    if (filters.quickView === 'pinned' && !product.isPinned) return false
    if (filters.quickView === 'favorite' && !product.isFavorite) return false
    if (filters.quickView === 'overdue' && !overdue) return false
    if (filters.quickView === 'atRisk' && !atRisk) return false

    return true
  })
}

export function sortProducts(
  products: ProductListItem[],
  sortField: ProductListSortField,
  sortDirection: ProductListSortDirection
) {
  return [...products].sort((left, right) => {
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1

    if (sortField === 'manual') {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    }

    if (sortField === 'finalDate' || sortField === 'createdAt') {
      const dateComparison = compareNullableDates(left[sortField], right[sortField], sortDirection)
      if (dateComparison !== 0) return dateComparison
    } else {
      const valueComparison = compareValues(left[sortField], right[sortField], sortDirection)
      if (valueComparison !== 0) return valueComparison
    }

    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
    return left.name.localeCompare(right.name, 'ru')
  })
}

export function reorderProducts(
  products: ProductListItem[],
  draggedProductId: string,
  targetProductId: string,
  position: 'before' | 'after'
) {
  const ordered = sortProducts(products, 'manual', 'asc')
  const dragged = ordered.find((product) => product.id === draggedProductId)
  const target = ordered.find((product) => product.id === targetProductId)

  if (!dragged || !target || dragged.id === target.id) return ordered
  if (dragged.isPinned !== target.isPinned) return ordered

  const withoutDragged = ordered.filter((product) => product.id !== dragged.id)
  const targetIndex = withoutDragged.findIndex((product) => product.id === target.id)

  if (targetIndex === -1) return ordered

  const insertionIndex = position === 'after' ? targetIndex + 1 : targetIndex
  withoutDragged.splice(insertionIndex, 0, dragged)

  return withoutDragged.map((product, index) => ({
    ...product,
    sortOrder: index,
  }))
}

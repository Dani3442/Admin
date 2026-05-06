export type EditableProductStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'

export const EDITABLE_PRODUCT_STATUSES: Array<{
  value: EditableProductStatus
  label: string
  description: string
  dotClassName: string
  badgeClassName: string
}> = [
  {
    value: 'PLANNED',
    label: 'Планируется',
    description: 'Продукт еще готовится к работе',
    dotClassName: 'bg-slate-400',
    badgeClassName: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-500/15 dark:text-slate-200',
  },
  {
    value: 'IN_PROGRESS',
    label: 'В работе',
    description: 'Продукт находится в активной работе',
    dotClassName: 'bg-blue-500',
    badgeClassName: 'border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-200',
  },
  {
    value: 'COMPLETED',
    label: 'Выполнено',
    description: 'Работа по продукту завершена',
    dotClassName: 'bg-emerald-500',
    badgeClassName: 'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200',
  },
]

export function isEditableProductStatus(status: unknown): status is EditableProductStatus {
  return EDITABLE_PRODUCT_STATUSES.some((option) => option.value === status)
}

export function getEditableProductStatusOption(status: string) {
  return EDITABLE_PRODUCT_STATUSES.find((option) => option.value === status) ?? null
}

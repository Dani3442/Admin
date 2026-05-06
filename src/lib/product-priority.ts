export type EditableProductPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export const EDITABLE_PRODUCT_PRIORITIES: Array<{
  value: EditableProductPriority
  label: string
  description: string
  dotClassName: string
  badgeClassName: string
}> = [
  {
    value: 'CRITICAL',
    label: 'Критичный',
    description: 'Требует максимального внимания',
    dotClassName: 'bg-red-500',
    badgeClassName: 'border-red-300 bg-red-100 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200',
  },
  {
    value: 'HIGH',
    label: 'Высокий',
    description: 'Важная задача с высоким приоритетом',
    dotClassName: 'bg-amber-500',
    badgeClassName: 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200',
  },
  {
    value: 'MEDIUM',
    label: 'Средний',
    description: 'Стандартный рабочий приоритет',
    dotClassName: 'bg-blue-500',
    badgeClassName: 'border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-200',
  },
  {
    value: 'LOW',
    label: 'Низкий',
    description: 'Можно выполнять без срочности',
    dotClassName: 'bg-slate-400',
    badgeClassName: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-500/15 dark:text-slate-200',
  },
]

export function isEditableProductPriority(priority: unknown): priority is EditableProductPriority {
  return EDITABLE_PRODUCT_PRIORITIES.some((option) => option.value === priority)
}

export function getEditableProductPriorityOption(priority: string) {
  return EDITABLE_PRODUCT_PRIORITIES.find((option) => option.value === priority) ?? null
}

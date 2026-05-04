'use client'

import { createPortal } from 'react-dom'
import { UserPlus, X } from 'lucide-react'
import { FilterSelect } from '@/components/ui/FilterSelect'

type AssignableUser = {
  id: string
  name: string
}

interface ProductResponsibleDialogProps {
  open: boolean
  productName: string
  users: AssignableUser[]
  selectedUserId: string
  loading?: boolean
  onChange: (userId: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export function ProductResponsibleDialog({
  open,
  productName,
  users,
  selectedUserId,
  loading = false,
  onChange,
  onCancel,
  onConfirm,
}: ProductResponsibleDialogProps) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[120] flex items-end justify-center px-4 pb-4 pt-8 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="surface-panel w-full max-w-md space-y-5 p-4 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:text-blue-300">
              <UserPlus className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">Добавить ответственного</h3>
              <p className="mt-1 truncate text-sm leading-6 text-muted-foreground">{productName}</p>
            </div>
          </div>

          <button type="button" onClick={onCancel} className="btn-secondary px-3" disabled={loading}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="label mb-0">Ответственный</label>
          <FilterSelect
            value={selectedUserId}
            onChange={onChange}
            options={users.map((user) => ({ value: user.id, label: user.name }))}
            placeholder={users.length ? 'Выбери пользователя' : 'Нет зарегистрированных пользователей'}
            triggerClassName="h-12"
            panelClassName="z-[130]"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            Можно выбрать только пользователя, который уже зарегистрирован в системе.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="btn-secondary" disabled={loading}>
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary"
            disabled={loading || !selectedUserId || users.length === 0}
          >
            {loading ? 'Сохраняем...' : 'Назначить'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

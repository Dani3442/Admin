'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { Pencil, Save, X } from 'lucide-react'

interface ProductRenameDialogProps {
  open: boolean
  initialName: string
  loading?: boolean
  onConfirm: (nextName: string) => void
  onCancel: () => void
}

export function ProductRenameDialog({
  open,
  initialName,
  loading = false,
  onConfirm,
  onCancel,
}: ProductRenameDialogProps) {
  const [value, setValue] = useState(initialName)

  useEffect(() => {
    if (!open) return
    setValue(initialName)
  }, [initialName, open])

  if (typeof document === 'undefined') return null

  const submit = () => {
    const nextName = value.trim()
    if (!nextName || nextName === initialName.trim()) {
      onCancel()
      return
    }

    onConfirm(nextName)
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop fixed inset-0 z-[120] flex items-end justify-center px-4 pb-4 pt-8 sm:items-center sm:pb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            className="surface-panel max-h-[min(88vh,40rem)] w-full max-w-md overflow-y-auto p-4 sm:p-6"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 dark:text-blue-300">
                  <Pencil className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-foreground">Переименовать продукт</h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Новое название сразу обновится в списке, таблице и карточке продукта.
                  </p>
                </div>
              </div>

              <button type="button" onClick={onCancel} className="btn-secondary px-3" disabled={loading}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-medium text-foreground">Название продукта</label>
              <input
                type="text"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    submit()
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onCancel()
                  }
                }}
                className="input w-full"
                autoFocus
                placeholder="Введите название продукта"
              />
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={onCancel} className="btn-secondary" disabled={loading}>
                Отмена
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={loading || !value.trim() || value.trim() === initialName.trim()}
                className="btn-primary"
              >
                <Save className="h-4 w-4" />
                {loading ? 'Сохраняем...' : 'Сохранить'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

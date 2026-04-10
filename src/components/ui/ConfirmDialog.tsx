'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  confirmTone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  confirmTone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (typeof document === 'undefined') return null

  const loadingLabel = confirmTone === 'danger' ? 'Удаляем...' : 'Выполняется...'

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            className="surface-panel w-full max-w-md p-6"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                    confirmTone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-700'
                  )}
                >
                  {confirmTone === 'danger' ? <Trash2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                  <p className="text-sm leading-6 text-slate-500">{description}</p>
                </div>
              </div>

              <button type="button" onClick={onCancel} className="btn-secondary px-3">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={onCancel} className="btn-secondary" disabled={loading}>
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className={cn(
                  'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70',
                  confirmTone === 'danger'
                    ? 'bg-red-600 text-white hover:bg-red-500'
                    : 'bg-brand-950 text-white hover:bg-brand-900'
                )}
              >
                {loading && (
                  <motion.span
                    aria-hidden="true"
                    className="absolute inset-0 bg-white/10"
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ duration: 0.9, ease: 'linear', repeat: Infinity }}
                  />
                )}

                <span className="relative z-[1] inline-flex items-center justify-center gap-2">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loading ? loadingLabel : confirmLabel}
                </span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

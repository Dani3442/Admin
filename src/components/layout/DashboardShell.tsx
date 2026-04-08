'use client'

import { Header } from '@/components/layout/Header'
import { NewProductForm } from '@/components/products/NewProductForm'
import { ProductCreationProvider } from '@/components/products/ProductCreationContext'
import { AnimatePresence, motion } from 'framer-motion'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import { useMemo } from 'react'

interface DashboardShellProps {
  user: {
    id?: string
    name?: string
    lastName?: string | null
    email?: string
    role: string
    avatar?: string | null
  }
  canCreateProduct: boolean
  createProductData?: {
    users: Array<{ id: string; name: string }>
    productTemplates: any[]
    stageSuggestions: Array<{ id: string; name: string }>
  } | null
  children: React.ReactNode
}

export function DashboardShell({
  user,
  canCreateProduct,
  createProductData,
  children,
}: DashboardShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const explicitReturnTo = searchParams.get('returnTo')
  const createModalOpen = searchParams.get('create') === '1'

  const sourceRoute = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('create')
    params.delete('returnTo')
    const query = params.toString()
    return pathname + (query ? `?${query}` : '')
  }, [pathname, searchParams])

  const openCreateProductModal = () => {
    if (!canCreateProduct) return
    const params = new URLSearchParams()
    params.set('create', '1')
    params.set('returnTo', sourceRoute)
    router.push(`/products?${params.toString()}`, { scroll: false })
  }

  const closeCreateProductModal = () => {
    if (pathname === '/products' && explicitReturnTo && explicitReturnTo !== '/products') {
      router.replace(explicitReturnTo, { scroll: false })
      return
    }

    const params = new URLSearchParams(searchParams.toString())
    let shouldNavigate = false

    if (params.has('create')) {
      params.delete('create')
      shouldNavigate = true
    }
    if (params.has('returnTo')) {
      params.delete('returnTo')
      shouldNavigate = true
    }

    if (shouldNavigate) {
      const nextQuery = params.toString()
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
    }
  }

  return (
    <ProductCreationProvider
      value={{
        canCreateProduct,
        openCreateProductModal,
        closeCreateProductModal,
      }}
    >
      <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
        <Header user={user} canCreateProduct={canCreateProduct} />
        <main className="flex-1 overflow-y-auto">
          <div className="page-shell px-4 pb-8 pt-3 sm:px-6 lg:px-8">{children}</div>
        </main>
        <AnimatePresence>
          {canCreateProduct && createProductData && createModalOpen && typeof document !== 'undefined' && createPortal(
            <motion.div
              className="modal-backdrop fixed inset-0 flex items-center justify-center px-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeCreateProductModal}
            >
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-4xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="surface-panel max-h-[90vh] overflow-y-auto p-6">
                  <div className="mb-5">
                    <h3 className="text-base font-semibold text-slate-800">Новый продукт</h3>
                    <p className="mt-1 text-sm text-slate-500">Создай продукт без выхода из текущего раздела.</p>
                  </div>
                  <NewProductForm
                    users={createProductData.users}
                    productTemplates={createProductData.productTemplates}
                    stageSuggestions={createProductData.stageSuggestions}
                    mode="modal"
                    onCancel={closeCreateProductModal}
                    onCreated={(productId) => {
                      closeCreateProductModal()
                      router.push(
                        `/products/${encodeURIComponent(productId)}?returnTo=${encodeURIComponent(
                          explicitReturnTo || sourceRoute
                        )}`
                      )
                      router.refresh()
                    }}
                  />
                </div>
              </motion.div>
            </motion.div>,
            document.body
          )}
        </AnimatePresence>
      </div>
    </ProductCreationProvider>
  )
}

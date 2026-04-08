'use client'

import { Header } from '@/components/layout/Header'
import { ProductCreationProvider } from '@/components/products/ProductCreationContext'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
  children,
}: DashboardShellProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const explicitReturnTo = searchParams.get('returnTo')

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
      </div>
    </ProductCreationProvider>
  )
}

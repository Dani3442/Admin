'use client'

import { createContext, useContext } from 'react'

type ProductCreationContextValue = {
  canCreateProduct: boolean
  openCreateProductModal: () => void
  closeCreateProductModal: () => void
}

const ProductCreationContext = createContext<ProductCreationContextValue | null>(null)

export function ProductCreationProvider({
  value,
  children,
}: {
  value: ProductCreationContextValue
  children: React.ReactNode
}) {
  return (
    <ProductCreationContext.Provider value={value}>
      {children}
    </ProductCreationContext.Provider>
  )
}

export function useProductCreation() {
  return (
    useContext(ProductCreationContext) ?? {
      canCreateProduct: false,
      openCreateProductModal: () => {},
      closeCreateProductModal: () => {},
    }
  )
}

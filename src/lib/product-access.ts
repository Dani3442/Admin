import { Prisma } from '@prisma/client'
import { hasPermission, Permission } from '@/lib/auth'

type ProductAccessViewer = {
  id?: string | null
  role?: string | null
}

function getViewerRole(viewer: ProductAccessViewer | null | undefined) {
  return viewer?.role ?? ''
}

export function canViewAllProducts(viewer: ProductAccessViewer | null | undefined) {
  return hasPermission(getViewerRole(viewer), Permission.VIEW_ALL_PRODUCTS)
}

export function canViewOwnProducts(viewer: ProductAccessViewer | null | undefined) {
  return hasPermission(getViewerRole(viewer), Permission.VIEW_OWN_PRODUCTS)
}

export function canViewAnalytics(viewer: ProductAccessViewer | null | undefined) {
  return hasPermission(getViewerRole(viewer), Permission.VIEW_ANALYTICS)
}

export function canManageArchive(viewer: ProductAccessViewer | null | undefined) {
  return ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER'].includes(getViewerRole(viewer))
}

export function getVisibleProductWhere(
  viewer: ProductAccessViewer | null | undefined,
  baseWhere: Prisma.ProductWhereInput = {}
): Prisma.ProductWhereInput {
  if (canViewAllProducts(viewer)) {
    return baseWhere
  }

  if (canViewOwnProducts(viewer) && viewer?.id) {
    return {
      AND: [baseWhere, { responsibleId: viewer.id }],
    }
  }

  return {
    AND: [baseWhere, { id: '__no-access__' }],
  }
}

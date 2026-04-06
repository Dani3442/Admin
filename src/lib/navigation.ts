const SECTION_LABELS: Array<{ prefix: string; label: string }> = [
  { prefix: '/table', label: 'Назад к таблице' },
  { prefix: '/timeline', label: 'Назад к таймлайну' },
  { prefix: '/dashboard', label: 'Назад к дашборду' },
  { prefix: '/automations', label: 'Назад к автоматизациям' },
  { prefix: '/users', label: 'Назад к пользователям' },
  { prefix: '/settings', label: 'Назад к настройкам' },
  { prefix: '/products', label: 'Назад к продуктам' },
]

export function getRouteWithSearch(pathname: string, search: string) {
  return search ? `${pathname}?${search}` : pathname
}

export function sanitizeReturnTo(returnTo: string | null | undefined) {
  if (!returnTo) return null
  if (!returnTo.startsWith('/')) return null
  if (returnTo.startsWith('//')) return null
  return returnTo
}

export function buildProductHref(productId: string, returnTo?: string | null) {
  const sanitized = sanitizeReturnTo(returnTo)
  if (!sanitized) return `/products/${productId}`
  return `/products/${productId}?returnTo=${encodeURIComponent(sanitized)}`
}

export function resolveBackNavigation(returnTo: string | null | undefined, fallback = '/products') {
  const target = sanitizeReturnTo(returnTo) || fallback
  const pathname = target.split('?')[0]
  const label = SECTION_LABELS.find((section) => pathname === section.prefix || pathname.startsWith(`${section.prefix}/`))?.label || 'Назад'

  return { href: target, label }
}

'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, Bell, AlertTriangle, Clock, History, X, ChevronRight, ChevronsLeft, ChevronsRight, Search, Command } from 'lucide-react'
import { UserAvatar } from '@/components/users/UserAvatar'
import { cn, getRoleLabel, getUserDisplayName } from '@/lib/utils'
import { buildProductHref, getRouteWithSearch } from '@/lib/navigation'

interface Notification {
  id: string
  type: 'change' | 'overdue' | 'risk'
  title: string
  description: string
  productId: string | null
  createdAt: string
}

interface HeaderProps {
  user: { name?: string; lastName?: string | null; email?: string; role: string; avatar?: string | null }
  isSidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}

const PAGE_META: Array<{ match: string; title: string; description: string }> = [
  { match: '/dashboard', title: 'Дашборд', description: 'Сводка по срокам, статусам и критичным изменениям' },
  { match: '/products', title: 'Продукты', description: 'Управление списком, таблицей и карточками продуктов' },
  { match: '/users', title: 'Пользователи', description: 'Команда, роли, доступы и рабочие профили' },
  { match: '/automations', title: 'Автоматизации', description: 'Сценарии, правила и служебные процессы' },
  { match: '/settings', title: 'Настройки', description: 'Параметры системы и справочные конфигурации' },
  { match: '/profile', title: 'Профиль', description: 'Личные данные, роль и рабочий контекст' },
  { match: '/timeline', title: 'Таймлайн', description: 'Хронология этапов и контроль сроков' },
  { match: '/analytics', title: 'Аналитика', description: 'Метрики, тенденции и распределение нагрузки' },
  { match: '/table', title: 'Таблица', description: 'Плотный табличный режим для этапов и дат' },
]

function getPageMeta(pathname: string) {
  const matched = PAGE_META.find((item) => pathname === item.match || pathname.startsWith(`${item.match}/`))
  return matched || { title: 'Product Admin', description: 'Рабочее пространство системы управления продуктами' }
}

export function Header({ user, isSidebarCollapsed = false, onToggleSidebar }: HeaderProps) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [counts, setCounts] = useState({ overdue: 0, risk: 0, changes: 0, total: 0 })
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentRoute = getRouteWithSearch(pathname, searchParams.toString())
  const pageMeta = getPageMeta(pathname)

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Fetch notifications on first open
  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications)
        setCounts(data.counts)
        setLoaded(true)
      }
    } finally {
      setLoading(false)
    }
  }

  // Auto-fetch count on mount
  useEffect(() => {
    fetchNotifications()
  }, [])

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (next && !loaded) fetchNotifications()
  }

  const handleClickNotification = (n: Notification) => {
    if (n.productId) {
      router.push(buildProductHref(n.productId, currentRoute))
      setOpen(false)
    }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'overdue': return <Clock className="w-3.5 h-3.5 text-red-500" />
      case 'risk': return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
      case 'change': return <History className="w-3.5 h-3.5 text-blue-500" />
      default: return <Bell className="w-3.5 h-3.5 text-slate-400" />
    }
  }

  const getBg = (type: string) => {
    switch (type) {
      case 'overdue': return 'bg-red-50 hover:bg-red-100/60'
      case 'risk': return 'bg-amber-50 hover:bg-amber-100/60'
      case 'change': return 'hover:bg-slate-50'
      default: return 'hover:bg-slate-50'
    }
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'только что'
    if (diffMin < 60) return `${diffMin} мин. назад`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr} ч. назад`
    const diffDay = Math.floor(diffHr / 24)
    return `${diffDay} дн. назад`
  }

  const totalBadge = counts.overdue + counts.risk

  return (
    <header className="flex-shrink-0 border-b border-slate-200/70 bg-slate-50/90 px-6 py-4 backdrop-blur-sm">
      <div className="page-shell">
        <div className="surface-panel flex items-center justify-between gap-6 px-5 py-4">
        <div className="flex min-w-0 items-center gap-4">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
            aria-label={isSidebarCollapsed ? 'Показать боковую панель' : 'Скрыть боковую панель'}
            title={isSidebarCollapsed ? 'Показать меню' : 'Скрыть меню'}
          >
            {isSidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-slate-400">
              <span>Product Admin</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">Workspace</span>
            </div>
            <div className="mt-1">
              <h1 className="truncate text-[21px] font-semibold tracking-[-0.03em] text-slate-900">{pageMeta.title}</h1>
              <p className="truncate text-sm text-slate-500">{pageMeta.description}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="toolbar-button hidden lg:inline-flex"
          >
            <Search className="h-4 w-4" />
            Поиск
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-400">
              <Command className="h-3 w-3" />K
            </span>
          </button>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={handleToggle}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
            >
              <Bell className="w-4 h-4" />
              {totalBadge > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {totalBadge > 99 ? '99+' : totalBadge}
                </span>
              )}
            </button>

            <AnimatePresence>
            {open && (
              <motion.div
                className="absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
              >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-semibold text-slate-700">Уведомления</span>
                  {counts.total > 0 && (
                    <span className="text-xs text-slate-400">{counts.total}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchNotifications}
                    className="text-xs text-brand-600 hover:text-brand-700"
                    disabled={loading}
                  >
                    {loading ? 'Загрузка...' : 'Обновить'}
                  </button>
                  <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Summary badges */}
              {(counts.overdue > 0 || counts.risk > 0) && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
                  {counts.overdue > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                      {counts.overdue} просрочено
                    </span>
                  )}
                  {counts.risk > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      {counts.risk} под риском
                    </span>
                  )}
                  {counts.changes > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                      {counts.changes} изменений
                    </span>
                  )}
                </div>
              )}

              {/* Notifications list */}
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                {loading && notifications.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">Загрузка...</div>
                ) : notifications.length === 0 ? (
                  <div className="py-8 text-center">
                    <Bell className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Нет уведомлений</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleClickNotification(n)}
                      className={cn(
                        'w-full text-left px-4 py-2.5 flex items-start gap-2.5 transition-colors',
                        getBg(n.type),
                        n.productId && 'cursor-pointer'
                      )}
                    >
                      <div className="mt-0.5 flex-shrink-0">{getIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{n.title}</p>
                        <p className="text-[11px] text-slate-500 truncate">{n.description}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">{formatTime(n.createdAt)}</span>
                    </button>
                  ))
                )}
              </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>

          <Link
            href="/profile"
            className="flex min-w-[220px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <UserAvatar user={user} size="sm" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{getUserDisplayName(user)}</p>
              <p className="truncate text-xs text-slate-500">{getRoleLabel(user.role)}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </Link>

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-transparent px-3 text-sm text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
        >
          <LogOut className="w-3.5 h-3.5" />
          Выйти
        </button>
        </div>
      </div>
      </div>
    </header>
  )
}

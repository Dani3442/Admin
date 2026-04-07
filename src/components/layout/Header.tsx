'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  AlertTriangle,
  Clock,
  History,
  MessageCircle,
  X,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Package,
  Settings,
  UserCircle2,
  Users,
  Zap,
  LogOut,
  Package2,
  Plus,
} from 'lucide-react'
import { UserAvatar } from '@/components/users/UserAvatar'
import { cn, getRoleLabel, getUserDisplayName } from '@/lib/utils'
import { buildProductHref, getRouteWithSearch } from '@/lib/navigation'

interface Notification {
  id: string
  type: 'mention' | 'change' | 'overdue' | 'risk'
  title: string
  description: string
  productId: string | null
  createdAt: string
  href?: string | null
}

interface HeaderProps {
  user: { name?: string; lastName?: string | null; email?: string; role: string; avatar?: string | null }
}

const NAV_ITEMS: Array<{
  label: string
  href: string
  icon: typeof LayoutDashboard
  adminOnly?: boolean
}> = [
  { label: 'Дашборд', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Продукты', href: '/products', icon: Package },
  { label: 'Автоматизации', href: '/automations', icon: Zap },
  { label: 'Пользователи', href: '/users', icon: Users, adminOnly: true },
]

export function Header({ user }: HeaderProps) {
  const [profileUser, setProfileUser] = useState(user)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [counts, setCounts] = useState({ mentions: 0, overdue: 0, risk: 0, changes: 0, total: 0 })
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentRoute = getRouteWithSearch(pathname, searchParams.toString())
  const isAdmin = ['ADMIN', 'DIRECTOR'].includes(user.role)

  useEffect(() => {
    setProfileUser(user)
  }, [user])

  useEffect(() => {
    let isMounted = true

    const fetchProfileUser = async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store', credentials: 'include' })
        if (!res.ok) return

        const profile = await res.json()
        if (!isMounted) return

        setProfileUser((current) => ({
          ...current,
          name: profile?.name ?? current.name,
          lastName: profile?.lastName ?? current.lastName,
          email: profile?.email ?? current.email,
          role: profile?.role ?? current.role,
          avatar: profile?.avatar ?? current.avatar,
        }))
      } catch {
        // Keep header stable even if profile prefetch fails.
      }
    }

    fetchProfileUser()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (notificationsRef.current && !notificationsRef.current.contains(target)) {
        setNotificationsOpen(false)
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return

      const data = await res.json()
      setNotifications(data.notifications)
      setCounts(data.counts)
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [pathname, searchParams])

  const handleToggleNotifications = () => {
    const nextOpen = !notificationsOpen
    setNotificationsOpen(nextOpen)
    setProfileOpen(false)

    if (nextOpen && !loaded) {
      fetchNotifications()
    }
  }

  const handleToggleProfile = () => {
    setProfileOpen((current) => !current)
    setNotificationsOpen(false)
  }

  const handleClickNotification = (notification: Notification) => {
    if (notification.href) {
      const href = notification.href.includes('returnTo=')
        ? notification.href
        : `${notification.href}${notification.href.includes('?') ? '&' : '?'}returnTo=${encodeURIComponent(currentRoute)}`
      router.push(href)
    } else if (notification.productId) {
      router.push(buildProductHref(notification.productId, currentRoute))
    } else {
      return
    }
    setNotificationsOpen(false)
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'mention':
        return <MessageCircle className="h-3.5 w-3.5 text-brand-600" />
      case 'overdue':
        return <Clock className="h-3.5 w-3.5 text-red-500" />
      case 'risk':
        return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
      case 'change':
        return <History className="h-3.5 w-3.5 text-blue-500" />
      default:
        return <Bell className="h-3.5 w-3.5 text-slate-400" />
    }
  }

  const getBg = (type: string) => {
    switch (type) {
      case 'mention':
        return 'bg-brand-50 hover:bg-brand-100/70'
      case 'overdue':
        return 'bg-red-50 hover:bg-red-100/70'
      case 'risk':
        return 'bg-amber-50 hover:bg-amber-100/70'
      default:
        return 'hover:bg-slate-50'
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

  const totalBadge = counts.mentions + counts.overdue + counts.risk
  const handleOpenCreateProduct = () => {
    const params = new URLSearchParams()
    params.set('create', String(Date.now()))
    router.push(`/products?${params.toString()}`)
  }

  return (
    <header className="relative z-[60] flex-shrink-0 px-4 pb-2 pt-5 sm:px-6 lg:px-8">
      <div className="page-shell flex justify-center">
        <motion.div
          layout
          className="floating-island flex w-full max-w-[1060px] items-center gap-2.5 px-2.5 py-2.5"
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        >
          <Link
            href="/dashboard"
            className="hidden h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm transition hover:scale-[1.03] sm:inline-flex"
            aria-label="Перейти на дашборд"
          >
            <Package2 className="h-5 w-5" />
          </Link>

          <div className="no-scrollbar flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-x-auto px-1">
            {NAV_ITEMS.map((item) => {
              if (item.adminOnly && !isAdmin) return null

              const Icon = item.icon
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative inline-flex flex-shrink-0 items-center gap-2 rounded-full font-medium transition-all',
                    active ? 'h-11 px-5 text-[15px]' : 'h-10 px-3.5 text-[15px]',
                    active ? 'text-white' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="top-island-nav-pill"
                      className="absolute inset-0 rounded-full bg-slate-950 shadow-[0_14px_28px_-18px_rgba(15,23,42,0.7)]"
                      transition={{ type: 'spring', stiffness: 390, damping: 34 }}
                    />
                  )}
                  <Icon className={cn('relative z-10', active ? 'h-[17px] w-[17px]' : 'h-[16px] w-[16px]')} />
                  <span className="relative z-10 whitespace-nowrap">{item.label}</span>
                </Link>
              )
            })}
          </div>

          <div className="ml-auto flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleOpenCreateProduct}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-950 transition hover:border-slate-300 hover:bg-slate-50"
              aria-label="Создать продукт"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>

            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={handleToggleNotifications}
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                aria-label="Открыть уведомления"
              >
                <Bell className="h-[17px] w-[17px]" />
                {totalBadge > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {totalBadge > 99 ? '99+' : totalBadge}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div
                    className="absolute right-0 top-[calc(100%+10px)] z-[90] w-[min(92vw,24rem)] overflow-hidden rounded-[30px] border border-slate-100 bg-white shadow-2xl"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/90 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-slate-500" />
                        <span className="text-sm font-semibold text-slate-700">Уведомления</span>
                        {counts.total > 0 && <span className="text-xs text-slate-400">{counts.total}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={fetchNotifications}
                          className="text-xs text-brand-600 transition hover:text-brand-700"
                          disabled={loading}
                        >
                          {loading ? 'Загрузка...' : 'Обновить'}
                        </button>
                        <button onClick={() => setNotificationsOpen(false)} className="text-slate-400 transition hover:text-slate-600">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {(counts.mentions > 0 || counts.overdue > 0 || counts.risk > 0 || counts.changes > 0) && (
                      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                        {counts.mentions > 0 && (
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                            {counts.mentions} упоминаний
                          </span>
                        )}
                        {counts.overdue > 0 && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                            {counts.overdue} просрочено
                          </span>
                        )}
                        {counts.risk > 0 && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                            {counts.risk} под риском
                          </span>
                        )}
                        {counts.changes > 0 && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                            {counts.changes} изменений
                          </span>
                        )}
                      </div>
                    )}

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                      {loading && notifications.length === 0 ? (
                        <div className="py-8 text-center text-sm text-slate-400">Загрузка...</div>
                      ) : notifications.length === 0 ? (
                        <div className="py-8 text-center">
                          <Bell className="mx-auto mb-2 h-6 w-6 text-slate-200" />
                          <p className="text-sm text-slate-400">Нет уведомлений</p>
                        </div>
                      ) : (
                        notifications.map((notification) => (
                          <button
                            key={notification.id}
                            onClick={() => handleClickNotification(notification)}
                            className={cn(
                              'flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors',
                              getBg(notification.type),
                              notification.productId && 'cursor-pointer'
                            )}
                          >
                            <div className="mt-0.5 flex-shrink-0">{getIcon(notification.type)}</div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-slate-700">{notification.title}</p>
                              <p className="truncate text-[11px] text-slate-500">{notification.description}</p>
                            </div>
                            <span className="mt-0.5 flex-shrink-0 text-[10px] text-slate-400">
                              {formatTime(notification.createdAt)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={handleToggleProfile}
                className="inline-flex h-12 items-center gap-2.5 rounded-full border border-slate-200/80 bg-white/90 pl-1.5 pr-4 text-left transition hover:border-slate-300"
                aria-label="Открыть меню профиля"
              >
                <UserAvatar user={profileUser} size="md" />
                <div className="hidden min-w-0 text-left sm:block">
                  <p className="max-w-[180px] truncate text-[17px] font-semibold leading-5 text-slate-800">{getUserDisplayName(profileUser)}</p>
                  <p className="truncate text-[14px] leading-4 text-slate-500">{getRoleLabel(profileUser.role)}</p>
                </div>
                <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', profileOpen && 'rotate-180')} />
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    className="absolute right-0 top-[calc(100%+10px)] z-[90] w-[min(92vw,19rem)] overflow-hidden rounded-[26px] border border-slate-100 bg-white p-2 shadow-2xl"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="mb-2 flex items-center gap-3 rounded-[20px] bg-slate-50 px-3 py-3">
                      <UserAvatar user={profileUser} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold leading-5 text-slate-900">{getUserDisplayName(profileUser)}</p>
                        <p className="truncate text-[14px] leading-5 text-slate-500">{profileUser.email}</p>
                        <p className="mt-1 text-[13px] leading-5 text-slate-400">{getRoleLabel(profileUser.role)}</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Link
                        href={`/profile?returnTo=${encodeURIComponent(currentRoute)}`}
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center justify-between rounded-[18px] px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                      >
                        <span className="flex items-center gap-2">
                          <UserCircle2 className="h-4 w-4 text-slate-400" />
                          Профиль
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center justify-between rounded-[18px] px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                      >
                        <span className="flex items-center gap-2">
                          <Settings className="h-4 w-4 text-slate-400" />
                          Настройки
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </Link>
                    </div>

                    <div className="mt-2 border-t border-slate-100 pt-2">
                      <button
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        className="flex w-full items-center justify-between rounded-[18px] px-3 py-2.5 text-sm text-red-600 transition hover:bg-red-50"
                      >
                        <span className="flex items-center gap-2">
                          <LogOut className="h-4 w-4" />
                          Выйти
                        </span>
                        <ChevronRight className="h-4 w-4 text-red-300" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </header>
  )
}

'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  AlertTriangle,
  Clock,
  History,
  MessageCircle,
  X,
  Menu,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Package,
  Archive,
  Settings,
  UserCircle2,
  Users,
  Zap,
  LogOut,
  Package2,
} from 'lucide-react'
import { UserAvatar } from '@/components/users/UserAvatar'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { cn, getRoleLabel, getUserDisplayName } from '@/lib/utils'
import { buildProductHref, getRouteWithSearch } from '@/lib/navigation'
import { createClient } from '@/lib/supabase/client'

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
  { label: 'Архив', href: '/archive', icon: Archive },
]

export function Header({ user }: HeaderProps) {
  const [supabase] = useState(() => createClient())
  const [profileUser, setProfileUser] = useState(user)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
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
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin)

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
    setMobileNavOpen(false)
    setNotificationsOpen(false)
    setProfileOpen(false)
  }, [pathname, searchParams])

  useEffect(() => {
    if (!mobileNavOpen) {
      document.body.style.overflow = ''
      return
    }

    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileNavOpen])

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

  const markNotificationsSeen = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
      })
    } catch {
      // Keep the panel usable even if the mark-seen request fails.
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  useEffect(() => {
    fetchNotifications()
  }, [pathname, searchParams])

  const handleToggleNotifications = async () => {
    const nextOpen = !notificationsOpen
    setNotificationsOpen(nextOpen)
    setProfileOpen(false)
    setMobileNavOpen(false)

    if (nextOpen) {
      setNotifications([])
      setCounts({ mentions: 0, overdue: 0, risk: 0, changes: 0, total: 0 })
      setLoaded(true)
      await markNotificationsSeen()
      fetchNotifications()
    } else if (!loaded) {
      fetchNotifications()
    }
  }

  const handleToggleProfile = () => {
    setProfileOpen((current) => !current)
    setNotificationsOpen(false)
    setMobileNavOpen(false)
  }

  const handleToggleMobileNav = () => {
    setMobileNavOpen((current) => !current)
    setNotificationsOpen(false)
    setProfileOpen(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setMobileNavOpen(false)
    setProfileOpen(false)
    router.push('/login')
    router.refresh()
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
        return <MessageCircle className="h-3.5 w-3.5 text-brand-600 dark:text-blue-300" />
      case 'overdue':
        return <Clock className="h-3.5 w-3.5 text-red-500 dark:text-red-300" />
      case 'risk':
        return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300" />
      case 'change':
        return <History className="h-3.5 w-3.5 text-blue-500 dark:text-blue-300" />
      default:
        return <Bell className="h-3.5 w-3.5 text-muted-foreground" />
    }
  }

  const getBg = (type: string) => {
    switch (type) {
      case 'mention':
        return 'bg-brand-50 hover:bg-brand-100/70 dark:bg-blue-500/10'
      case 'overdue':
        return 'bg-red-50 hover:bg-red-100/70 dark:bg-red-500/10'
      case 'risk':
        return 'bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-500/10'
      default:
        return 'hover:bg-slate-50 dark:hover:bg-accent'
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
  return (
    <header className="relative z-[60] flex-shrink-0 px-4 pb-2 pt-5 sm:px-6 lg:px-8">
      <div className="page-shell flex justify-center">
        <motion.div
          layout
          className="floating-island flex w-full max-w-[1060px] items-center gap-2 px-2.5 py-2.5 sm:gap-2.5"
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        >
          <button
            type="button"
            onClick={handleToggleMobileNav}
            className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-border/80 bg-card/88 text-muted-foreground transition hover:border-border hover:bg-accent/70 hover:text-foreground lg:hidden"
            aria-label={mobileNavOpen ? 'Закрыть меню' : 'Открыть меню'}
          >
            {mobileNavOpen ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
          </button>

          <Link
            href="/dashboard"
            className="hidden h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card transition hover:scale-[1.03] sm:inline-flex"
            aria-label="Перейти на дашборд"
          >
            <Package2 className="h-5 w-5" />
          </Link>

          <Link
            href="/dashboard"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-full px-1.5 py-1.5 lg:hidden"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card">
              <Package2 className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-5 text-foreground">Product Admin</span>
              <span className="block truncate text-[12px] leading-4 text-muted-foreground">{getRoleLabel(profileUser.role)}</span>
            </span>
          </Link>

          <div className="no-scrollbar hidden min-w-0 flex-1 items-center justify-center gap-1.5 overflow-x-auto px-1 lg:flex">
            {visibleNavItems.map((item) => {

              const Icon = item.icon
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative inline-flex flex-shrink-0 items-center gap-2 rounded-full font-medium transition-all',
                    active ? 'h-11 px-5 text-[15px]' : 'h-10 px-3.5 text-[15px]',
                    active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="top-island-nav-pill"
                      className="absolute inset-0 rounded-full bg-primary shadow-card"
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
            <ThemeToggle compact />
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={handleToggleNotifications}
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-border/80 bg-card/88 text-muted-foreground transition hover:border-border hover:bg-accent/70 hover:text-foreground"
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
                    className="absolute right-0 top-[calc(100%+10px)] z-[90] w-[min(92vw,24rem)] overflow-hidden rounded-[30px] border border-border/80 bg-popover shadow-modal"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="flex items-center justify-between border-b border-border/80 bg-muted/60 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground">Уведомления</span>
                        {counts.total > 0 && <span className="text-xs text-muted-foreground">{counts.total}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={fetchNotifications}
                          className="text-xs text-brand-600 transition hover:text-brand-700"
                          disabled={loading}
                        >
                          {loading ? 'Загрузка...' : 'Обновить'}
                        </button>
                        <button onClick={() => setNotificationsOpen(false)} className="text-muted-foreground transition hover:text-foreground">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {(counts.mentions > 0 || counts.overdue > 0 || counts.risk > 0 || counts.changes > 0) && (
                      <div className="flex flex-wrap items-center gap-2 border-b border-border/80 px-4 py-2.5">
                        {counts.mentions > 0 && (
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:text-blue-300">
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

                    <div className="max-h-80 overflow-y-auto divide-y divide-border/70">
                      {loading && notifications.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">Загрузка...</div>
                      ) : notifications.length === 0 ? (
                        <div className="py-8 text-center">
                          <Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">Нет уведомлений</p>
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
                              <p className="truncate text-xs font-medium text-foreground">{notification.title}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{notification.description}</p>
                            </div>
                            <span className="mt-0.5 flex-shrink-0 text-[10px] text-muted-foreground">
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
                className="inline-flex h-11 items-center gap-2 rounded-full border border-border/80 bg-card/88 pl-1.5 pr-2.5 text-left transition hover:border-border hover:bg-accent/65 sm:h-12 sm:gap-2.5 sm:pr-4"
                aria-label="Открыть меню профиля"
              >
                <UserAvatar user={profileUser} size="md" />
                <div className="hidden min-w-0 text-left sm:block">
                  <p className="max-w-[180px] truncate text-[17px] font-semibold leading-5 text-foreground">{getUserDisplayName(profileUser)}</p>
                  <p className="truncate text-[14px] leading-4 text-muted-foreground">{getRoleLabel(profileUser.role)}</p>
                </div>
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', profileOpen && 'rotate-180')} />
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    className="absolute right-0 top-[calc(100%+10px)] z-[90] w-[min(92vw,19rem)] overflow-hidden rounded-[26px] border border-border/80 bg-popover p-2 shadow-modal"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="mb-2 flex items-center gap-3 rounded-[20px] bg-muted/65 px-3 py-3">
                      <UserAvatar user={profileUser} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold leading-5 text-foreground">{getUserDisplayName(profileUser)}</p>
                        <p className="truncate text-[14px] leading-5 text-muted-foreground">{profileUser.email}</p>
                        <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{getRoleLabel(profileUser.role)}</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Link
                        href={`/profile?returnTo=${encodeURIComponent(currentRoute)}`}
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center justify-between rounded-[18px] px-3 py-2.5 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground"
                      >
                        <span className="flex items-center gap-2">
                          <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                          Профиль
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setProfileOpen(false)}
                        className="flex items-center justify-between rounded-[18px] px-3 py-2.5 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground"
                      >
                        <span className="flex items-center gap-2">
                          <Settings className="h-4 w-4 text-muted-foreground" />
                          Настройки
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </div>

                    <div className="mt-2 border-t border-border/80 pt-2">
                      <button
                        onClick={handleSignOut}
                        className="flex w-full items-center justify-between rounded-[18px] px-3 py-2.5 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-300"
                      >
                        <span className="flex items-center gap-2">
                          <LogOut className="h-4 w-4" />
                          Выйти
                        </span>
                        <ChevronRight className="h-4 w-4 text-red-300 dark:text-red-400/70" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {mobileNavOpen && (
          <motion.div
            className="fixed inset-0 z-[70] bg-slate-950/48 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileNavOpen(false)}
          >
            <motion.div
              className="absolute inset-y-3 left-3 w-[min(88vw,22rem)] overflow-hidden rounded-[30px] border border-border/80 bg-card shadow-modal"
              initial={{ x: -24, opacity: 0.7 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0.7 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border/80 px-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card">
                    <Package2 className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">Навигация</p>
                    <p className="truncate text-xs text-muted-foreground">{getUserDisplayName(profileUser)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-card text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  aria-label="Закрыть меню"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="max-h-[calc(100vh-7rem)] overflow-y-auto px-3 py-3">
                <div className="space-y-1.5">
                  {visibleNavItems.map((item) => {
                    const Icon = item.icon
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        className={cn(
                          'flex items-center justify-between rounded-[20px] px-4 py-3 text-sm font-medium transition-colors',
                          active
                            ? 'bg-primary text-primary-foreground shadow-card'
                            : 'bg-muted/55 text-foreground hover:bg-accent hover:text-accent-foreground'
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </span>
                        <ChevronRight className={cn('h-4 w-4', active ? 'text-primary-foreground/80' : 'text-muted-foreground')} />
                      </Link>
                    )
                  })}
                </div>

                <div className="mt-4 rounded-[24px] border border-border/70 bg-muted/45 p-3">
                  <div className="mb-3 flex items-center gap-3">
                    <UserAvatar user={profileUser} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{getUserDisplayName(profileUser)}</p>
                      <p className="truncate text-xs text-muted-foreground">{profileUser.email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{getRoleLabel(profileUser.role)}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Link
                      href={`/profile?returnTo=${encodeURIComponent(currentRoute)}`}
                      onClick={() => setMobileNavOpen(false)}
                      className="flex items-center justify-between rounded-[18px] px-3 py-2.5 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                        Профиль
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setMobileNavOpen(false)}
                      className="flex items-center justify-between rounded-[18px] px-3 py-2.5 text-sm text-foreground transition hover:bg-accent hover:text-accent-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        Настройки
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center justify-between rounded-[18px] px-3 py-2.5 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                    >
                      <span className="flex items-center gap-2">
                        <LogOut className="h-4 w-4" />
                        Выйти
                      </span>
                      <ChevronRight className="h-4 w-4 text-red-300 dark:text-red-400/70" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

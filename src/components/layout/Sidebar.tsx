'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, Package, Zap, Users, Settings,
  ChevronRight, Package2, ChevronsLeft
} from 'lucide-react'
import { UserAvatar } from '@/components/users/UserAvatar'
import { cn, getRoleLabel, getUserDisplayName } from '@/lib/utils'

interface SidebarProps {
  user: { name?: string; lastName?: string | null; email?: string; role: string; avatar?: string | null }
  collapsed?: boolean
  onToggle?: () => void
}

const nav = [
  { label: 'Дашборд', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Продукты', href: '/products', icon: Package },
  { label: 'Автоматизации', href: '/automations', icon: Zap },
  { label: 'Пользователи', href: '/users', icon: Users, adminOnly: true },
  { label: 'Настройки', href: '/settings', icon: Settings },
]

export function Sidebar({ user, collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const isAdmin = ['ADMIN', 'DIRECTOR'].includes(user.role)

  return (
    <motion.aside
      className={cn('relative flex-shrink-0 bg-sidebar flex flex-col h-full overflow-hidden border-r border-slate-800/90')}
      initial={{ opacity: 0, x: -12 }}
      style={{ width: collapsed ? 0 : undefined }}
      transition={{
        opacity: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
        x: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
        width: { duration: 0.26, ease: [0.22, 1, 0.36, 1] },
      }}
      animate={{
        opacity: 1,
        x: 0,
        width: collapsed ? 0 : 240,
      }}
    >
      <div className="flex h-full w-[240px] flex-col">
        {/* Logo */}
        <div className="border-b border-slate-800 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Package2 className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <p className="text-white font-semibold text-sm leading-tight">Product Admin</p>
                <p className="text-slate-500 text-xs">v1.0</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggle}
              className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-sidebar-hover hover:text-white"
              aria-label="Скрыть боковую панель"
              title="Скрыть меню"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {nav.map((item) => {
            if (item.adminOnly && !isAdmin) return null
            const Icon = item.icon
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 group overflow-hidden',
                  active ? 'text-white shadow-sm' : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-lg bg-brand-600"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <Icon className={cn('relative z-10 w-4 h-4 flex-shrink-0', active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300')} />
                <span className="relative z-10 flex-1 font-medium">{item.label}</span>
                {active && <ChevronRight className="relative z-10 w-3 h-3 text-white/60" />}
              </Link>
            )
          })}
        </nav>

        {/* User Info */}
        <div className="border-t border-slate-800 px-3 py-4">
          <Link href="/profile" className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-sidebar-hover">
            <UserAvatar user={user} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{getUserDisplayName(user)}</p>
              <p className="text-slate-400 text-xs truncate">{getRoleLabel(user.role)}</p>
            </div>
          </Link>
        </div>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            key="sidebar-presence"
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
        )}
      </AnimatePresence>
    </motion.aside>
  )
}

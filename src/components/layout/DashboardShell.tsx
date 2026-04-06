'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'

interface DashboardShellProps {
  user: {
    id?: string
    name?: string
    lastName?: string | null
    email?: string
    role: string
    avatar?: string | null
  }
  children: React.ReactNode
}

const STORAGE_KEY = 'product-admin.sidebar-collapsed'

export function DashboardShell({ user, children }: DashboardShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const savedValue = window.localStorage.getItem(STORAGE_KEY)
    setSidebarCollapsed(savedValue === '1')
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    window.localStorage.setItem(STORAGE_KEY, sidebarCollapsed ? '1' : '0')
  }, [ready, sidebarCollapsed])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar user={user} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((current) => !current)} />
      <div className="flex-1 flex min-w-0 flex-col overflow-hidden">
        <Header user={user} isSidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((current) => !current)} />
        <main className="flex-1 overflow-y-auto">
          <div className="page-shell px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  )
}

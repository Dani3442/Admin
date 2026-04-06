'use client'

import { Header } from '@/components/layout/Header'

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

export function DashboardShell({ user, children }: DashboardShellProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      <Header user={user} />
      <main className="flex-1 overflow-y-auto">
        <div className="page-shell px-4 pb-8 pt-3 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  )
}

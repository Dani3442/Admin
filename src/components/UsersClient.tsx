'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Plus, Shield, Trash2, UserCheck, UserX, X } from 'lucide-react'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { UserAvatar } from '@/components/users/UserAvatar'
import { cn, formatDate, getRoleLabel, getUserDisplayName, getVerificationStatusColor, getVerificationStatusLabel } from '@/lib/utils'
import type { UserRole } from '@/types'
// Types are string-based (no Prisma enums needed)

const ROLE_OPTIONS: UserRole[] = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER', 'EMPLOYEE', 'VIEWER']

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'text-red-700 bg-red-50 border border-red-200 dark:text-red-300',
  DIRECTOR: 'text-violet-700 bg-violet-50 border border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20',
  PRODUCT_MANAGER: 'text-blue-700 bg-blue-50 border border-blue-200 dark:text-blue-300',
  EMPLOYEE: 'text-muted-foreground bg-muted/75 border border-border/70',
  VIEWER: 'text-muted-foreground bg-muted/60 border border-border/60',
}

export function UsersClient({ users: initial, currentUserRole }: { users: any[]; currentUserRole: string }) {
  const router = useRouter()
  const [users, setUsers] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', lastName: '', email: '', password: '', role: 'EMPLOYEE' })
  const [saving, setSaving] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [pendingDeleteUser, setPendingDeleteUser] = useState<any | null>(null)
  const [error, setError] = useState('')
  const canCreateUsers = ['ADMIN', 'DIRECTOR'].includes(currentUserRole)
  const roleOptions = currentUserRole === 'DIRECTOR'
    ? ROLE_OPTIONS.filter((role) => !['ADMIN', 'DIRECTOR'].includes(role))
    : ROLE_OPTIONS
  const roleSelectOptions = roleOptions.map((role) => ({
    value: role,
    label: getRoleLabel(role),
  }))
  const canDeleteUser = (user: any) => {
    if (currentUserRole === 'ADMIN') return true
    if (currentUserRole === 'DIRECTOR') {
      return !['ADMIN', 'DIRECTOR'].includes(user.role)
    }
    return false
  }

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, userRole: form.role }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Ошибка создания')
        return
      }
      const user = await res.json()
      setUsers((prev) => [...prev, { ...user, _count: { assignedProducts: 0 } }])
      setShowForm(false)
      setForm({ name: '', lastName: '', email: '', password: '', role: 'EMPLOYEE' })
    } catch (requestError: any) {
      setError(requestError.message || 'Ошибка создания')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUser = async (user: any) => {
    setPendingDeleteUser(user)
  }

  const confirmDeleteUser = async () => {
    if (!pendingDeleteUser) return
    setDeletingUserId(pendingDeleteUser.id)
    try {
      const res = await fetch(`/api/users/${pendingDeleteUser.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось удалить сотрудника')
      }

      setUsers((prev) => prev.filter((item) => item.id !== pendingDeleteUser.id))
      setPendingDeleteUser(null)
    } catch (deleteError: any) {
      window.alert(deleteError.message || 'Не удалось удалить сотрудника')
    } finally {
      setDeletingUserId(null)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Пользователи</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{users.length} сотрудников</p>
        </div>
        {canCreateUsers && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary w-full justify-center sm:w-auto">
            <Plus className="w-4 h-4" />
            Добавить
          </button>
        )}
      </div>

      {showForm && canCreateUsers && typeof document !== 'undefined' && createPortal(
        <div className="modal-backdrop flex items-end justify-center px-4 pb-4 pt-8 sm:items-center">
          <div className="surface-panel max-h-[min(92vh,48rem)] w-full max-w-2xl animate-fade-in overflow-y-auto p-4 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Новый сотрудник</h3>
                <p className="mt-1 text-sm text-muted-foreground">Создай нового пользователя и сразу выдай ему нужную роль.</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-3">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={createUser} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="label">Имя</label>
                <input value={form.name} onChange={(e) => setForm(p => ({...p, name: e.target.value}))} className="input" placeholder="Иван" required />
              </div>
              <div>
                <label className="label">Фамилия</label>
                <input value={form.lastName} onChange={(e) => setForm(p => ({...p, lastName: e.target.value}))} className="input" placeholder="Иванов" />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm(p => ({...p, email: e.target.value}))} className="input" placeholder="ivan@company.com" required />
              </div>
              <div>
                <label className="label">Пароль</label>
                <input type="password" value={form.password} onChange={(e) => setForm(p => ({...p, password: e.target.value}))} className="input" placeholder="Минимум 8 символов" required minLength={8} />
              </div>
              <div className="md:col-span-2">
                <label className="label">Роль</label>
                <FilterSelect
                  value={form.role}
                  onChange={(value) => setForm((p) => ({ ...p, role: value as UserRole }))}
                  options={roleSelectOptions}
                  placeholder="Выберите роль"
                />
              </div>
              {error && <div className="md:col-span-2 rounded-[20px] border border-destructive/20 bg-destructive/10 p-3 text-sm text-red-600 dark:text-red-300">{error}</div>}
              <div className="md:col-span-2 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap">
                <button type="submit" disabled={saving} className="btn-primary w-full justify-center sm:w-auto">{saving ? 'Создаём...' : 'Создать сотрудника'}</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary w-full justify-center sm:w-auto">Отмена</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <div className="space-y-4 lg:hidden">
        {users.map((user) => (
          <article
            key={user.id}
            className="surface-panel space-y-4 p-4"
            onClick={() => router.push(`/users/${user.id}`)}
          >
            <div className="flex items-start gap-3">
              <UserAvatar user={user} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-base font-semibold text-foreground">{getUserDisplayName(user)}</span>
                      {user.role === 'ADMIN' && <Shield className="h-3.5 w-3.5 text-red-500 dark:text-red-300" />}
                    </div>
                    {user.jobTitle && <div className="mt-0.5 text-xs text-muted-foreground">{user.jobTitle}</div>}
                    <div className="mt-1 text-xs text-muted-foreground">{user.email}</div>
                  </div>
                  <div className="flex-shrink-0">
                    {user.isActive
                      ? <UserCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
                      : <UserX className="h-4 w-4 text-red-400 dark:text-red-300" />
                    }
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-[24px] bg-muted/45 p-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Роль</p>
                <span className={cn('mt-2 inline-flex badge text-xs', ROLE_COLORS[user.role] || 'text-muted-foreground bg-muted/75 border border-border/70')}>
                  {getRoleLabel(user.role)}
                </span>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Верификация</p>
                <span className={cn('mt-2 inline-flex badge border text-xs', getVerificationStatusColor(user.verificationStatus))}>
                  {getVerificationStatusLabel(user.verificationStatus)}
                </span>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Продуктов</p>
                <p className="mt-1 text-sm font-medium text-foreground">{user._count.assignedProducts}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Добавлен</p>
                <p className="mt-1 text-sm font-medium text-foreground">{formatDate(user.createdAt)}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  router.push(`/users/${user.id}`)
                }}
                className="btn-secondary w-full justify-center sm:w-auto"
              >
                Открыть профиль
              </button>
              {canDeleteUser(user) && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleDeleteUser(user)
                  }}
                  disabled={deletingUserId === user.id}
                  className="btn-danger w-full justify-center sm:w-auto"
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingUserId === user.id ? 'Удаление...' : 'Удалить'}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="card hidden overflow-hidden p-0 lg:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/70">
              <th className="table-header">Сотрудник</th>
              <th className="table-header">Email</th>
              <th className="table-header">Роль</th>
              <th className="table-header">Верификация</th>
              <th className="table-header text-center">Продуктов</th>
              <th className="table-header">Добавлен</th>
              <th className="table-header text-center">Статус</th>
              <th className="table-header text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {users.map((user) => (
              <tr
                key={user.id}
                className="cursor-pointer transition-colors hover:bg-accent/45"
                onClick={() => router.push(`/users/${user.id}`)}
              >
                <td className="table-cell">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={user} size="sm" />
                    <div>
                      <span className="font-medium text-foreground">{getUserDisplayName(user)}</span>
                      {user.jobTitle && <div className="mt-0.5 text-xs text-muted-foreground">{user.jobTitle}</div>}
                    </div>
                    {user.role === 'ADMIN' && <Shield className="h-3.5 w-3.5 text-red-500 dark:text-red-300" />}
                  </div>
                </td>
                <td className="table-cell text-xs text-muted-foreground">{user.email}</td>
                <td className="table-cell">
                  <span className={cn('badge text-xs', ROLE_COLORS[user.role] || 'text-muted-foreground bg-muted/75 border border-border/70')}>
                    {getRoleLabel(user.role)}
                  </span>
                </td>
                <td className="table-cell">
                  <span className={cn('badge border text-xs', getVerificationStatusColor(user.verificationStatus))}>
                    {getVerificationStatusLabel(user.verificationStatus)}
                  </span>
                </td>
                <td className="table-cell text-center">
                  <span className="text-sm font-medium text-foreground">{user._count.assignedProducts}</span>
                </td>
                <td className="table-cell text-xs text-muted-foreground">{formatDate(user.createdAt)}</td>
                <td className="table-cell text-center">
                  {user.isActive
                    ? <UserCheck className="mx-auto h-4 w-4 text-emerald-500 dark:text-emerald-300" />
                    : <UserX className="mx-auto h-4 w-4 text-red-400 dark:text-red-300" />
                  }
                </td>
                <td className="table-cell" onClick={(event) => event.stopPropagation()}>
                  {canDeleteUser(user) && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(user)}
                        disabled={deletingUserId === user.id}
                        className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingUserId === user.id ? 'Удаление...' : 'Удалить'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeleteUser)}
        title="Удалить сотрудника?"
        description={
          pendingDeleteUser
            ? `Сотрудник «${getUserDisplayName(pendingDeleteUser)}» будет удалён из системы. Это действие нельзя отменить.`
            : ''
        }
        confirmLabel="Удалить"
        loading={Boolean(pendingDeleteUser && deletingUserId === pendingDeleteUser.id)}
        onCancel={() => setPendingDeleteUser(null)}
        onConfirm={confirmDeleteUser}
      />
    </div>
  )
}

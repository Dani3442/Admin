'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Plus, Shield, Trash2, UserCheck, UserX, X } from 'lucide-react'
import { FilterSelect } from '@/components/ui/FilterSelect'
import { UserAvatar } from '@/components/users/UserAvatar'
import { cn, formatDate, getRoleLabel, getUserDisplayName, getVerificationStatusColor, getVerificationStatusLabel } from '@/lib/utils'
import type { UserRole } from '@/types'
// Types are string-based (no Prisma enums needed)

const ROLE_OPTIONS: UserRole[] = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER', 'EMPLOYEE', 'VIEWER']

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'text-red-600 bg-red-50 border-red-200',
  DIRECTOR: 'text-purple-600 bg-purple-50 border-purple-200',
  PRODUCT_MANAGER: 'text-blue-600 bg-blue-50 border-blue-200',
  EMPLOYEE: 'text-slate-600 bg-slate-50 border-slate-200',
  VIEWER: 'text-slate-400 bg-slate-50 border-slate-100',
}

export function UsersClient({ users: initial, currentUserRole }: { users: any[]; currentUserRole: string }) {
  const router = useRouter()
  const [users, setUsers] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', lastName: '', email: '', password: '', role: 'EMPLOYEE' })
  const [saving, setSaving] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
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
    const confirmed = window.confirm(`Удалить сотрудника «${getUserDisplayName(user)}»?`)
    if (!confirmed) return

    setDeletingUserId(user.id)
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Не удалось удалить сотрудника')
      }

      setUsers((prev) => prev.filter((item) => item.id !== user.id))
    } catch (deleteError: any) {
      window.alert(deleteError.message || 'Не удалось удалить сотрудника')
    } finally {
      setDeletingUserId(null)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Пользователи</h1>
          <p className="text-slate-500 text-sm mt-0.5">{users.length} сотрудников</p>
        </div>
        {canCreateUsers && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Добавить
          </button>
        )}
      </div>

      {showForm && canCreateUsers && typeof document !== 'undefined' && createPortal(
        <div className="modal-backdrop flex items-center justify-center px-4">
          <div className="surface-panel w-full max-w-2xl animate-fade-in p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Новый сотрудник</h3>
                <p className="mt-1 text-sm text-slate-500">Создай нового пользователя и сразу выдай ему нужную роль.</p>
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
              {error && <div className="md:col-span-2 rounded-[20px] bg-red-50 p-3 text-sm text-red-600">{error}</div>}
              <div className="md:col-span-2 flex flex-wrap gap-3">
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Создаём...' : 'Создать сотрудника'}</button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Отмена</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
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
          <tbody className="divide-y divide-slate-50">
            {users.map((user) => (
              <tr
                key={user.id}
                className="cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => router.push(`/users/${user.id}`)}
              >
                <td className="table-cell">
                  <div className="flex items-center gap-3">
                    <UserAvatar user={user} size="sm" />
                    <div>
                      <span className="font-medium text-slate-800">{getUserDisplayName(user)}</span>
                      {user.jobTitle && <div className="text-xs text-slate-400 mt-0.5">{user.jobTitle}</div>}
                    </div>
                    {user.role === 'ADMIN' && <Shield className="w-3.5 h-3.5 text-red-500" />}
                  </div>
                </td>
                <td className="table-cell text-slate-500 text-xs">{user.email}</td>
                <td className="table-cell">
                  <span className={cn('badge border text-xs', ROLE_COLORS[user.role] || 'text-slate-500 bg-slate-50 border-slate-200')}>
                    {getRoleLabel(user.role)}
                  </span>
                </td>
                <td className="table-cell">
                  <span className={cn('badge border text-xs', getVerificationStatusColor(user.verificationStatus))}>
                    {getVerificationStatusLabel(user.verificationStatus)}
                  </span>
                </td>
                <td className="table-cell text-center">
                  <span className="text-sm font-medium text-slate-700">{user._count.assignedProducts}</span>
                </td>
                <td className="table-cell text-xs text-slate-400">{formatDate(user.createdAt)}</td>
                <td className="table-cell text-center">
                  {user.isActive
                    ? <UserCheck className="w-4 h-4 text-emerald-500 mx-auto" />
                    : <UserX className="w-4 h-4 text-red-400 mx-auto" />
                  }
                </td>
                <td className="table-cell" onClick={(event) => event.stopPropagation()}>
                  {canDeleteUser(user) && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(user)}
                        disabled={deletingUserId === user.id}
                        className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  )
}

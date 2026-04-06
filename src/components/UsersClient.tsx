'use client'

import { useState } from 'react'
import { Plus, UserCheck, UserX, Shield } from 'lucide-react'
import { cn, getRoleLabel, formatDate } from '@/lib/utils'
// Types are string-based (no Prisma enums needed)

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'text-red-600 bg-red-50 border-red-200',
  DIRECTOR: 'text-purple-600 bg-purple-50 border-purple-200',
  PRODUCT_MANAGER: 'text-blue-600 bg-blue-50 border-blue-200',
  EMPLOYEE: 'text-slate-600 bg-slate-50 border-slate-200',
  VIEWER: 'text-slate-400 bg-slate-50 border-slate-100',
}

export function UsersClient({ users: initial }: { users: any[] }) {
  const [users, setUsers] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'EMPLOYEE' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
      setForm({ name: '', email: '', password: '', role: 'EMPLOYEE' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Пользователи</h1>
          <p className="text-slate-500 text-sm mt-0.5">{users.length} сотрудников</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Добавить
        </button>
      </div>

      {showForm && (
        <div className="card animate-slide-up">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Новый пользователь</h3>
          <form onSubmit={createUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Имя</label>
              <input value={form.name} onChange={(e) => setForm(p => ({...p, name: e.target.value}))} className="input" placeholder="Иван Иванов" required />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm(p => ({...p, email: e.target.value}))} className="input" placeholder="ivan@company.com" required />
            </div>
            <div>
              <label className="label">Пароль</label>
              <input type="password" value={form.password} onChange={(e) => setForm(p => ({...p, password: e.target.value}))} className="input" placeholder="Минимум 8 символов" required minLength={8} />
            </div>
            <div>
              <label className="label">Роль</label>
              <select value={form.role} onChange={(e) => setForm(p => ({...p, role: e.target.value}))} className="input">
                {Object.values(UserRole).map(r => (
                  <option key={r} value={r}>{getRoleLabel(r)}</option>
                ))}
              </select>
            </div>
            {error && <div className="md:col-span-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Создаём...' : 'Создать'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Отмена</button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="table-header">Сотрудник</th>
              <th className="table-header">Email</th>
              <th className="table-header">Роль</th>
              <th className="table-header text-center">Продуктов</th>
              <th className="table-header">Добавлен</th>
              <th className="table-header text-center">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                <td className="table-cell">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-sm font-semibold flex-shrink-0">
                      {user.name.charAt(0)}
                    </div>
                    <span className="font-medium text-slate-800">{user.name}</span>
                    {user.role === 'ADMIN' && <Shield className="w-3.5 h-3.5 text-red-500" />}
                  </div>
                </td>
                <td className="table-cell text-slate-500 text-xs">{user.email}</td>
                <td className="table-cell">
                  <span className={cn('badge border text-xs', ROLE_COLORS[user.role] || 'text-slate-500 bg-slate-50 border-slate-200')}>
                    {getRoleLabel(user.role)}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

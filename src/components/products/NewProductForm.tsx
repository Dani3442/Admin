'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const PRIORITIES = [
  { value: 'CRITICAL', label: 'Критический' },
  { value: 'HIGH', label: 'Высокий' },
  { value: 'MEDIUM', label: 'Средний' },
  { value: 'LOW', label: 'Низкий' },
]

interface NewProductFormProps {
  users: Array<{ id: string; name: string }>
}

export function NewProductForm({ users }: NewProductFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    country: '',
    category: '',
    sku: '',
    priority: 'MEDIUM',
    responsibleId: '',
    notes: '',
  })

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Укажите название продукта')
      return
    }

    setSaving(true)
    setError('')

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          responsibleId: form.responsibleId || null,
          country: form.country || null,
          category: form.category || null,
          sku: form.sku || null,
          notes: form.notes || null,
        }),
      })

      const text = await res.text()
      let data: any = null

      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          data = null
        }
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Ошибка создания продукта')
      }

      const productId = typeof data?.id === 'string' ? data.id : ''

      if (!productId) {
        throw new Error('Продукт создан, но не удалось открыть его карточку')
      }

      router.push(`/products/${encodeURIComponent(productId)}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Название продукта <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className="input w-full"
            placeholder="Например: Увлажняющий крем для лица 50мл"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Страна производства</label>
            <input
              type="text"
              value={form.country}
              onChange={(e) => update('country', e.target.value)}
              className="input w-full"
              placeholder="Китай"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Категория</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
              className="input w-full"
              placeholder="Уход за лицом"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Артикул (SKU)</label>
            <input
              type="text"
              value={form.sku}
              onChange={(e) => update('sku', e.target.value)}
              className="input w-full"
              placeholder="MONA-001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Приоритет</label>
            <select
              value={form.priority}
              onChange={(e) => update('priority', e.target.value)}
              className="input w-full"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Ответственный</label>
          <select
            value={form.responsibleId}
            onChange={(e) => update('responsibleId', e.target.value)}
            className="input w-full"
          >
            <option value="">Не назначен</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Заметки</label>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className="input w-full min-h-[80px] resize-y"
            placeholder="Дополнительная информация..."
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Link href="/products" className="btn-secondary text-sm">
          <ArrowLeft className="w-4 h-4" /> Назад
        </Link>
        <button type="submit" disabled={saving} className="btn-primary">
          <Save className="w-4 h-4" />
          {saving ? 'Создание...' : 'Создать продукт'}
        </button>
      </div>
    </form>
  )
}

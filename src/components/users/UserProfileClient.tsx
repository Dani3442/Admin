'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BadgeCheck, Briefcase, Building2, Camera, CheckCircle2, Mail, Save, ShieldCheck, Sparkles, UserCircle2, UserCog, X } from 'lucide-react'
import { UserAvatar } from '@/components/users/UserAvatar'
import {
  cn,
  formatDate,
  getAccessLevelLabel,
  getEmployeeTypeLabel,
  getRoleLabel,
  getUserDisplayName,
  getVerificationStatusColor,
  getVerificationStatusLabel,
} from '@/lib/utils'
import type { EmployeeType, UserProfileData, UserRole, VerificationStatus } from '@/types'

const EMPLOYEE_TYPE_OPTIONS: EmployeeType[] = ['INTERNAL', 'CONTRACTOR', 'PARTNER']
const VERIFICATION_STATUS_OPTIONS: VerificationStatus[] = ['UNVERIFIED', 'PENDING', 'VERIFIED']
const ROLE_OPTIONS: UserRole[] = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER', 'EMPLOYEE', 'VIEWER']

interface UserProfileClientProps {
  profile: UserProfileData
  viewer: {
    id: string
    role: string
  }
  permissions: {
    canEditPersonal: boolean
    canEditOperational: boolean
    canEditSensitive: boolean
  }
}

type ProfileFormState = {
  name: string
  lastName: string
  jobTitle: string
  avatar: string | null
  department: string
  employeeType: EmployeeType
  verificationStatus: VerificationStatus
  role: UserRole
  isActive: boolean
}

function mapProfileToForm(profile: UserProfileData): ProfileFormState {
  return {
    name: profile.name,
    lastName: profile.lastName || '',
    jobTitle: profile.jobTitle || '',
    avatar: profile.avatar,
    department: profile.department || '',
    employeeType: profile.employeeType,
    verificationStatus: profile.verificationStatus,
    role: profile.role,
    isActive: profile.isActive,
  }
}

export function UserProfileClient({ profile: initialProfile, viewer, permissions }: UserProfileClientProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState(initialProfile)
  const [form, setForm] = useState(() => mapProfileToForm(initialProfile))
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isSelf = profile.id === viewer.id
  const endpoint = isSelf ? '/api/profile' : `/api/users/${profile.id}`

  useEffect(() => {
    setProfile(initialProfile)
    setForm(mapProfileToForm(initialProfile))
  }, [initialProfile])

  const updateField = <K extends keyof ProfileFormState>(field: K, value: ProfileFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const resetForm = () => {
    setForm(mapProfileToForm(profile))
    setError('')
    setSuccess('')
    setIsEditing(false)
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Можно загружать только изображения')
      return
    }

    if (file.size > 1024 * 1024) {
      setError('Аватар должен быть меньше 1 МБ')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      updateField('avatar', typeof reader.result === 'string' ? reader.result : null)
      setError('')
    }
    reader.onerror = () => {
      setError('Не удалось загрузить изображение')
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    const payload: Record<string, unknown> = {
      name: form.name,
      lastName: form.lastName || null,
      jobTitle: form.jobTitle || null,
      avatar: form.avatar,
    }

    if (!isSelf && permissions.canEditOperational) {
      payload.department = form.department || null
      payload.employeeType = form.employeeType
      payload.verificationStatus = form.verificationStatus
    }

    if (permissions.canEditSensitive) {
      payload.role = form.role
      payload.isActive = form.isActive
    }

    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось сохранить профиль')
      }

      setProfile(data)
      setForm(mapProfileToForm(data))
      setSuccess('Профиль успешно обновлён')
      setIsEditing(false)
      router.refresh()
    } catch (saveError: any) {
      setError(saveError.message || 'Не удалось сохранить профиль')
    } finally {
      setSaving(false)
    }
  }

  const canEditAnything = permissions.canEditPersonal || permissions.canEditOperational || permissions.canEditSensitive

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isSelf ? 'Мой профиль' : 'Профиль сотрудника'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isSelf ? 'Личные данные и системный статус вашего аккаунта' : 'Карточка сотрудника и его статус в многопользовательской системе'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEditAnything && !isEditing && (
            <button onClick={() => setIsEditing(true)} className="btn-primary">
              <UserCog className="h-4 w-4" />
              Редактировать профиль
            </button>
          )}
          {isEditing && (
            <>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                <Save className="h-4 w-4" />
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button onClick={resetForm} disabled={saving} className="btn-secondary">
                <X className="h-4 w-4" />
                Отмена
              </button>
            </>
          )}
        </div>
      </div>

      {(error || success) && (
        <div className={cn('rounded-xl border px-4 py-3 text-sm', error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
          {error || success}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <div className="card">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <UserAvatar user={{ name: form.name, lastName: form.lastName, avatar: form.avatar }} size="xl" />
                  {isEditing && permissions.canEditPersonal && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border border-white bg-white text-brand-600 shadow-md transition hover:scale-105 hover:text-brand-700"
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </div>
                <div className="min-w-0 space-y-3">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{getUserDisplayName({ name: form.name, lastName: form.lastName })}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        {profile.email}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5" />
                        {form.jobTitle || 'Должность не указана'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge border border-slate-200 bg-slate-50 text-slate-700 text-xs">{getRoleLabel(profile.role)}</span>
                    <span className={cn('badge border text-xs', getVerificationStatusColor(profile.verificationStatus))}>
                      {getVerificationStatusLabel(profile.verificationStatus)}
                    </span>
                    <span className={cn('badge border text-xs', profile.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700')}>
                      {profile.isActive ? 'Активный аккаунт' : 'Аккаунт отключён'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid min-w-[220px] gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Уровень доступа</div>
                  <div className="mt-1 text-sm font-medium text-slate-700">{getAccessLevelLabel(profile.role)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Тип сотрудника</div>
                  <div className="mt-1 text-sm font-medium text-slate-700">{getEmployeeTypeLabel(profile.employeeType)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Отдел</div>
                  <div className="mt-1 text-sm font-medium text-slate-700">{profile.department || 'Не назначен'}</div>
                </div>
              </div>
            </div>

            {isEditing && permissions.canEditPersonal && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="h-4 w-4" />
                  Загрузить аватар
                </button>
                {form.avatar && (
                  <button type="button" className="btn-secondary" onClick={() => updateField('avatar', null)}>
                    <X className="h-4 w-4" />
                    Удалить аватар
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card space-y-4">
              <div className="flex items-center gap-2">
                <UserCircle2 className="h-4 w-4 text-brand-600" />
                <h3 className="text-sm font-semibold text-slate-800">Личные данные</h3>
              </div>

              <div className="grid gap-4">
                <label className="space-y-1.5">
                  <span className="label mb-0">Имя</span>
                  <input
                    value={form.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    disabled={!isEditing || !permissions.canEditPersonal}
                    className="input"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="label mb-0">Фамилия</span>
                  <input
                    value={form.lastName}
                    onChange={(event) => updateField('lastName', event.target.value)}
                    disabled={!isEditing || !permissions.canEditPersonal}
                    className="input"
                    placeholder="Не указана"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="label mb-0">Должность</span>
                  <input
                    value={form.jobTitle}
                    onChange={(event) => updateField('jobTitle', event.target.value)}
                    disabled={!isEditing || !permissions.canEditPersonal}
                    className="input"
                    placeholder="Например, Менеджер продукта"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="label mb-0">Email</span>
                  <input value={profile.email} disabled className="input bg-slate-50 text-slate-500" />
                  <span className="text-xs text-slate-400">Email используется как логин и меняется только через администратора.</span>
                </label>
              </div>
            </div>

            <div className="card space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-600" />
                <h3 className="text-sm font-semibold text-slate-800">Организационный статус</h3>
              </div>

              <div className="grid gap-4">
                <label className="space-y-1.5">
                  <span className="label mb-0">Отдел</span>
                  <input
                    value={form.department}
                    onChange={(event) => updateField('department', event.target.value)}
                    disabled={!isEditing || !permissions.canEditOperational || isSelf}
                    className="input"
                    placeholder="Например, Разработка продукта"
                  />
                  {(!permissions.canEditOperational || isSelf) && (
                    <span className="text-xs text-slate-400">Поле назначается руководителем или администратором.</span>
                  )}
                </label>

                <label className="space-y-1.5">
                  <span className="label mb-0">Тип сотрудника</span>
                  <select
                    value={form.employeeType}
                    onChange={(event) => updateField('employeeType', event.target.value as EmployeeType)}
                    disabled={!isEditing || !permissions.canEditOperational || isSelf}
                    className="input"
                  >
                    {EMPLOYEE_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {getEmployeeTypeLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="label mb-0">Статус верификации</span>
                  <select
                    value={form.verificationStatus}
                    onChange={(event) => updateField('verificationStatus', event.target.value as VerificationStatus)}
                    disabled={!isEditing || !permissions.canEditOperational || isSelf}
                    className="input"
                  >
                    {VERIFICATION_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {getVerificationStatusLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="label mb-0">Роль в системе</span>
                  <select
                    value={form.role}
                    onChange={(event) => updateField('role', event.target.value as UserRole)}
                    disabled={!isEditing || !permissions.canEditSensitive}
                    className="input"
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {getRoleLabel(option)}
                      </option>
                    ))}
                  </select>
                  {!permissions.canEditSensitive && (
                    <span className="text-xs text-slate-400">Критичные права доступа меняет только администратор.</span>
                  )}
                </label>

                <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-3">
                  <div>
                    <div className="text-sm font-medium text-slate-700">Активность аккаунта</div>
                    <div className="text-xs text-slate-400">Отключённый пользователь не сможет войти в систему.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => updateField('isActive', event.target.checked)}
                    disabled={!isEditing || !permissions.canEditSensitive}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-slate-800">Сводка</h3>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-400">Назначено продуктов</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">{profile._count.assignedProducts}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-400">Комментариев оставлено</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">{profile._count.comments}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-xs text-slate-400">Назначений по этапам</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">{profile._count.stageAssignments}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-slate-800">Системная информация</h3>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                <span className="text-slate-400">Профиль создан</span>
                <span className="font-medium text-slate-700">{formatDate(profile.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Последнее обновление</span>
                <span className="font-medium text-slate-700">{formatDate(profile.updatedAt)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-slate-800">Назначенные продукты</h3>
            </div>

            <div className="mt-4 space-y-2">
              {profile.assignedProducts && profile.assignedProducts.length > 0 ? (
                profile.assignedProducts.map((assignedProduct) => (
                  <Link
                    key={assignedProduct.id}
                    href={`/products/${assignedProduct.id}`}
                    className="flex items-center justify-between rounded-xl border border-slate-100 px-3.5 py-3 transition hover:border-brand-200 hover:bg-brand-50/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">{assignedProduct.name}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{formatDate(assignedProduct.finalDate)}</div>
                    </div>
                    <span className="badge bg-slate-100 text-slate-600 text-[11px]">
                      {assignedProduct.status}
                    </span>
                  </Link>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-400">
                  Для этого сотрудника пока не назначено продуктов.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

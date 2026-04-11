'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Briefcase, Building2, Camera, Mail, Save, Settings, ShieldCheck, Sparkles, Trash2, UserCircle2, UserCog, X } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { UserAvatar } from '@/components/users/UserAvatar'
import { resolveBackNavigation } from '@/lib/navigation'
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
    canDeleteUser: boolean
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

type ActivePanel = 'none' | 'edit' | 'settings'

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
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState(initialProfile)
  const [form, setForm] = useState(() => mapProfileToForm(initialProfile))
  const [activePanel, setActivePanel] = useState<ActivePanel>('none')
  const [saving, setSaving] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const isSelf = profile.id === viewer.id
  const endpoint = isSelf ? '/api/profile' : `/api/users/${profile.id}`
  const canEditAnything = permissions.canEditPersonal || permissions.canEditOperational || permissions.canEditSensitive
  const canOpenSettingsPanel = ['ADMIN', 'DIRECTOR'].includes(viewer.role)
  const canSaveSettings = permissions.canEditOperational || permissions.canEditSensitive
  const backNavigation = resolveBackNavigation(searchParams.get('returnTo'), isSelf ? '/dashboard' : '/users')

  useEffect(() => {
    setProfile(initialProfile)
    setForm(mapProfileToForm(initialProfile))
  }, [initialProfile])

  const updateField = <K extends keyof ProfileFormState>(field: K, value: ProfileFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const closePanel = () => {
    setForm(mapProfileToForm(profile))
    setError('')
    setSuccess('')
    setActivePanel('none')
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

    if (permissions.canEditOperational) {
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
      setActivePanel('none')
      router.refresh()
    } catch (saveError: any) {
      setError(saveError.message || 'Не удалось сохранить профиль')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!permissions.canDeleteUser || isSelf) return
    setConfirmDeleteOpen(true)
  }

  const confirmDeleteUser = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`/api/users/${profile.id}`, {
        method: 'DELETE',
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Не удалось удалить сотрудника')
      }

      setConfirmDeleteOpen(false)
      router.push('/users')
      router.refresh()
    } catch (deleteError: any) {
      setError(deleteError.message || 'Не удалось удалить сотрудника')
    } finally {
      setSaving(false)
    }
  }

  const renderPanelActions = (canSave: boolean) => (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
      {canSave && (
        <button onClick={handleSave} disabled={saving} className="btn-primary w-full justify-center sm:w-auto">
          <Save className="h-4 w-4" />
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      )}
      <button onClick={closePanel} disabled={saving} className="btn-secondary w-full justify-center sm:w-auto">
        <X className="h-4 w-4" />
        Закрыть
      </button>
    </div>
  )

  return (
    <div className="page-section animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={backNavigation.href}
          className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-[15px] font-medium text-primary transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          {backNavigation.label}
        </Link>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Удалить сотрудника?"
        description={`Сотрудник «${getUserDisplayName(profile)}» будет удалён из системы. Это действие нельзя отменить.`}
        confirmLabel="Удалить"
        loading={saving}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={confirmDeleteUser}
      />

      <div className="surface-panel overflow-hidden">
        <div className="flex flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="relative shrink-0">
              <UserAvatar user={{ name: form.name, lastName: form.lastName, avatar: form.avatar }} size="xl" />
              {activePanel === 'edit' && permissions.canEditPersonal && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-card text-foreground shadow-card transition hover:scale-[1.03] hover:bg-accent"
                  aria-label="Обновить аватар"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="min-w-0 space-y-4">
              <div>
                <h1 className="text-[30px] font-semibold tracking-[-0.04em] text-foreground">
                  {getUserDisplayName({ name: form.name, lastName: form.lastName })}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
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
                <span className="badge border border-border/70 bg-muted/75 text-xs text-foreground">{getRoleLabel(profile.role)}</span>
                <span className={cn('badge border text-xs', getVerificationStatusColor(profile.verificationStatus))}>
                  {getVerificationStatusLabel(profile.verificationStatus)}
                </span>
                <span className={cn('badge border text-xs', profile.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-700 dark:text-red-300')}>
                  {profile.isActive ? 'Активный аккаунт' : 'Аккаунт отключён'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            {permissions.canEditPersonal && (
              <button onClick={() => { setError(''); setSuccess(''); setActivePanel('edit') }} className="btn-primary w-full justify-center sm:w-auto">
                <UserCog className="h-4 w-4" />
                Редактировать профиль
              </button>
            )}
            {canOpenSettingsPanel && (
              <button onClick={() => { setError(''); setSuccess(''); setActivePanel('settings') }} className="btn-secondary w-full justify-center px-3.5 py-2 sm:w-auto">
                <Settings className="h-4 w-4" />
                Настройки профиля
              </button>
            )}
          </div>
        </div>

      </div>

      {(error || success) && (
        <div className={cn('rounded-[24px] border px-4 py-3 text-sm', error ? 'border-destructive/20 bg-destructive/10 text-red-700 dark:text-red-300' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')}>
          {error || success}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />

      {activePanel === 'edit' && (
        <div className="surface-panel space-y-5 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <UserCircle2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Редактирование профиля</h3>
            </div>
            {renderPanelActions(true)}
          </div>

          <div className="grid gap-4">
              <label className="space-y-1.5">
                <span className="label mb-0">Имя</span>
                <input
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  disabled={!permissions.canEditPersonal}
                  className="input"
                />
              </label>

              <label className="space-y-1.5">
                <span className="label mb-0">Фамилия</span>
                <input
                  value={form.lastName}
                  onChange={(event) => updateField('lastName', event.target.value)}
                  disabled={!permissions.canEditPersonal}
                  className="input"
                  placeholder="Не указана"
                />
              </label>

              <label className="space-y-1.5">
                <span className="label mb-0">Должность</span>
                <input
                  value={form.jobTitle}
                  onChange={(event) => updateField('jobTitle', event.target.value)}
                  disabled={!permissions.canEditPersonal}
                  className="input"
                  placeholder="Например, Менеджер продукта"
                />
              </label>

              <label className="space-y-1.5">
                <span className="label mb-0">Email</span>
                <input value={profile.email} disabled className="input bg-muted/80 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Email используется как логин и меняется только через администратора.</span>
              </label>
          </div>
        </div>
      )}

      {activePanel === 'settings' && (
        <div className="surface-panel space-y-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Настройки профиля</h3>
            </div>
            {renderPanelActions(canSaveSettings)}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">Организационный статус</h4>
              </div>

              <div className="grid gap-4">
                <label className="space-y-1.5">
                  <span className="label mb-0">Отдел</span>
                  <input
                    value={form.department}
                    onChange={(event) => updateField('department', event.target.value)}
                    disabled={!permissions.canEditOperational}
                    className="input"
                    placeholder="Например, Разработка продукта"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="label mb-0">Тип сотрудника</span>
                  <select
                    value={form.employeeType}
                    onChange={(event) => updateField('employeeType', event.target.value as EmployeeType)}
                    disabled={!permissions.canEditOperational}
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
                    disabled={!permissions.canEditOperational}
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
                    disabled={!permissions.canEditSensitive}
                    className="input"
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {getRoleLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center justify-between rounded-[24px] bg-muted/75 px-4 py-3.5">
                  <div>
                    <div className="text-sm font-medium text-foreground">Активность аккаунта</div>
                    <div className="text-xs text-muted-foreground">Отключённый пользователь не сможет войти в систему.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => updateField('isActive', event.target.checked)}
                    disabled={!permissions.canEditSensitive}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold text-foreground">Системная информация</h4>
              </div>

              <div className="surface-subtle space-y-3 px-4 py-4 text-sm text-muted-foreground">
                <div className="flex justify-between gap-3 border-b border-border/70 pb-2">
                  <span className="text-muted-foreground">Профиль создан</span>
                  <span className="font-medium text-foreground">{formatDate(profile.createdAt)}</span>
                </div>
                <div className="flex justify-between gap-3 border-b border-border/70 pb-2">
                  <span className="text-muted-foreground">Последнее обновление</span>
                  <span className="font-medium text-foreground">{formatDate(profile.updatedAt)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Уровень доступа</span>
                  <span className="max-w-[220px] text-right font-medium text-foreground">{getAccessLevelLabel(profile.role)}</span>
                </div>
              </div>
            </div>
          </div>

          {permissions.canDeleteUser && !isSelf && (
            <div className="border-t border-border/70 pt-5">
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {saving ? 'Удаление...' : 'Удалить сотрудника'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="card">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Сводка</h3>
          </div>
          <div className="mt-4 grid gap-3">
            <div className="surface-subtle px-4 py-4">
              <div className="text-xs text-muted-foreground">Назначено продуктов</div>
              <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">{profile._count.assignedProducts}</div>
            </div>
            <div className="surface-subtle px-4 py-4">
              <div className="text-xs text-muted-foreground">Комментариев оставлено</div>
              <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">{profile._count.comments}</div>
            </div>
            <div className="surface-subtle px-4 py-4">
              <div className="text-xs text-muted-foreground">Назначений по этапам</div>
              <div className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">{profile._count.stageAssignments}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Назначенные продукты</h3>
          </div>

          <div className="mt-4 space-y-2">
            {profile.assignedProducts && profile.assignedProducts.length > 0 ? (
              profile.assignedProducts.map((assignedProduct) => (
                <Link
                  key={assignedProduct.id}
                  href={`/products/${assignedProduct.id}`}
                  className="flex items-center justify-between rounded-[24px] bg-muted/75 px-4 py-3 transition hover:bg-accent"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{assignedProduct.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{formatDate(assignedProduct.finalDate)}</div>
                  </div>
                  <span className="badge bg-muted text-[11px] text-muted-foreground">
                    {assignedProduct.status}
                  </span>
                </Link>
              ))
            ) : (
              <div className="rounded-[24px] bg-muted/75 px-4 py-5 text-sm text-muted-foreground">
                Для этого сотрудника пока не назначено продуктов.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

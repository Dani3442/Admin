import { auth } from '@/lib/auth'
import Link from 'next/link'
import { getRoleLabel } from '@/lib/utils'
import { prisma } from '@/lib/prisma'
import { UserAvatar } from '@/components/users/UserAvatar'

export default async function SettingsPage() {
  const session = await auth()
  const user = session?.user as any
  const [stageTemplatesCount, automationTemplatesCount] = await Promise.all([
    prisma.stageTemplate.count(),
    prisma.automation.count({ where: { isTemplate: true } }),
  ])

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">Настройки</h1>
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Мой профиль</h2>
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
          <UserAvatar user={user || {}} size="lg" />
          <div>
            <p className="text-lg font-semibold text-foreground">{user?.name}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <span className="badge mt-1 bg-brand-100 text-xs text-brand-700 dark:text-blue-300">{getRoleLabel(user?.role)}</span>
          </div>
          </div>
          <Link href="/profile" className="btn-secondary">
            Открыть профиль
          </Link>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Система</h2>
        <div className="space-y-3 text-sm text-foreground">
          <div className="flex justify-between border-b border-border/70 py-2">
            <span className="text-muted-foreground">Версия</span>
            <span className="font-medium">1.0.0</span>
          </div>
          <div className="flex justify-between border-b border-border/70 py-2">
            <span className="text-muted-foreground">База данных</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-300">PostgreSQL — подключена</span>
          </div>
          <div className="flex justify-between border-b border-border/70 py-2">
            <span className="text-muted-foreground">Этапов в шаблоне</span>
            <span className="font-medium">{stageTemplatesCount} этапов</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Автоматизации</span>
            <span className="font-medium">{automationTemplatesCount} шаблонов</span>
          </div>
        </div>
      </div>

      <div className="card border-primary/15 bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.16),_transparent_50%),linear-gradient(180deg,_hsl(var(--card)),_hsl(var(--card)))]">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Документация</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>• Для смены пароля обратитесь к администратору</p>
          <p>• Импорт данных из Excel сейчас доступен только через API, UI для импорта ещё не добавлен</p>
          <p>• Настройка автоматизаций — раздел «Автоматизации»</p>
          <p>• Управление пользователями — раздел «Пользователи» (только для Admin/Директор)</p>
        </div>
      </div>
    </div>
  )
}

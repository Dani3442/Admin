import { auth } from '@/lib/auth'
import { getRoleLabel } from '@/lib/utils'

export default async function SettingsPage() {
  const session = await auth()
  const user = session?.user as any

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Настройки</h1>
        <p className="text-slate-500 text-sm mt-1">Параметры системы</p>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Мой профиль</h2>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-brand-600 flex items-center justify-center text-white text-xl font-bold">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-800">{user?.name}</p>
            <p className="text-sm text-slate-500">{user?.email}</p>
            <span className="badge bg-brand-100 text-brand-700 text-xs mt-1">{getRoleLabel(user?.role)}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Система</h2>
        <div className="space-y-3 text-sm text-slate-600">
          <div className="flex justify-between py-2 border-b border-slate-50">
            <span className="text-slate-500">Версия</span>
            <span className="font-medium">1.0.0</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-50">
            <span className="text-slate-500">База данных</span>
            <span className="font-medium text-emerald-600">PostgreSQL — подключена</span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-50">
            <span className="text-slate-500">Этапов в шаблоне</span>
            <span className="font-medium">30 этапов</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-slate-500">Автоматизации</span>
            <span className="font-medium">4 шаблона</span>
          </div>
        </div>
      </div>

      <div className="card bg-slate-900 border-slate-800">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Документация</h2>
        <div className="space-y-2 text-sm text-slate-400">
          <p>• Для смены пароля обратитесь к администратору</p>
          <p>• Импорт данных из Excel доступен через раздел «Продукты → Импорт»</p>
          <p>• Настройка автоматизаций — раздел «Автоматизации»</p>
          <p>• Управление пользователями — раздел «Пользователи» (только для Admin/Директор)</p>
        </div>
      </div>
    </div>
  )
}

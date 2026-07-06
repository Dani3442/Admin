'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Eye, EyeOff, Loader2 } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

export default function LoginPage() {
  const router = useRouter()
  const telegramContainerRef = useRef<HTMLDivElement | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [telegramBotUsername, setTelegramBotUsername] = useState<string | null>(null)
  const [telegramLoading, setTelegramLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    fetch('/api/auth/telegram-login')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (mounted && data?.botUsername) setTelegramBotUsername(data.botUsername)
      })
      .catch(() => undefined)

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (!telegramBotUsername || !telegramContainerRef.current) return

    const container = telegramContainerRef.current
    container.innerHTML = ''

    ;(window as any).onTelegramAuth = async (user: unknown) => {
      setTelegramLoading(true)
      setError('')

      try {
        const response = await fetch('/api/auth/telegram-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(user),
        })

        if (!response.ok) {
          setError('Telegram не привязан к пользователю или подпись не прошла проверку')
          setTelegramLoading(false)
          return
        }

        router.refresh()
        router.push('/dashboard')
      } catch {
        setError('Не удалось войти через Telegram')
        setTelegramLoading(false)
      }
    }

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', telegramBotUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '14')
    script.setAttribute('data-request-access', 'write')
    script.setAttribute('data-userpic', 'false')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
      delete (window as any).onTelegramAuth
    }
  }, [router, telegramBotUsername])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const normalizedEmail = email.trim().toLowerCase()

    try {
      const response = await fetch('/api/auth/legacy-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
        }),
      })

      if (!response.ok) {
        setError('Неверный email или пароль')
        setLoading(false)
        return
      }

      router.refresh()
      router.push('/dashboard')
    } catch {
      setError('Не удалось подключиться к локальному серверу')
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.18),_transparent_34%),radial-gradient(circle_at_85%_12%,_hsl(var(--chart-5)/0.18),_transparent_28%)]" />
      <div className="absolute right-5 top-5 z-10">
        <ThemeToggle compact />
      </div>
      <div className="w-full max-w-md animate-slide-up">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-balance text-xl font-semibold leading-tight text-foreground">Product Admin</h1>
            <p className="text-xs text-muted-foreground">Система управления продуктами</p>
          </div>
        </div>

        <div className="surface-panel relative overflow-hidden rounded-[32px] p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <h2 className="mb-1 text-xl font-semibold text-foreground">Вход в систему</h2>
          <p className="mb-6 text-sm text-muted-foreground">Введите ваши учётные данные</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="name@company.com"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label">Пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="animate-fade-in rounded-[18px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full justify-center py-2.5" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Входим...
                </>
              ) : (
                'Войти'
              )}
            </button>

            {telegramBotUsername && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border/60" />
                  <span>или</span>
                  <span className="h-px flex-1 bg-border/60" />
                </div>
                <div className="flex min-h-11 justify-center" ref={telegramContainerRef} />
                {telegramLoading && (
                  <p className="text-center text-xs text-muted-foreground">Проверяем Telegram...</p>
                )}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

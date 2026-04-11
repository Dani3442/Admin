'use client'

import { MonitorCog, Moon, SunMedium } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from './ThemeProvider'

interface ThemeToggleProps {
  className?: string
  compact?: boolean
}

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { theme, mounted, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={mounted ? `Переключить тему. Сейчас ${theme === 'dark' ? 'тёмная' : 'светлая'}` : 'Переключить тему'}
      title={mounted ? `Тема: ${theme === 'dark' ? 'тёмная' : 'светлая'}` : 'Переключить тему'}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full border border-border/70 bg-card/88 text-muted-foreground shadow-card transition-all duration-200',
        'hover:border-border hover:bg-accent/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
        compact ? 'h-11 w-11' : 'h-11 px-3.5',
        className
      )}
    >
      {!mounted ? (
        <MonitorCog className="h-4.5 w-4.5" />
      ) : theme === 'dark' ? (
        <>
          <SunMedium className="h-4.5 w-4.5" />
          {!compact && <span className="text-sm font-medium">Light</span>}
        </>
      ) : (
        <>
          <Moon className="h-4.5 w-4.5" />
          {!compact && <span className="text-sm font-medium">Dark</span>}
        </>
      )}
    </button>
  )
}

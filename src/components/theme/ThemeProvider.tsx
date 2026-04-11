'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'product-admin-theme'

type ThemeContextValue = {
  theme: ThemeMode
  mounted: boolean
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const rootTheme = document.documentElement.dataset.theme
    const nextTheme = rootTheme === 'dark' || rootTheme === 'light'
      ? rootTheme
      : getSystemTheme()

    setThemeState(nextTheme)
    applyTheme(nextTheme)
    setMounted(true)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') return

      const systemTheme = media.matches ? 'dark' : 'light'
      setThemeState(systemTheme)
      applyTheme(systemTheme)
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  const setTheme = (nextTheme: ThemeMode) => {
    setThemeState(nextTheme)
    applyTheme(nextTheme)
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
  }

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    mounted,
    setTheme,
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
  }), [mounted, theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }

  return context
}

export function ThemeScript() {
  const script = `
    (function() {
      try {
        var storageKey = '${STORAGE_KEY}';
        var root = document.documentElement;
        var stored = window.localStorage.getItem(storageKey);
        var theme = (stored === 'light' || stored === 'dark')
          ? stored
          : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

        root.classList.toggle('dark', theme === 'dark');
        root.dataset.theme = theme;
        root.style.colorScheme = theme;
      } catch (error) {}
    })();
  `

  return <script dangerouslySetInnerHTML={{ __html: script }} />
}

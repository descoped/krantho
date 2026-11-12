import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored) setTheme(stored)
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const root = document.documentElement
    localStorage.setItem('theme', theme)

    if (theme === 'system') {
      root.classList.remove('light', 'dark')
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.add(prefersDark ? 'dark' : 'light')

      const listener = (e: MediaQueryListEvent): void => {
        root.classList.remove('light', 'dark')
        root.classList.add(e.matches ? 'dark' : 'light')
      }
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', listener)
      return () => mq.removeEventListener('change', listener)
    }

    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme, mounted])

  const cycle = () => {
    setTheme((prev) => {
      if (prev === 'light') return 'dark'
      if (prev === 'dark') return 'system'
      return 'light'
    })
  }

  if (!mounted) return null

  const icon = theme === 'light' ? '\u2600' : theme === 'dark' ? '\u263E' : '\u25D0'
  const label = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'

  return (
    <button
      onClick={cycle}
      className="theme-toggle"
      aria-label={`Theme: ${label}`}
      title={`Theme: ${label}`}
    >
      <span>{icon}</span>
      <span className="theme-toggle-label">{label}</span>
    </button>
  )
}

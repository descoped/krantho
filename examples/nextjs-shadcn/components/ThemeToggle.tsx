'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

export default function ThemeToggle(): React.ReactElement | null {
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

  const cycle = (): void => {
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
      aria-label={`Theme: ${label}`}
      title={`Theme: ${label}`}
      style={{
        background: 'none',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 'var(--radius)',
        color: 'inherit',
        cursor: 'pointer',
        padding: '4px 10px',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      <span>{icon}</span>
      <span style={{ fontSize: '12px' }}>{label}</span>
    </button>
  )
}

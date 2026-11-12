import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'

/** Studio's own key — never the site's `krantho-theme`. */
const STORAGE_KEY = 'krantho-studio-theme'

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

/**
 * The theme choice — light, dark or system. `data-theme` on <html> carries the choice
 * itself (the inline guard in index.html sets it before first paint); with "system",
 * styles/tokens.css follows the OS through `prefers-color-scheme`, live.
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      // Storage unavailable: the choice holds for this page only.
    }
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return { theme, setTheme }
}

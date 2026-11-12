import { useEffect, useState } from 'react'
import { loadLocales, type SiteLocales } from '../lib/locales.js'

/** The site's locales (`lib/locales.ts`); null until read, or when they cannot be read */
export function useLocales(): SiteLocales | null {
  const [locales, setLocales] = useState<SiteLocales | null>(null)
  useEffect(() => {
    let active = true
    loadLocales()
      .then((loaded) => {
        if (active) setLocales(loaded)
      })
      .catch(() => {
        if (active) setLocales(null)
      })
    return () => {
      active = false
    }
  }, [])
  return locales
}

import { useCallback, useState } from 'react'
import { fetchLocaleSettings, type LocaleSettings } from '../lib/api.js'
import { type Loaded, useLoaded } from '../site/use-loaded.js'

/**
 * The site's locales as `GET /api/settings/locales` holds them — the one
 * locale source — read once, and replaced by what a save answers with
 */
export function useLocaleSettings(): {
  loaded: Loaded<LocaleSettings>
  reload: () => void
  set: (settings: LocaleSettings) => void
} {
  const { loaded, reload } = useLoaded(fetchLocaleSettings, 'The locales could not be read')
  const [saved, setSaved] = useState<LocaleSettings | null>(null)
  const set = useCallback((settings: LocaleSettings) => setSaved(settings), [])
  if (saved && loaded.state === 'ready')
    return { loaded: { state: 'ready', data: saved }, reload, set }
  return { loaded, reload, set }
}

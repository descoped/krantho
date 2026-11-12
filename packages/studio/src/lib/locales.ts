import { fetchLocaleSettings } from './api-settings.js'

/**
 * The site's locales as Studio uses them everywhere (`GET /api/settings/locales`):
 * the default locale is the configuration's `site.defaultLocale`, and the
 * supported locales are the active ones: the configured list, or the subset an
 * admin chose in Setup › Locales. Never the configuration's list alone, which
 * that choice narrows.
 */
export interface SiteLocales {
  defaultLocale: string
  supportedLocales: readonly string[]
}

/** The site's locales, read fresh: a change in Setup › Locales shows on the next read */
export async function loadLocales(): Promise<SiteLocales> {
  const { defaultLocale, supportedLocales } = await fetchLocaleSettings()
  return { defaultLocale, supportedLocales }
}

/** Whether documents have versions in more than one locale */
export function hasSeveralLocales(locales: SiteLocales): boolean {
  return locales.supportedLocales.length > 1
}

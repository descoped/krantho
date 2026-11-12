import type { LocaleSettings } from '../lib/api.js'

/** The configured locales that are not active: what Setup can still switch on */
export function addableLocales(settings: LocaleSettings): string[] {
  return settings.configuredLocales.filter((code) => !settings.supportedLocales.includes(code))
}

/** The active locales with one switched on */
export function addedLocale(settings: LocaleSettings, code: string): string[] {
  return [...settings.supportedLocales, code]
}

/** The active locales without one; the default locale stays */
export function removedLocale(settings: LocaleSettings, code: string): string[] {
  if (code === settings.defaultLocale) return settings.supportedLocales
  return settings.supportedLocales.filter((l) => l !== code)
}

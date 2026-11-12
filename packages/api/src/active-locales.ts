import type { ApiContext } from './types.js'

/**
 * The site's active locales: the list an admin chose in Setup › Locales, else
 * the configured ones. A stored locale the configuration no longer lists is
 * left out, and the configuration's default locale is always active.
 */
export async function activeLocales(ctx: ApiContext): Promise<{
  locales: string[]
  stored: boolean
}> {
  const { defaultLocale, supportedLocales: configured } = ctx.config.site
  const stored = await ctx.siteSettingsAdapter?.getSetting('supportedLocales')
  const chosen = stored ? storedLocales(stored) : null
  if (!chosen) return { locales: [...configured], stored: false }
  const kept = chosen.filter((locale) => configured.includes(locale))
  return {
    locales: kept.includes(defaultLocale) ? kept : [defaultLocale, ...kept],
    stored: true,
  }
}

/** The stored list of locale codes, or null when the setting is not one */
function storedLocales(value: string): string[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  return parsed.filter((locale): locale is string => typeof locale === 'string')
}

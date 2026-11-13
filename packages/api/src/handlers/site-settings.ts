import { activeLocales } from '../active-locales.js'
import { requireRole } from '../permissions.js'
import type { ApiHandler } from '../types.js'
import { validateRequestBody } from '../validators.js'

/**
 * GET /api/settings/locales — the site's locales.
 *
 * The default locale is always the configuration's `site.defaultLocale`.
 * `configuredLocales` are the locales the configuration lists; `supportedLocales`
 * are the active ones (`activeLocales`).
 */
export const getLocaleSettings: ApiHandler = async (_req, ctx) => {
  const { defaultLocale, supportedLocales: configuredLocales } = ctx.config.site
  const { locales, stored } = await activeLocales(ctx)

  return {
    status: 200,
    body: {
      defaultLocale,
      configuredLocales,
      supportedLocales: locales,
      source: stored ? 'database' : 'config',
    },
  }
}

/** The reason a list of active locales is not valid for the site, or null */
function localeListError(
  locales: readonly string[],
  configured: readonly string[],
  defaultLocale: string,
): string | null {
  if (locales.length === 0) return 'At least one locale is required'
  if (new Set(locales).size !== locales.length) return 'The list names a locale more than once'
  const unknown = locales.filter((locale) => !configured.includes(locale))
  if (unknown.length > 0) {
    return `${unknown.join(', ')} is not in site.supportedLocales in the configuration (${configured.join(', ')})`
  }
  if (!locales.includes(defaultLocale)) {
    return `The default locale ${defaultLocale} must stay active`
  }
  return null
}

/**
 * PUT /api/settings/locales — choose which of the configured locales are active.
 *
 * The body is `{ supportedLocales: string[] }`. The default locale is the
 * configuration's and is not set here.
 */
export const updateLocaleSettings: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.siteSettingsAdapter) {
    return { status: 501, body: { error: 'Site settings storage not available' } }
  }

  const bodyCheck = validateRequestBody(req.body)
  if (!bodyCheck.isValid) return bodyCheck.response

  const payload = bodyCheck.body as Record<string, unknown>
  const requested = payload.supportedLocales

  if (!Array.isArray(requested) || !requested.every((l: unknown) => typeof l === 'string')) {
    return { status: 400, body: { error: 'supportedLocales must be an array of locale codes' } }
  }

  const { defaultLocale, supportedLocales: configuredLocales } = ctx.config.site
  const error = localeListError(requested as string[], configuredLocales, defaultLocale)
  if (error) return { status: 400, body: { error } }

  await ctx.siteSettingsAdapter.setSetting('supportedLocales', JSON.stringify(requested))

  return {
    status: 200,
    body: {
      defaultLocale,
      configuredLocales,
      supportedLocales: requested,
      source: 'database',
    },
  }
}

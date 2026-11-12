import { PUBLIC_MACHINE_READ_CACHE_CONTROL } from '../public-cache.js'
import type { ApiContext, ApiHandler } from '../types.js'
import { SITEMAP_PUBLIC_PATH } from './seo-sitemap.js'

/**
 * The seo_config id whose `robotsTxt` holds a saved robots.txt override: the
 * site scope's configuration, beside its entities and never among them. An
 * admin saves it through `PUT /api/seo/config/site`; while set, the handler
 * serves it verbatim, otherwise the generated body.
 */
export const robotsOverrideConfigId = 'site' as const

/** Build the default robots.txt body, naming the sitemap at the site's root (`/sitemap.xml`) */
export function buildDefaultRobotsBody(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '')
  return ['User-agent: *', 'Allow: /', '', `Sitemap: ${trimmed}${SITEMAP_PUBLIC_PATH}`].join('\n')
}

/** Read a saved robots override from the site's seo_config, or null if none exists */
export async function loadRobotsOverride(ctx: ApiContext): Promise<string | null> {
  if (!ctx.seoConfigAdapter) return null
  try {
    const config = await ctx.seoConfigAdapter.getConfig(robotsOverrideConfigId)
    const override = config?.config.robotsTxt
    return typeof override === 'string' && override.length > 0 ? override : null
  } catch {
    return null
  }
}

/**
 * GET /api/seo/robots.txt — generate robots.txt with sitemap reference.
 *
 * If an override is stored in seo_config (the site scope's `robotsTxt`), it
 * is returned verbatim. Otherwise a standard robots.txt that
 * allows all crawlers and points to the sitemap is generated dynamically
 * from the handler's site.baseUrl.
 */
export const seoRobots: ApiHandler = async (_req, ctx) => {
  const override = await loadRobotsOverride(ctx)
  const body = override ?? buildDefaultRobotsBody(ctx.config.site.baseUrl)

  return {
    status: 200,
    body,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': PUBLIC_MACHINE_READ_CACHE_CONTROL,
    },
  }
}

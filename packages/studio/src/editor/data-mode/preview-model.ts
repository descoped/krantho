import { buildSeoFieldMap, resolveSeoField } from '@krantho/seo-shared'

/**
 * What a search result and a shared link show for the page, from the draft's
 * current values — resolved in the order the site's meta tags resolve them
 * (`resolveSeoContent` in `@krantho/ui-react`): the document's SEO settings,
 * then its content fields through SEO's field discovery, then the site's defaults.
 */

export interface PreviewInput {
  fields: Readonly<Record<string, unknown>>
  slug: string
  /** The page's own address; null when the site's base URL or the page's path is unknown */
  pageUrl: string | null
  /** The properties of the document's SEO settings (its first entity) */
  documentSeo: Readonly<Record<string, unknown>>
  /** The properties of the site's SEO settings (its first entity) */
  siteSeo: Readonly<Record<string, unknown>>
  /** The site's name from its configuration */
  siteName: string
}

export interface PagePreview {
  title: string
  description: string
  /** The canonical address when set, else the page's own */
  url: string | null
  social: {
    title: string
    description: string
    /** The image's value as stored: an address, or a media id */
    image: string | null
    type: string
    siteName: string
  }
  /** The card X shows: large with an image */
  twitterCard: 'summary_large_image' | 'summary'
}

function text(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value : ''
}

/** The page's preview values; each falls back the way the site's meta tags do */
export function pagePreview(input: PreviewInput): PagePreview {
  const { fields, documentSeo: seo, siteSeo: site } = input
  const map = buildSeoFieldMap(Object.keys(fields))
  const field = (concept: Parameters<typeof resolveSeoField>[1]): string =>
    text(resolveSeoField(map, concept, fields))
  const title = text(seo.headline) || text(seo.name) || field('title') || input.slug
  const description = text(seo.description) || field('description')
  const image = text(seo.image) || field('image') || text(site['og-default-image'])
  const ogImage = field('ogImage') || image
  return {
    title,
    description,
    url: text(seo.url) || field('canonicalUrl') || input.pageUrl,
    social: {
      title: field('ogTitle') || title,
      description: field('ogDescription') || description,
      image: ogImage || null,
      type: field('ogType') || 'website',
      siteName: text(site.name) || input.siteName,
    },
    twitterCard: ogImage ? 'summary_large_image' : 'summary',
  }
}

/** The address as a search result writes it: host, then each path segment after › */
export function resultCrumbs(url: string | null): { host: string; trail: string } {
  if (!url) return { host: '', trail: '' }
  try {
    const parsed = new URL(url)
    const segments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    return { host: parsed.host, trail: segments.map((segment) => ` › ${segment}`).join('') }
  } catch {
    return { host: url, trail: '' }
  }
}

/** Where an image value can be loaded from: an address as is, a media id through the media API */
export function imageSource(value: string): string {
  if (/^(https?:)?\/\//.test(value) || value.startsWith('/')) return value
  return `/api/media/${encodeURIComponent(value)}/image?preset=lg`
}

/** The first entity's properties of a scope's SEO settings, which the site's meta tags read */
export function firstEntityProperties(
  config: { entities: ReadonlyArray<{ properties: Readonly<Record<string, unknown>> }> } | null,
): Readonly<Record<string, unknown>> {
  return config?.entities[0]?.properties ?? {}
}

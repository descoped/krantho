import { buildSeoFieldMap, resolveSeoField } from '@krantho/seo-shared'
import { cache } from 'react'
import { getServerLoader, loadContent } from './content-loader.js'

/** The primary entity's properties of an SEO configuration; empty when none or unreadable */
async function seoConfigProperties(
  configId: string,
  locale?: string | undefined,
): Promise<Record<string, unknown>> {
  try {
    return (await getServerLoader().seoProperties?.(configId, locale)) ?? {}
  } catch (error) {
    console.error(`[krantho] SEO properties for ${configId} could not be read:`, error)
    return {}
  }
}

/** Resolved SEO metadata for a page */
export interface SeoMeta {
  title: string
  description: string
  image?: string | undefined
  canonical?: string | undefined
  author?: string | undefined
  datePublished?: string | undefined
  dateModified?: string | undefined
  og?: {
    title: string
    description: string
    image?: string | undefined
    type: string
    siteName?: string | undefined
    url?: string | undefined
  }
  twitter?: {
    card: string
    site?: string | undefined
  }
}

/**
 * Resolve SEO metadata for a page.
 *
 * Reads the SEO configuration first (user-edited + AI-generated properties),
 * falls back to CMS content fields, then to site-level OG defaults.
 *
 * Priority: seo_config.properties → CMS fields → site defaults
 */
export const resolveSeoContent = cache(
  async (collection: string, slug: string, locale?: string | undefined): Promise<SeoMeta> => {
    // Load CMS content for fallback values
    let cmsFields: Record<string, unknown> = {}
    try {
      const content = await loadContent({ collection, slug, locale })
      cmsFields = content.fields
    } catch {
      // Content may not exist yet
    }

    // Load document-level and site-level SEO configs in parallel
    const [seoProps, siteProps] = await Promise.all([
      seoConfigProperties(`doc:${collection}/${slug}`, locale),
      seoConfigProperties('site'),
    ])

    // Build dynamic field map from CMS fields
    const fieldMap = buildSeoFieldMap(Object.keys(cmsFields))

    // Resolve with priority: seo properties → CMS fields (via field map) → site defaults
    const title =
      str(seoProps.headline) ||
      str(seoProps.name) ||
      resolveSeoField(fieldMap, 'title', cmsFields) ||
      slug

    const description =
      str(seoProps.description) || resolveSeoField(fieldMap, 'description', cmsFields) || ''

    const image =
      str(seoProps.image) ||
      resolveSeoField(fieldMap, 'image', cmsFields) ||
      str(siteProps['og-default-image']) ||
      undefined

    // OG fields: per-document overrides → content fields → resolved values → site defaults
    const ogTitle = resolveSeoField(fieldMap, 'ogTitle', cmsFields) || title
    const ogDescription = resolveSeoField(fieldMap, 'ogDescription', cmsFields) || description
    const ogImage = resolveSeoField(fieldMap, 'ogImage', cmsFields) || image
    const ogType = resolveSeoField(fieldMap, 'ogType', cmsFields) || 'website'
    const siteName = str(siteProps.name) || undefined
    const twitterHandle = str(siteProps['twitter-handle']) || undefined

    const canonicalUrl =
      str(seoProps.url) || resolveSeoField(fieldMap, 'canonicalUrl', cmsFields) || undefined

    return {
      title,
      description,
      image,
      canonical: canonicalUrl,
      author: str(seoProps.author) || resolveSeoField(fieldMap, 'author', cmsFields) || undefined,
      datePublished:
        str(seoProps.datePublished) ||
        resolveSeoField(fieldMap, 'datePublished', cmsFields) ||
        undefined,
      dateModified: str(seoProps.dateModified) || undefined,
      og: {
        title: ogTitle,
        description: ogDescription,
        image: ogImage,
        type: ogType,
        siteName,
        url: canonicalUrl,
      },
      twitter: {
        card: ogImage ? 'summary_large_image' : 'summary',
        site: twitterHandle,
      },
    }
  },
)

function str(v: unknown): string {
  return typeof v === 'string' && v.length > 0 ? v : ''
}

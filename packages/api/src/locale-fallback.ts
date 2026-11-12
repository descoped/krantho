import type { SiteSection } from '@krantho/config'
import { type ContentDocument, canGetContent, type IPersistenceAdapter } from '@krantho/persistence'

/**
 * Build a locale fallback chain from a requested locale.
 *
 * Example: 'es-MX' → ['es-MX', 'es', defaultLocale]
 * Example: 'fr' → ['fr', defaultLocale]
 * Example: 'en' (= default) → ['en']
 */
export function buildFallbackChain(requestedLocale: string, site: SiteSection): string[] {
  const defaultLocale = site.defaultLocale ?? site.language
  const chain: string[] = [requestedLocale]

  // Add parent locale (e.g. 'es-MX' → 'es')
  if (requestedLocale.includes('-')) {
    const parent = requestedLocale.split('-')[0]!
    if (!chain.includes(parent)) {
      chain.push(parent)
    }
  }

  // Add default locale as final fallback
  if (!chain.includes(defaultLocale)) {
    chain.push(defaultLocale)
  }

  return chain
}

/**
 * Get content with locale fallback.
 *
 * Tries the requested locale first, then walks the fallback chain.
 * Returns the first match, or null if no locale has the content.
 */
export async function getContentWithFallback(
  adapter: IPersistenceAdapter,
  collection: string,
  slug: string,
  locale: string,
  site: SiteSection,
): Promise<ContentDocument | null> {
  if (!canGetContent(adapter)) return null

  const chain = buildFallbackChain(locale, site)

  for (const loc of chain) {
    const doc = await adapter.getContent(collection, slug, loc)
    if (doc) return doc
  }

  return null
}

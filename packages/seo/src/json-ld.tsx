/**
 * CMS JSON-LD component — renders Schema.org structured data as a script tag.
 *
 * Encapsulates the dangerouslySetInnerHTML pattern required by React for
 * script tag content. Applies XSS sanitization automatically.
 *
 * Server component — renders in SSR HTML, no client JS.
 */

import { serializeJsonLd } from '@krantho/seo-shared'
import type React from 'react'

interface JsonLdProps {
  /** Schema.org structured data object */
  data: Record<string, unknown>
}

/**
 * Render a JSON-LD script tag with automatic XSS sanitization.
 *
 * @example
 * ```tsx
 * <JsonLd data={{ '@context': 'https://schema.org', '@type': 'LocalBusiness', name: '...' }} />
 * ```
 */
export function JsonLd({ data }: JsonLdProps): React.ReactElement {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: serializeJsonLd escapes `<`, so the JSON cannot end the script tag
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}

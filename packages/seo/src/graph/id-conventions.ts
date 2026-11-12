/**
 * Entity @id conventions for Schema.org @graph linking.
 *
 * IDs follow a predictable pattern so entities can cross-reference
 * each other within the same @graph block.
 *
 * Naming convention for the URL fragment:
 * - Site-level entities use a short, distinctive lowercased name keyed off
 *   the entity's role: `#business`, `#website`, `#person`.
 * - Document-level entities use the lowercased Schema.org type with any
 *   structural suffix dropped:
 *   - `BreadcrumbList` → `#breadcrumb` (drops `List`)
 *   - `FAQPage`        → `#faq`        (drops `Page`)
 *   - `VideoObject`    → `#video`      (drops `Object`)
 * - Schema.org types without a structural suffix use the full lowercased
 *   name: `#article`, `#event`, `#recipe`, `#howto`, `#course`, `#jobposting`.
 *
 * The reason for the asymmetry: short names are more readable in JSON-LD
 * cross-references, but only some Schema.org types have a redundant suffix
 * that can be dropped without ambiguity. Types like `JobPosting` and
 * `LocalBusiness` would lose meaning if shortened.
 *
 * The fragments are URL components, not Schema.org type names — they only
 * need to be unique within a single @graph block. Consumers of the JSON-LD
 * output should not rely on the fragment matching the type name.
 */

/**
 * Build a document @id from base URL, path, and fragment: the page's URL with
 * one trailing slash, then the fragment — the home page (`/`) and the site
 * (`''`) both read `https://example.com/#…`
 */
export function documentId(baseUrl: string, path: string, fragment: string): string {
  const page = `${baseUrl.replace(/\/+$/, '')}${path.replace(/\/+$/, '')}`
  return `${page}/#${fragment}`
}

export function businessId(baseUrl: string): string {
  return documentId(baseUrl, '', 'business')
}

export function websiteId(baseUrl: string): string {
  return documentId(baseUrl, '', 'website')
}

export function personId(baseUrl: string): string {
  return documentId(baseUrl, '', 'person')
}

export function articleId(baseUrl: string, path: string): string {
  return documentId(baseUrl, path, 'article')
}

export function breadcrumbId(baseUrl: string, path: string): string {
  return documentId(baseUrl, path, 'breadcrumb')
}

export function faqId(baseUrl: string, path: string): string {
  return documentId(baseUrl, path, 'faq')
}

export function eventId(baseUrl: string, path: string): string {
  return documentId(baseUrl, path, 'event')
}

export function recipeId(baseUrl: string, path: string): string {
  return documentId(baseUrl, path, 'recipe')
}

export function howToId(baseUrl: string, path: string): string {
  return documentId(baseUrl, path, 'howto')
}

export function courseId(baseUrl: string, path: string): string {
  return documentId(baseUrl, path, 'course')
}

export function jobPostingId(baseUrl: string, path: string): string {
  return documentId(baseUrl, path, 'jobposting')
}

export function videoObjectId(baseUrl: string, path: string): string {
  return documentId(baseUrl, path, 'video')
}

export function serviceId(baseUrl: string, path: string): string {
  return documentId(baseUrl, path, 'service')
}

export function productId(baseUrl: string, path: string): string {
  return documentId(baseUrl, path, 'product')
}

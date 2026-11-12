import { documentPath, type PageCollection, pageCollection } from '@krantho/core'
import { collections, RELEASE_VERSION } from '../krantho.collections'
import type { Summary } from './content'

// Where each content template is rendered: the `path` each collection declares in
// krantho.collections.ts, read through documentPath() — the rule the sitemap,
// Preview on site, page refresh and JSON-LD follow — so links, search and
// llms.txt agree with them. Collections without pages of their own link to where
// they are shown.

const pageCollections: Readonly<Record<string, PageCollection>> = collections

/**
 * Where a release's entry sits on /changelog: its tag (`v0.7.7`), or its slug
 * for the notes from before the first release
 */
export function releaseAnchor(slug: string, fields: Readonly<Record<string, unknown>> = {}): string {
  const version = fields['version']
  return typeof version === 'string' && RELEASE_VERSION.test(version) ? `v${version}` : slug
}

export function routeOf(collection: string, slug: string, doc?: Summary): string {
  switch (collection) {
    case 'faq': {
      const docsPage = doc?.fields['docs-page']
      return typeof docsPage === 'string' && docsPage ? `/docs/${docsPage}#faq` : `/#faq`
    }
    case 'glossary':
      return `/docs/glossary#${slug}`
    case 'releases':
      return `/changelog#${releaseAnchor(slug, doc?.fields)}`
  }
  return documentPath(pageCollection(pageCollections, collection), slug) ?? '/'
}

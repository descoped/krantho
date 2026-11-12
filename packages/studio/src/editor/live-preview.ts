import { documentPath } from '@krantho/core/cache-tags'
import type { CollectionInfo } from '../lib/api-types.js'
import { siteLink } from './header-model.js'

/** Where Live mode loads the page from — the preview entry and the page path it leads to — or why there is none */
export type LivePreview =
  | { readonly src: string; readonly path: string }
  | { readonly src: null; readonly title: string; readonly detail: string }

export interface LivePreviewInput {
  collection: CollectionInfo | null
  /** The saved document's slug; null for a document not saved yet */
  slug: string | null
  /** The locale of the version being edited; null for a document not saved yet */
  locale: string | null
  /** The site's default locale; null when unknown, which counts as another locale */
  defaultLocale: string | null
  /** The site renders drafts for editors (`sitePreview`) */
  sitePreview: boolean
  /** The viewer's role may edit documents, which the preview requires */
  canEdit: boolean
}

function unavailable(title: string, detail: string): LivePreview {
  return { src: null, title, detail }
}

/**
 * The draft preview of the document: `GET /api/preview?collection=&slug=`,
 * the entry the host turns into its own preview of the page — the same link
 * as Open on site — or why the document has none. The entry has no locale,
 * so only the default locale's version is previewed.
 */
export function livePreview(input: LivePreviewInput): LivePreview {
  const { collection, slug, locale, defaultLocale, sitePreview, canEdit } = input
  if (slug === null) return unavailable('The document has no page yet', 'Save it first.')
  if (!sitePreview) {
    const detail = 'Live mode needs the site’s draft preview (sitePreview).'
    return unavailable('The site does not render drafts for editors', detail)
  }
  if (!canEdit) {
    return unavailable('Your role cannot open the draft preview.', 'The preview is for editors.')
  }
  if (locale === null || locale !== defaultLocale) {
    const detail = `Live mode previews the site’s default-locale page; the site’s preview has no locale. Edit ${locale ?? 'this version'} in Structure mode.`
    return unavailable('The site’s preview has no locale', detail)
  }
  const link = siteLink({ collection, slug, liveVersion: null, preview: true, baseUrl: null })
  const path = collection ? documentPath(collection, slug) : null
  if (link?.kind !== 'preview' || path === null) {
    return unavailable('This collection renders no pages', 'There is no page to show.')
  }
  return { src: link.href, path }
}

import { renderContent } from '@krantho/core'
import type { ContentData, PublishedContent } from '@krantho/core'
import { createContentLoader } from '@krantho/server-node'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

// Pages read the live (published) version of each document from the database
// the API opens: both resolve this app's configuration.
const loader = createContentLoader({ config, collections })

/** A published document, rendered for a page */
export interface PageContent {
  slug: string
  data: ContentData
}

/** A document rendered for the client components; in a preview it carries the Live marks' document */
async function render(doc: PublishedContent, preview: boolean): Promise<PageContent> {
  const { content, html, sections } = await renderContent(doc.fields, doc.body)
  const document = { collection: doc.collection, slug: doc.slug, preview }
  return {
    slug: doc.slug,
    data: { fields: doc.fields, content, html, sections, loading: false, error: null, document },
  }
}

/** The published version of a document — its current version in a preview; null when it has none */
export async function loadContent(collection: string, slug: string): Promise<PageContent | null> {
  const [doc, preview] = await Promise.all([loader.getPublished({ collection, slug }), loader.isPreview()])
  return doc ? render(doc, preview) : null
}

/** Every published document in a collection without its body, in its configured order; the body parts of its content are empty */
export async function loadSummaries(collection: string): Promise<PageContent[]> {
  const [docs, preview] = await Promise.all([loader.listPublishedSummaries(collection), loader.isPreview()])
  return docs
    .map((doc) => ({
      slug: doc.slug,
      data: {
        fields: doc.fields,
        content: '',
        html: '',
        sections: {},
        loading: false,
        error: null,
        document: { collection: doc.collection, slug: doc.slug, preview },
      },
    }))
    .sort((a, b) => Number(a.data.fields['order'] ?? 99) - Number(b.data.fields['order'] ?? 99))
}

/** A page's JSON-LD graph, composed from its published version; null when it has none */
export function loadJsonLd(collection: string, slug: string): Promise<Record<string, unknown> | null> {
  return loader.jsonLd({ collection, slug })
}

import { renderContent } from '@krantho/core'
import type { PublishedContent } from '@krantho/core'
import type { MarkedDocument } from '@krantho/core/marks'
import { createContentLoader } from '@krantho/server-sveltekit'
import config from '../../krantho.config'
import { collections } from '../../krantho.collections'

// Pages read the live (published) version of each document from the database
// the API route opens: both resolve this app's configuration.
const loader = createContentLoader({ config, collections })

/** A published document, rendered for a page */
export interface PageContent {
  slug: string
  fields: Record<string, unknown>
  html: string
  /** The markdown body `html` renders */
  body: string
  sections: Record<string, string>
  /** The document, and whether this is an editor's preview: the Live marks apply */
  doc: MarkedDocument
}

async function render(doc: PublishedContent, preview: boolean): Promise<PageContent> {
  const { html, sections } = await renderContent(doc.fields, doc.body)
  return {
    slug: doc.slug,
    fields: doc.fields,
    html,
    body: doc.body,
    sections,
    doc: { collection: doc.collection, slug: doc.slug, preview },
  }
}

/** The published version of a document — its current version in a preview; null when it has none */
export async function loadContent(collection: string, slug: string): Promise<PageContent | null> {
  const [doc, preview] = await Promise.all([loader.getPublished({ collection, slug }), loader.isPreview()])
  return doc ? render(doc, preview) : null
}

/** A published document without its body: the fields a list or a card shows */
export interface SummaryContent {
  slug: string
  fields: Record<string, unknown>
  /** The document, and whether this is an editor's preview: the Live marks apply */
  doc: MarkedDocument
}

/** Every published document in a collection without its body, in its configured order */
export async function loadSummaries(collection: string): Promise<SummaryContent[]> {
  const [docs, preview] = await Promise.all([loader.listPublishedSummaries(collection), loader.isPreview()])
  return docs
    .map((doc) => ({
      slug: doc.slug,
      fields: doc.fields,
      doc: { collection: doc.collection, slug: doc.slug, preview },
    }))
    .sort((a, b) => Number(a.fields['order'] ?? 99) - Number(b.fields['order'] ?? 99))
}

/** A page's JSON-LD graph, composed from its published version; null when it has none */
export function loadJsonLd(collection: string, slug: string): Promise<Record<string, unknown> | null> {
  return loader.jsonLd({ collection, slug })
}

export function loadSection(sections: Record<string, string>, sectionName: string): string {
  return sections[sectionName] ?? ''
}

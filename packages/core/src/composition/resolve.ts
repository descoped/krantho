import { renderContent } from '../content-engine.js'
import type {
  ContentRef as DocumentRef,
  IPublishedContentLoader,
  PublishedContent,
} from '../types.js'
import { resolveParams } from './params.js'
import type { CollectionItem, ResolvedPageContent, SectionsResult, SlugResult } from './types.js'

interface SlugRef extends DocumentRef {
  readonly type: 'slug'
}
interface SectionsRef extends DocumentRef {
  readonly type: 'sections'
  readonly names: readonly string[] | '*'
}
interface CollectionRef {
  readonly type: 'collection'
  readonly collection: string
  readonly locale?: string | undefined
  readonly options: {
    sort?: string | undefined
    limit?: number | undefined
    offset?: number | undefined
    exclude?: string | undefined
  }
}
interface PageDefinition {
  readonly route: string
  readonly content: Readonly<Record<string, SlugRef | SectionsRef | CollectionRef>>
}

/** The server loader owns published reads, preview isolation and dependency tags. */
export interface ResolveContext {
  loader: IPublishedContentLoader
}

async function rendered(document: PublishedContent): Promise<SlugResult> {
  const { html, sections } = await renderContent(document.fields, document.body, {
    atNotation: false,
  })
  return { fields: document.fields, metadata: document.metadata, html, sections }
}

function sectionsOf(content: SlugResult, names: readonly string[] | '*'): SectionsResult {
  return (names === '*' ? Object.keys(content.sections) : names).map((name) => ({
    name,
    title: name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    html: content.sections[name] ?? '',
  }))
}

/** Explicit collection identity prevents collisions; visitors only receive published revisions. */
export async function resolvePageContent(
  page: PageDefinition,
  context: ResolveContext,
  params?: Record<string, string>,
): Promise<ResolvedPageContent> {
  const cache = new Map<string, Promise<SlugResult | null>>()
  const load = (ref: DocumentRef): Promise<SlugResult | null> => {
    const resolved = { ...ref, slug: resolveParams(ref.slug, params) }
    const key = JSON.stringify([resolved.collection, resolved.slug, resolved.locale])
    let promise = cache.get(key)
    if (!promise) {
      promise = context.loader
        .getPublished(resolved)
        .then((document) => (document ? rendered(document) : null))
      cache.set(key, promise)
    }
    return promise
  }
  const entries = await Promise.all(
    Object.entries(page.content).map(async ([key, ref]) => {
      if (ref.type === 'collection')
        return [key, await resolveCollection(ref, context.loader, params)] as const
      const content = await load(ref)
      if (!content) return [key, null] as const
      return [key, ref.type === 'sections' ? sectionsOf(content, ref.names) : content] as const
    }),
  )
  return Object.fromEntries(entries)
}

async function resolveCollection(
  ref: CollectionRef,
  loader: IPublishedContentLoader,
  params?: Record<string, string>,
): Promise<readonly CollectionItem[]> {
  const exclude = ref.options.exclude ? resolveParams(ref.options.exclude, params) : undefined
  const documents = await loader.listPublished(ref.collection, ref.locale)
  let items = await Promise.all(
    documents
      .filter((document) => document.slug !== exclude)
      .map(
        async (document): Promise<CollectionItem> => ({
          slug: document.slug,
          ...(await rendered(document)),
          excerpt:
            typeof document.fields['excerpt'] === 'string' ? document.fields['excerpt'] : undefined,
        }),
      ),
  )
  if (ref.options.sort) {
    const [field = 'slug', direction] = ref.options.sort.split(':')
    items = items.sort((a, b) => {
      const compare = String(a.fields[field] ?? a.slug).localeCompare(
        String(b.fields[field] ?? b.slug),
      )
      return direction === 'desc' ? -compare : compare
    })
  }
  const offset = ref.options.offset ?? 0
  return items.slice(offset, offset + (ref.options.limit ?? items.length))
}

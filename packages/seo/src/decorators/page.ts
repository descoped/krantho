import type { SchemaEntity } from '../graph/types.js'
import { isEmpty } from '../types/values.js'
import { getVocabularyType, isSubtypeOf, lifecycleOf } from '../vocabulary/index.js'
import { isA, nodeById, ref } from './nodes.js'
import type { Decorator } from './types.js'

const PAGE_KINDS: Readonly<Record<string, string>> = {
  item: 'ItemPage',
  collection: 'CollectionPage',
  about: 'AboutPage',
  faq: 'FAQPage',
  profile: 'ProfilePage',
}

/**
 * The Schema.org type of a page of the kind — a named kind, or a current
 * WebPage type — or undefined when the kind names neither
 */
export function pageTypeFor(kind: string | undefined): string | undefined {
  if (kind === undefined) return 'WebPage'
  const named = PAGE_KINDS[kind]
  if (named) return named
  if (!getVocabularyType(kind) || !isSubtypeOf(kind, 'WebPage')) return undefined
  const status = lifecycleOf(kind)?.status
  return status === 'superseded' || status === 'retired' ? undefined : kind
}

/** An image value as the ImageObject `primaryImageOfPage` takes */
function imageObject(image: unknown): unknown {
  const first = Array.isArray(image) ? image[0] : image
  if (typeof first === 'string') return { '@type': 'ImageObject', url: first }
  if (first && typeof first === 'object' && (first as SchemaEntity)['@type'] === 'ImageObject') {
    return first
  }
  return undefined
}

/** Set the property unless the node already has a value for it */
function fill(node: SchemaEntity, property: string, value: unknown): void {
  if (isEmpty(node[property]) && !isEmpty(value)) node[property] = value
}

/**
 * The page node: the page's configured WebPage type, or a node of the type its
 * kind names. It is part of the WebSite, its main entity is what the page is
 * about, and it carries the page's URL, name, image, language and date.
 */
export const pageDecorator: Decorator = {
  id: 'page',
  decorate(graph, page) {
    let node = nodeById(graph, page.pageId)
    if (!node) {
      node = { '@type': pageTypeFor(page.kind) ?? 'WebPage', '@id': page.pageId }
      graph.push(node)
    }
    const website = graph.find((entity) => isA(entity, 'WebSite'))
    const main = page.mainEntityId ? nodeById(graph, page.mainEntityId) : undefined
    fill(node, 'url', page.url)
    fill(node, 'name', page.title)
    if (website?.['@id']) fill(node, 'isPartOf', ref(website['@id']))
    if (main?.['@id']) fill(node, 'mainEntity', ref(main['@id']))
    fill(node, 'primaryImageOfPage', imageObject(main?.image))
    fill(node, 'dateModified', page.dateModified)
    fill(node, 'inLanguage', page.language)
    return graph
  },
}

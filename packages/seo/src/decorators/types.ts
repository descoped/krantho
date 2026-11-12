import type { PageStructure, TrailItem } from '@krantho/core'
import type { SchemaEntity, SeoGraphConfig } from '../graph/types.js'

/** The page a graph describes, as the decorators see it */
export interface PageContext {
  readonly site: SeoGraphConfig
  readonly path: string
  /** The page's absolute URL */
  readonly url: string
  /** The `@id` of the page node: a configured WebPage type of the page, or `<url>/#webpage` */
  readonly pageId: string
  /** The `@id` of the entity the page is about, when it has one besides the page itself */
  readonly mainEntityId?: string | undefined
  readonly title?: string | undefined
  readonly language?: string | undefined
  readonly dateModified?: string | undefined
}

/** A page's structure with every trail URL absolute and the page itself last */
export interface ResolvedStructure extends PageStructure {
  readonly trail?: readonly TrailItem[] | undefined
}

/**
 * Turns a fact of the page's structure into graph nodes and edges. Decorators
 * run in registration order after the entities are built and their references
 * resolved; each returns the graph it was given, changed.
 */
export interface Decorator {
  readonly id: string
  decorate(graph: SchemaEntity[], page: PageContext & ResolvedStructure): SchemaEntity[]
}

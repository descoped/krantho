import type { TrailItem } from '@krantho/core'
import type { PropertySource } from '../catalog/property-atoms.js'
import type { SchemaEntity, SeoGraphConfig } from '../graph/types.js'

/** A property's effective value and where it comes from */
export interface ResolvedProperty {
  readonly value: unknown
  readonly source: PropertySource
  /** Where the value was read: a content field, a configuration setting, or how it was computed */
  readonly origin: string
}

/** Whether an entity describes the site as a whole or the page being rendered */
export type EntityLevel = 'site' | 'document'

/** What a type definition builds an entity from */
export interface BuildContext {
  /** The Schema.org type being built — the definition's own, or a configured subtype */
  readonly type: string
  readonly id: string
  readonly level: EntityLevel
  readonly site: SeoGraphConfig
  /** The page path, `/` for site entities */
  readonly path: string
  /** Every property's resolved value, by Schema.org property name */
  readonly values: ReadonlyMap<string, ResolvedProperty>
  /** The page's title, as its content states it */
  readonly title?: string | undefined
  /** Question and answer pairs the page renders */
  readonly faq?: ReadonlyArray<{ question: string; answer: string }> | undefined
  /** The trail the page renders, root first, with absolute URLs */
  readonly trail?: readonly TrailItem[] | undefined
}

/** How the composer satisfies a reference whose target is not in the graph */
export interface ReferenceRule {
  /** Acceptable target types, in order of preference */
  readonly types: readonly string[]
  /** `site-entity`: point it at a site entity of an acceptable type; `omit`: remove it */
  readonly resolve: 'site-entity' | 'omit'
}

/** How krantho builds one Schema.org type */
export interface TypeDefinition {
  /** The Schema.org type; it must exist in the vocabulary and be current */
  readonly type: string
  /** `site`: one entity for the whole site, whose `@id` does not depend on the page */
  readonly scope: 'site' | 'document'
  /** The `@id` fragment: `#article`, `#business` … */
  readonly idFragment: string
  /** Content fields, besides one named after the property, that hold a property's value */
  readonly fields?: Readonly<Record<string, readonly string[]>> | undefined
  /** Computed page properties the entity carries; all of them when absent */
  readonly computed?: readonly string[] | undefined
  /** Properties whose values are references the composer must resolve */
  readonly references?: Readonly<Record<string, ReferenceRule>> | undefined
  /** The entity's structure; values the builder leaves out are carried by the composer */
  build(context: BuildContext): SchemaEntity
}

import type { PageStructure, TrailItem } from '@krantho/core'
import type { SeoConfigData, SeoConfigEntity } from '@krantho/seo-shared'
import { buildSeoFieldMap, resolveSeoField } from '@krantho/seo-shared'
import { getTypeDefinition } from '../types/registry.js'
import type { ComposedNode, EntityInput } from './build-entity.js'
import { buildEntity, carries, entityInputValues } from './build-entity.js'
import type { ComputedValues } from './resolve-properties.js'
import type { FindingSink } from './resolve-references.js'
import { resolveReferences } from './resolve-references.js'
import '../decorators/index.js'
import type { PageContext, ResolvedStructure } from '../decorators/index.js'
import { pageTypeFor, registeredDecorators } from '../decorators/index.js'
import type { EntityLevel, ResolvedProperty } from '../types/definition.js'
import { isSubtypeOf } from '../vocabulary/index.js'
import type { EffectiveSeoEntity } from './effective-config.js'
import { documentId } from './id-conventions.js'
import type { JsonLdGraph, SchemaEntity, SeoGraphConfig } from './types.js'
import { type ValueScope, valueScope } from './value-scope.js'

/** Document metadata from the CMS persistence layer */
export interface DocumentMeta {
  /** First version creation timestamp (ISO 8601) */
  createdAt: string
  /** Latest version creation timestamp (ISO 8601) */
  updatedAt?: string | undefined
  /** Document locale */
  locale: string
  /** Current version number */
  version: number
}

/** Options for config-driven graph composition */
export interface ComposeFromConfigOptions {
  /** Effective document-level SEO config (resolved from collection → route → document chain) */
  config: SeoConfigData
  /** Page fields from CMS */
  fields: Record<string, unknown>
  /** Site configuration (identity, domain, language, baseUrl) */
  siteConfig: SeoGraphConfig
  /** Current page path */
  path: string
  /** Site-level SEO config — entities rendered alongside document entities */
  siteLevel?: SeoConfigData | null | undefined
  /** Document metadata for system-derived properties */
  documentMeta?: DocumentMeta | undefined
  /**
   * The structure the page's template renders — its trail, its place in a
   * sequence, its kind. The effective configuration's `structure` gives a
   * trail above the page and a kind when the template states none.
   */
  structure?: PageStructure | undefined
  /** Question and answer pairs the page renders */
  faq?: ReadonlyArray<{ question: string; answer: string }> | undefined
  /** Receives what composition left out because the site configures nothing to refer to */
  onFinding?: FindingSink | undefined
}

/** Values computed from the page path and the document's version history */
function computedValues(options: ComposeFromConfigOptions): ComputedValues {
  const page = `${options.siteConfig.baseUrl}${options.path}`
  const meta = options.documentMeta
  return {
    url: page,
    mainEntityOfPage: page,
    datePublished: meta?.createdAt,
    dateModified: meta ? (meta.updatedAt ?? meta.createdAt) : undefined,
    inLanguage: meta?.locale,
  }
}

/** A site entity: the SEO settings and the site configuration, no page content */
function siteEntityInput(entity: SeoConfigEntity, site: SeoGraphConfig): EntityInput {
  return {
    type: entity['@type'],
    level: 'site',
    id: entity['@id'],
    configured: entity.properties,
    fields: {},
    computed: {},
    site,
    path: '',
  }
}

/** A document entity; a type defined for the whole site keeps its site-wide `@id` */
function documentEntityInput(
  entity: SeoConfigEntity,
  options: ComposeFromConfigOptions,
): EntityInput {
  const type = entity['@type']
  const { fields } = options
  return {
    type,
    level: getTypeDefinition(type)?.scope === 'site' ? 'site' : 'document',
    id: entity['@id'],
    configured: entity.properties,
    fields,
    fieldMappings: options.config.fieldMappings,
    computed: computedValues(options),
    site: options.siteConfig,
    path: options.path,
    title: pageTitle(fields),
    faq: options.faq,
    trail: pageStructure(options).trail,
  }
}

/** A trail or sequence URL made absolute against the site's base URL */
function absolute(url: string, site: SeoGraphConfig): string {
  return url.startsWith('/') ? `${site.baseUrl}${url}` : url
}

/** The page's title, as its content states it */
function pageTitle(fields: Record<string, unknown>): string | undefined {
  return resolveSeoField(buildSeoFieldMap(Object.keys(fields)), 'title', fields) || undefined
}

/**
 * The page's structure with absolute URLs: the template's trail, else the
 * configured trail above the page followed by the page; the template's kind,
 * else the configured one. The trail's last step links to the page.
 */
function pageStructure(options: ComposeFromConfigOptions): ResolvedStructure {
  const { siteConfig: site, structure, config } = options
  const page = `${site.baseUrl}${options.path}`
  const steps: readonly TrailItem[] | undefined = structure?.trail?.length
    ? structure.trail
    : config.structure?.trail?.length
      ? [...config.structure.trail, { name: pageTitle(options.fields) ?? '', url: page }]
      : undefined
  const trail = steps?.map((step, index) => {
    const url = step.url ?? (index === steps.length - 1 ? page : undefined)
    return { name: step.name, ...(url ? { url: absolute(url, site) } : {}) }
  })
  const sequence = structure?.sequence && {
    partOf: { ...structure.sequence.partOf, url: absolute(structure.sequence.partOf.url, site) },
    position: structure.sequence.position,
  }
  const kind = structure?.kind ?? config.structure?.kind
  return {
    ...(trail ? { trail } : {}),
    ...(sequence ? { sequence } : {}),
    ...(kind ? { kind } : {}),
  }
}

/** A property's effective value as an editor sees it */
export interface ResolvedPropertyView {
  readonly property: string
  readonly value: unknown
  readonly source: ResolvedProperty['source']
  /** The site, collection, URL pattern or document that set the value; computed; or a link to another entity */
  readonly scope: ValueScope
  /** Where the value was read or how it was computed */
  readonly origin: string
  /** Whether the SEO settings may set it; references the type's structure depends on may not */
  readonly editable: boolean
}

/** An entity of a page with its resolved properties */
export interface ResolvedEntity {
  readonly type: string
  readonly id: string
  readonly level: EntityLevel
  readonly properties: readonly ResolvedPropertyView[]
}

/**
 * What every entity of a page resolves to — each property's value, its
 * source and whether the SEO settings may override it — from the same inputs
 * and in the same order `composeFromConfig` uses, so an editor sees what the
 * page emits and where each value comes from.
 */
export function resolvePageEntities(
  options: Omit<ComposeFromConfigOptions, 'onFinding'>,
): ResolvedEntity[] {
  const inputs = [
    ...(options.siteLevel?.entities ?? []).map((entity) => ({
      input: siteEntityInput(entity, options.siteConfig),
      from: { fromSite: true },
    })),
    ...options.config.entities.map((entity) => ({
      input: documentEntityInput(entity, options),
      from: { fromSite: false, scopes: (entity as Partial<EffectiveSeoEntity>).scopes },
    })),
  ]
  return inputs.map(({ input, from }) => {
    const { id, values, definition } = entityInputValues(input)
    const fixed = new Set(Object.keys(definition?.references ?? {}))
    const carried = [...values].filter(([property, resolved]) =>
      carries(property, resolved, input.type, definition),
    )
    const properties = carried.map(([property, resolved]) => ({
      property,
      value: resolved.value,
      source: resolved.source,
      scope: valueScope(resolved, property, from),
      origin: resolved.origin,
      editable: !fixed.has(property),
    }))
    return { type: input.type, id, level: input.level, properties }
  })
}

/** One node per `@id` — a later entity replaces an earlier one */
function deduplicate(nodes: readonly ComposedNode[]): ComposedNode[] {
  const byId = new Map<string, ComposedNode>()
  const withoutId: ComposedNode[] = []
  for (const node of nodes) {
    const id = node.entity['@id']
    if (typeof id === 'string') byId.set(id, node)
    else withoutId.push(node)
  }
  return [...byId.values(), ...withoutId]
}

/**
 * Compose a page's JSON-LD `@graph` from its SEO configuration:
 *
 * 1. Site entities (the site's organization, WebSite, Person) from the
 *    site-level configuration and the site's identity.
 * 2. Document entities (Article, Service …) from the effective document
 *    configuration, the content fields and values computed from the page.
 * 3. Every reference a type emits resolved within the graph — to a site
 *    entity of an acceptable type, or left out with a finding.
 *
 * Each property's value comes from one source in a fixed order (see
 * `resolveProperties`). An author comes from content fields, field mappings
 * or configuration — never from version history, whose editor identity is
 * private.
 */
export function composeFromConfig(options: ComposeFromConfigOptions): JsonLdGraph {
  const siteEntities = (options.siteLevel?.entities ?? []).map((entity) =>
    buildEntity(siteEntityInput(entity, options.siteConfig)),
  )
  const documentEntities = options.config.entities.map((entity) =>
    buildEntity(documentEntityInput(entity, options)),
  )
  const nodes = deduplicate([...siteEntities, ...documentEntities])
  const graph = resolveReferences(nodes, options.onFinding)
  const page = pageContext(options, documentEntities)
  const decorated = registeredDecorators().reduce(
    (current, decorator) => decorator.decorate(current, page),
    graph,
  )
  return { '@context': 'https://schema.org', '@graph': decorated }
}

/** The page the decorators describe: its page node, its main entity and its structure */
function pageContext(
  options: ComposeFromConfigOptions,
  documentEntities: readonly ComposedNode[],
): PageContext & ResolvedStructure {
  const { siteConfig: site, path } = options
  const structure = pageStructure(options)
  if (structure.kind !== undefined && !pageTypeFor(structure.kind)) {
    options.onFinding?.({
      severity: 'warning',
      code: 'unknown-type',
      profile: 'schema.org',
      message: `The page kind "${structure.kind}" is neither a known kind nor a current Schema.org WebPage type; the page is a WebPage.`,
    })
  }
  const isPage = (entity: SchemaEntity): boolean =>
    typeof entity['@type'] === 'string' && isSubtypeOf(entity['@type'], 'WebPage')
  const pageNode = documentEntities.find((node) => node.level === 'document' && isPage(node.entity))
  const main = documentEntities.find(
    (node) =>
      node.level === 'document' &&
      !isPage(node.entity) &&
      !isSubtypeOf(String(node.entity['@type']), 'BreadcrumbList'),
  )
  const computed = computedValues(options)
  return {
    ...structure,
    site,
    path,
    url: `${site.baseUrl}${path}`,
    pageId: pageNode?.entity['@id'] ?? documentId(site.baseUrl, path, 'webpage'),
    mainEntityId: main?.entity['@id'],
    title: pageTitle(options.fields),
    language: computed.inLanguage ?? site.language,
    dateModified: typeof computed.dateModified === 'string' ? computed.dateModified : undefined,
  }
}

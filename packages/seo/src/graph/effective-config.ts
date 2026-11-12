import type { SeoConfigData, SeoConfigEntity } from '@krantho/seo-shared'

/** A scope of the document-level configuration chain */
export type ConfigScope = 'collection' | 'route' | 'document'

/** Scope-keyed SEO config chain passed to `resolveEffectiveConfig`. */
export interface SeoConfigChain {
  site?: SeoConfigData | null | undefined
  collection?: SeoConfigData | null | undefined
  route?: SeoConfigData | null | undefined
  document?: SeoConfigData | null | undefined
}

/** An entity of the effective configuration, with the scope each of its configured properties came from */
export interface EffectiveSeoEntity extends SeoConfigEntity {
  readonly scopes: Readonly<Record<string, ConfigScope>>
}

/** The effective document-level configuration: entities merged across the chain */
export interface EffectiveSeoConfig extends SeoConfigData {
  readonly entities: readonly EffectiveSeoEntity[]
}

/**
 * Unique key for an entity in the scope chain — used to match and merge
 * entities across scopes. Entities with the same `@type` and `role` are
 * considered the same entity.
 */
function entityKey(entity: SeoConfigEntity): string {
  return entity.role ? `${entity['@type']}:${entity.role}` : entity['@type']
}

/** Each property of the entity, set by this scope */
function scopesOf(entity: SeoConfigEntity, scope: ConfigScope): Record<string, ConfigScope> {
  return Object.fromEntries(Object.keys(entity.properties).map((property) => [property, scope]))
}

/**
 * Resolve effective SEO config from the document-level scope hierarchy:
 * collection → route → document (most specific wins).
 *
 * Entities are matched by `(@type, role)` tuple across scopes. When the
 * same entity appears in multiple scopes, their properties are merged
 * with the more specific scope's values taking precedence, and each
 * property records the scope that gave its value.
 *
 * Field mappings and the page structure are merged across scopes (most
 * specific wins).
 *
 * **Site scope is NOT included** — it's passed separately to
 * `composeFromConfig` as `siteLevel` because site entities use different
 * id conventions and builder logic.
 */
export function resolveEffectiveConfig(configs: SeoConfigChain): EffectiveSeoConfig {
  const entityMap = new Map<string, EffectiveSeoEntity>()
  // Track insertion order: the first scope to introduce an entity determines its
  // position. Since we iterate least-specific → most-specific, the collection
  // scope's ordering is preserved while more specific scopes override properties.
  const entityOrder: string[] = []

  // Process from least specific to most specific (so more specific overwrites)
  const scopes: ReadonlyArray<readonly [ConfigScope, SeoConfigData | null | undefined]> = [
    ['collection', configs.collection],
    ['route', configs.route],
    ['document', configs.document],
  ]

  for (const [scope, config] of scopes) {
    if (!config) continue
    for (const entity of config.entities) {
      const key = entityKey(entity)
      const existing = entityMap.get(key)
      if (existing) {
        // Merge properties: more specific scope overrides per-property
        entityMap.set(key, {
          '@type': entity['@type'],
          ...(entity['@id'] ? { '@id': entity['@id'] } : {}),
          ...(entity.role ? { role: entity.role } : {}),
          properties: { ...existing.properties, ...entity.properties },
          scopes: { ...existing.scopes, ...scopesOf(entity, scope) },
        })
      } else {
        entityMap.set(key, { ...entity, scopes: scopesOf(entity, scope) })
        entityOrder.push(key)
      }
    }
  }

  // Field mappings: merge across scopes (most specific wins)
  const fieldMappings: Record<string, string> = {
    ...(configs.collection?.fieldMappings ?? {}),
    ...(configs.route?.fieldMappings ?? {}),
    ...(configs.document?.fieldMappings ?? {}),
  }

  const entities = entityOrder.flatMap((key) => entityMap.get(key) ?? [])
  const hasFieldMappings = Object.keys(fieldMappings).length > 0

  // Page structure: each setting from the most specific scope that gives it
  const structure = {
    ...configs.collection?.structure,
    ...configs.route?.structure,
    ...configs.document?.structure,
  }
  const hasStructure = Object.keys(structure).length > 0

  return {
    entities,
    ...(hasFieldMappings ? { fieldMappings } : {}),
    ...(hasStructure ? { structure } : {}),
  }
}

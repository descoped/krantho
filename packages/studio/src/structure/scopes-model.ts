import type {
  CatalogType,
  CollectionInfo,
  SeoConfig,
  SeoConfigData,
  SiteConfigResponse,
} from '../lib/api.js'
import { isOffered } from '../lib/catalog-offer.js'
import type { Source } from '../lib/source.js'
import { type Catalog, configOf, configsOf } from './structure-sources.js'

/**
 * The four scopes a page's graph is assembled from — site, collection, URL
 * pattern, document; the narrowest wins — and what each one holds.
 */

/** How many stored configurations each scope has; null when they could not be read */
export interface CascadeCounts {
  siteEntities: number
  collections: number
  routes: number
  documents: number
}

export function cascadeCounts(configs: Source<SeoConfig[]>): CascadeCounts | null {
  if (configs.state !== 'ok') return null
  const all = configs.value
  return {
    siteEntities: configOf(all, 'site')?.config.entities.length ?? 0,
    collections: configsOf(all, 'collection').length,
    routes: configsOf(all, 'route').length,
    documents: configsOf(all, 'document').length,
  }
}

/** A value of the site's identity from krantho.config.ts: read-only, with the setting that changes it */
export interface IdentityRow {
  label: string
  value: string | null
  /** The setting in krantho.config.ts */
  setting: string
}

export function identityRows(site: SiteConfigResponse['site']): IdentityRow[] {
  const text = (value: string | undefined): string | null => (value ? value : null)
  return [
    { label: 'Name', value: site.name, setting: 'site.name' },
    { label: 'Domain', value: site.domain, setting: 'site.domain' },
    { label: 'Base URL', value: site.baseUrl, setting: 'site.baseUrl' },
    { label: 'Language', value: site.language, setting: 'site.language' },
    { label: 'Description', value: text(site.description), setting: 'site.description' },
    { label: 'Alternate name', value: text(site.alternateName), setting: 'site.alternateName' },
    { label: 'Logo', value: text(site.logo), setting: 'site.logo' },
    {
      label: 'Profiles elsewhere',
      value: site.sameAs.length > 0 ? site.sameAs.join(', ') : null,
      setting: 'site.sameAs',
    },
  ]
}

/** A collection with pages and the types its archetype gives them */
/** Why nothing stored may be changed: the stored settings could not be read */
export const SETTINGS_UNREAD = 'The stored settings could not be read; reload before changing them.'

/**
 * A scope's stored configuration: read — null when none is stored — or not
 * read, when the settings could not be. Only a read one is ever saved over.
 */
export type StoredConfig = { state: 'read'; config: SeoConfigData | null } | { state: 'unread' }

/** The stored configuration of one scope, from the settings as they were read */
export function storedConfig(configs: Source<SeoConfig[]>, id: string): StoredConfig {
  if (configs.state !== 'ok') return { state: 'unread' }
  return { state: 'read', config: configOf(configs.value, id)?.config ?? null }
}

export interface ArchetypeRow {
  collection: CollectionInfo
  stored: StoredConfig
  /** The types its pages state; null when the settings could not be read */
  types: string[] | null
}

export function archetypeRows(
  collections: readonly CollectionInfo[],
  configs: Source<SeoConfig[]>,
): ArchetypeRow[] {
  return collections
    .filter((collection) => collection.pages)
    .map((collection) => {
      const stored = storedConfig(configs, `collection:${collection.name}`)
      const types =
        stored.state === 'read'
          ? (stored.config?.entities.map((entity) => entity['@type']) ?? [])
          : null
      return { collection, stored, types }
    })
}

/**
 * The collection's configuration with the chosen types: an entity a type
 * keeps stays as it was (its properties, role and `@id`), a new type gets an
 * empty one, and the field mappings and page structure are kept
 */
export function withTypes(current: SeoConfigData | null, types: readonly string[]): SeoConfigData {
  const kept = current?.entities ?? []
  const entities = types.map(
    (type) => kept.find((entity) => entity['@type'] === type) ?? { '@type': type, properties: {} },
  )
  return { ...(current ?? {}), entities }
}

/** A category of the catalog and its types, in the catalog's order */
export interface CatalogGroup {
  category: string
  label: string
  types: CatalogType[]
}

function grouped(catalog: Catalog, types: readonly CatalogType[]): CatalogGroup[] {
  const groups: CatalogGroup[] = []
  for (const type of types) {
    let group = groups.find((g) => g.category === type.category)
    if (!group) {
      group = {
        category: type.category,
        label: catalog.categories[type.category] ?? type.category,
        types: [],
      }
      groups.push(group)
    }
    group.types.push(type)
  }
  return groups
}

/** The catalog without the types whose search feature a reader has retired */
export function catalogGroups(catalog: Catalog): CatalogGroup[] {
  return grouped(
    catalog,
    catalog.types.filter((type) => type.richResultStatus !== 'retired'),
  )
}

/** The types a collection's archetype can take: page types not retired, and any it already has */
export function archetypeChoices(catalog: Catalog, chosen: ReadonlySet<string>): CatalogGroup[] {
  return grouped(
    catalog,
    catalog.types.filter((type) => type.documentLevel && isOffered(type, chosen.has(type.type))),
  )
}

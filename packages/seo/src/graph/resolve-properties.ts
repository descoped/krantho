import { DEFAULT_AUTO_MAPPINGS } from '../catalog/auto-mappings.js'
import type { PropertyDef } from '../catalog/properties.js'
import { getTypeProperties } from '../catalog/properties.js'
import type { EntityLevel, ResolvedProperty, TypeDefinition } from '../types/definition.js'
import { isEmpty } from '../types/values.js'
import { isSubtypeOf } from '../vocabulary/index.js'
import type { SeoGraphConfig } from './types.js'

/** Thing and CreativeWork properties — what a type the catalog does not list may carry */
const CORE_PROPERTIES = [
  'name',
  'alternateName',
  'description',
  'image',
  'sameAs',
  'identifier',
  'headline',
  'author',
  'publisher',
  'keywords',
  'about',
] as const

/** Values computed from the page and its version history, with how each is computed */
export interface ComputedValues {
  readonly url?: string | undefined
  readonly mainEntityOfPage?: string | undefined
  readonly datePublished?: string | undefined
  readonly dateModified?: string | undefined
  readonly inLanguage?: string | undefined
}

const COMPUTED_ORIGIN: Readonly<Record<keyof ComputedValues, string>> = {
  url: "the page's path",
  mainEntityOfPage: "the page's path",
  datePublished: "the document's first version",
  dateModified: "the document's latest version",
  inLanguage: "the document's locale",
}

/** What the properties of one entity are resolved from */
export interface PropertyInputs {
  readonly type: string
  readonly level: EntityLevel
  readonly definition?: TypeDefinition | undefined
  /** Values an editor or developer set on the entity in the SEO configuration */
  readonly configured: Readonly<Record<string, unknown>>
  /** The document's content fields; empty for site entities */
  readonly fields: Readonly<Record<string, unknown>>
  /** Schema.org property (or `Type.property`) → content field */
  readonly fieldMappings?: Readonly<Record<string, string>> | undefined
  readonly computed: ComputedValues
  readonly site: SeoGraphConfig
}

/** A site setting entities take values from */
export type SiteKey = Exclude<keyof SeoGraphConfig, 'domain'>

const ORGANIZATION_IDENTITY: Readonly<Record<string, SiteKey>> = {
  name: 'name',
  url: 'baseUrl',
  logo: 'logo',
  description: 'description',
  alternateName: 'alternateName',
  sameAs: 'sameAs',
}
const WEBSITE_IDENTITY: Readonly<Record<string, SiteKey>> = {
  name: 'name',
  url: 'baseUrl',
  inLanguage: 'language',
  alternateName: 'alternateName',
}
const PERSON_IDENTITY: Readonly<Record<string, SiteKey>> = { name: 'name', url: 'baseUrl' }
const PAGE_IDENTITY: Readonly<Record<string, SiteKey>> = { inLanguage: 'language' }

/**
 * Which site settings an entity takes its values from: a site entity its
 * identity; a document entity, which describes the page's subject, only the
 * site's language.
 */
function siteIdentity(type: string, level: EntityLevel): Readonly<Record<string, SiteKey>> {
  if (level === 'document') return PAGE_IDENTITY
  if (isSubtypeOf(type, 'Organization')) return ORGANIZATION_IDENTITY
  if (isSubtypeOf(type, 'WebSite')) return WEBSITE_IDENTITY
  if (isSubtypeOf(type, 'Person')) return PERSON_IDENTITY
  return PAGE_IDENTITY
}

/** The site setting a site entity of the type takes the property's value from, if any */
export function siteSettingFor(type: string, property: string): SiteKey | undefined {
  return siteIdentity(type, 'site')[property]
}

/** Every property a value is resolved for */
function candidates(inputs: PropertyInputs, catalog: readonly PropertyDef[]): Set<string> {
  const { type, definition } = inputs
  const listed = catalog.map((def) => def.property)
  const mapped = Object.keys(inputs.fieldMappings ?? {})
    .filter((key) => !key.includes('.') || key.startsWith(`${type}.`))
    .map((key) => key.slice(key.indexOf('.') + 1))
  return new Set([
    ...(listed.length > 0 || definition ? listed : CORE_PROPERTIES),
    ...Object.keys(definition?.fields ?? {}),
    ...Object.keys(inputs.configured).filter((key) => !key.startsWith('@')),
    ...mapped,
    ...Object.keys(siteIdentity(type, inputs.level)),
    ...(inputs.level === 'document' ? Object.keys(COMPUTED_ORIGIN) : []),
  ])
}

/** Whether a field named after the property competes in the default auto-mappings */
function competesByName(property: string): boolean {
  return DEFAULT_AUTO_MAPPINGS.some((m) => m.cmsField === property && m.schemaProperty === property)
}

/**
 * Content fields that may hold the property's value, most specific first:
 * explicit mappings, a field named after the property (unless it competes in
 * the default mappings), the definition's alternate fields, then — for an
 * entity describing the page — the default mappings by priority and the
 * catalog's field. A site entity takes no default mapping: a page's title is
 * not the organization's name.
 */
function contentFields(
  property: string,
  inputs: PropertyInputs,
  def: PropertyDef | undefined,
): string[] {
  const mappings = inputs.fieldMappings ?? {}
  const fields = [mappings[`${inputs.type}.${property}`], mappings[property]]
  if (!competesByName(property)) fields.push(property)
  fields.push(...(inputs.definition?.fields?.[property] ?? []))
  if (inputs.level === 'document') {
    const defaults = DEFAULT_AUTO_MAPPINGS.filter((m) => m.schemaProperty === property)
    fields.push(...[...defaults].sort((a, b) => b.priority - a.priority).map((m) => m.cmsField))
    fields.push(def?.autoMapField)
  }
  return fields.filter((field): field is string => field !== undefined)
}

function resolveOne(
  property: string,
  inputs: PropertyInputs,
  def: PropertyDef | undefined,
): ResolvedProperty | undefined {
  const configured = inputs.configured[property]
  if (!isEmpty(configured))
    return { value: configured, source: 'manual', origin: 'the SEO settings' }
  for (const field of contentFields(property, inputs, def)) {
    const value = inputs.fields[field]
    if (!isEmpty(value)) return { value, source: 'auto', origin: `the content field "${field}"` }
  }
  if (inputs.level === 'document' && property in COMPUTED_ORIGIN) {
    const key = property as keyof ComputedValues
    const value = inputs.computed[key]
    if (!isEmpty(value)) return { value, source: 'computed', origin: COMPUTED_ORIGIN[key] }
  }
  const setting = siteIdentity(inputs.type, inputs.level)[property]
  if (setting && !isEmpty(inputs.site[setting])) {
    return { value: inputs.site[setting], source: 'site', origin: `site.${setting}` }
  }
  return undefined
}

/**
 * Resolve the value of every property an entity may carry, each from one
 * source in a fixed order: the SEO settings (an editor's or developer's
 * entry) › a content field › a value computed from the page › the site
 * configuration. Properties with no value anywhere are absent.
 */
export function resolveProperties(inputs: PropertyInputs): Map<string, ResolvedProperty> {
  const catalog = getTypeProperties(inputs.type)
  const resolved = new Map<string, ResolvedProperty>()
  for (const property of candidates(inputs, catalog)) {
    const def = catalog.find((d) => d.property === property)
    const value = resolveOne(property, inputs, def)
    if (value) resolved.set(property, value)
  }
  return resolved
}

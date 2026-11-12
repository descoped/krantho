import type { ResolvedProperty } from '../types/definition.js'
import type { ConfigScope } from './effective-config.js'

/**
 * Where a value a page emits comes from, as an editor sees it: the site, the
 * collection, a URL pattern or the document itself; computed by krantho from
 * the page and its history; or linked — a reference to another entity
 */
export type ValueScope = 'site' | ConfigScope | 'computed' | 'linked'

/** Whether a value is a reference (`{ "@id": … }`), or a list of them */
function isReference(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0 && value.every(isReference)
  if (value === null || typeof value !== 'object') return false
  const keys = Object.keys(value)
  return (
    typeof (value as Record<string, unknown>)['@id'] === 'string' &&
    keys.every((key) => key === '@id' || key === '@type')
  )
}

/**
 * The scope of one resolved value. A value set in the SEO settings comes from
 * the site settings on a site entity, and from the scope that set it on a
 * document entity — the collection when the document has only its
 * collection's (or the default) archetype.
 */
export function valueScope(
  resolved: ResolvedProperty,
  property: string,
  entity: { fromSite: boolean; scopes?: Readonly<Record<string, ConfigScope>> | undefined },
): ValueScope {
  if (isReference(resolved.value)) return 'linked'
  if (resolved.source === 'computed') return 'computed'
  if (resolved.source === 'site') return 'site'
  if (resolved.source === 'auto') return 'document'
  if (entity.fromSite) return 'site'
  return entity.scopes?.[property] ?? 'collection'
}

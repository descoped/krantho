import { businessId, personId, websiteId } from '../graph/id-conventions.js'
import type { BuildContext, ReferenceRule } from './definition.js'
import { asString, ref } from './values.js'

/** A property's resolved value */
export function propertyValue(context: BuildContext, property: string): unknown {
  return context.values.get(property)?.value
}

/** A property's resolved value as a string, '' when absent or not text */
export function textOf(context: BuildContext, property: string): string {
  return asString(propertyValue(context, property))
}

/** The site's organization, which publishes, provides and organizes on the site's behalf */
export function siteOrganization(context: BuildContext): { '@id': string } {
  return ref(businessId(context.site.baseUrl))
}

/** The site entity a WebSite reference points at */
export function siteWebsite(context: BuildContext): { '@id': string } {
  return ref(websiteId(context.site.baseUrl))
}

/**
 * The author: the content's own (a name becomes a Person; a node is kept as
 * it is), else a reference to the site's Person, which the composer
 * resolves by `AUTHOR_RULE`.
 */
export function authorOf(context: BuildContext): unknown {
  const author = propertyValue(context, 'author')
  if (typeof author === 'string' && author.length > 0) return { '@type': 'Person', name: author }
  if (author && typeof author === 'object') return author
  return ref(personId(context.site.baseUrl))
}

/** An author is the configured Person, else the publishing Organization */
export const AUTHOR_RULE: ReferenceRule = {
  types: ['Person', 'Organization'],
  resolve: 'site-entity',
}

/** Publisher, provider, organizer, hiring organization: the site's Organization */
export const ORGANIZATION_RULE: ReferenceRule = {
  types: ['Organization', 'Person'],
  resolve: 'site-entity',
}

/** The WebSite a page belongs to, when the site configures one */
export const WEBSITE_RULE: ReferenceRule = { types: ['WebSite'], resolve: 'omit' }

import { ORGANIZATION_RULE, siteOrganization } from '../context.js'
import type { TypeDefinition } from '../definition.js'

/**
 * The site's organization. Its identity — name, address, logo, description,
 * profiles — comes from the site configuration and is carried by the
 * composer; the builder only places it.
 */
export const organizationType: TypeDefinition = {
  type: 'Organization',
  scope: 'site',
  idFragment: 'business',
  build: (context) => ({ '@type': context.type, '@id': context.id }),
}

/** A business with a physical location, identified like the Organization */
export const localBusinessType: TypeDefinition = { ...organizationType, type: 'LocalBusiness' }

/** The website, published by the site's organization */
export const webSiteType: TypeDefinition = {
  type: 'WebSite',
  scope: 'site',
  idFragment: 'website',
  references: { publisher: ORGANIZATION_RULE },
  build: (context) => ({
    '@type': context.type,
    '@id': context.id,
    publisher: siteOrganization(context),
  }),
}

/** The person behind the site, named by the content's author when a page describes them */
export const personType: TypeDefinition = {
  type: 'Person',
  scope: 'site',
  idFragment: 'person',
  fields: { name: ['author'] },
  build: (context) => ({ '@type': context.type, '@id': context.id }),
}

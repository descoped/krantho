import { breadcrumbItems } from '../../decorators/breadcrumb.js'
import type { SchemaEntity } from '../../graph/types.js'
import {
  AUTHOR_RULE,
  authorOf,
  ORGANIZATION_RULE,
  propertyValue,
  siteOrganization,
  siteWebsite,
  textOf,
  WEBSITE_RULE,
} from '../context.js'
import type { BuildContext, TypeDefinition } from '../definition.js'
import { compact } from '../values.js'

/** An article: headline, author and publisher; dates, image and description are carried */
export const articleType: TypeDefinition = {
  type: 'Article',
  scope: 'document',
  idFragment: 'article',
  fields: { headline: [], author: [] },
  references: { author: AUTHOR_RULE, publisher: ORGANIZATION_RULE, isPartOf: WEBSITE_RULE },
  build: (context) =>
    compact({
      '@type': context.type,
      '@id': context.id,
      headline: textOf(context, 'headline'),
      author: authorOf(context),
      publisher: siteOrganization(context),
      isPartOf: siteWebsite(context),
    }),
}

/** A service the site's organization provides */
export const serviceType: TypeDefinition = {
  type: 'Service',
  scope: 'document',
  idFragment: 'service',
  fields: { name: [], description: [] },
  references: { provider: ORGANIZATION_RULE },
  build: (context) => ({
    '@type': context.type,
    '@id': context.id,
    provider: siteOrganization(context),
  }),
}

/** A product; its name, description and offers are carried */
export const productType: TypeDefinition = {
  type: 'Product',
  scope: 'document',
  idFragment: 'product',
  fields: { name: [], description: [] },
  build: (context) => ({ '@type': context.type, '@id': context.id }),
}

/** The configured items, else the page's trail, else Home › the page */
function trailItems(context: BuildContext): unknown[] {
  const configured = propertyValue(context, 'itemListElement')
  if (Array.isArray(configured) && configured.length > 0) return configured
  const page = `${context.site.baseUrl}${context.path}`
  return breadcrumbItems(
    context.trail ?? [
      { name: 'Home', url: context.site.baseUrl },
      { name: context.title ?? '', url: page },
    ],
  )
}

/** The page's trail; configured items win over the trail the page renders */
export const breadcrumbListType: TypeDefinition = {
  type: 'BreadcrumbList',
  scope: 'document',
  idFragment: 'breadcrumb',
  computed: [],
  build: (context): SchemaEntity => ({
    '@type': context.type,
    '@id': context.id,
    itemListElement: trailItems(context),
  }),
}

/** Questions and answers the page renders */
export const faqPageType: TypeDefinition = {
  type: 'FAQPage',
  scope: 'document',
  idFragment: 'faq',
  build: (context) =>
    compact({
      '@type': context.type,
      '@id': context.id,
      mainEntity: (context.faq ?? []).map((q) => ({
        '@type': 'Question',
        name: q.question,
        acceptedAnswer: { '@type': 'Answer', text: q.answer },
      })),
    }),
}

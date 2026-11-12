// ---------------------------------------------------------------------------
// The settings Structure reads, in the shapes the real handlers answer: the
// site's public configuration, the SEO settings of every scope, the catalog,
// and the AI provider. Checked against the API's handlers (`seo-config.ts`,
// `llm-settings.ts`) and nextjs-shadcn's answers.
// ---------------------------------------------------------------------------

import type { SeoConfig } from '../../src/lib/api.js'

export const BASE = 'https://fjord.example'
export const BUSINESS_ID = `${BASE}/#business`
export const WEBSITE_ID = `${BASE}/#website`
export const ABOUT_ARTICLE_ID = `${BASE}/about/#article`
export const ABOUT_BREADCRUMB_ID = `${BASE}/about/#breadcrumb`
export const ABOUT_WEBPAGE_ID = `${BASE}/about/#webpage`
export const STRATEGY_SERVICE_ID = `${BASE}/services/strategy/#service`

export const ARTICLE_SOURCE =
  'https://developers.google.com/search/docs/appearance/structured-data/article'
export const LOCAL_SOURCE =
  'https://developers.google.com/search/docs/appearance/structured-data/local-business'
export const SITE_NAMES_SOURCE = 'https://developers.google.com/search/docs/appearance/site-names'
export const EVENT_SOURCE =
  'https://developers.google.com/search/docs/appearance/structured-data/event'
export const BREADCRUMB_SOURCE =
  'https://developers.google.com/search/docs/appearance/structured-data/breadcrumb'

/** `GET /api/site-config`: `PublicConfig`, as the handler serves it */
export const SITE_CONFIG = {
  site: {
    domain: 'fjord.example',
    name: 'Fjord Studio',
    language: 'en',
    baseUrl: BASE,
    supportedLocales: ['en', 'no'],
    defaultLocale: 'en',
    description: 'Calm software for small teams',
    sameAs: [],
  },
  seo: {
    limits: { metaDescription: { minChars: 120, maxChars: 155 }, title: { maxChars: 70 } },
    readers: ['google', 'bing'],
  },
  cache: { pages: 'none', shared: 'none' },
  features: { media: true, localization: true },
  collections: [
    { name: 'pages', source: 'database', fieldCount: 3 },
    { name: 'services', source: 'database', fieldCount: 5 },
    { name: 'globals', source: 'database', fieldCount: 22 },
  ],
}

/** `GET /api/seo/config`: the site, both collections, one URL pattern, one page's own settings */
export const CONFIGS: SeoConfig[] = [
  {
    id: 'collection:pages',
    scope: 'collection',
    config: {
      entities: [
        { '@type': 'Article', role: 'primary', properties: {} },
        { '@type': 'BreadcrumbList', role: 'navigation', properties: {} },
      ],
      fieldMappings: { headline: 'title' },
    },
  },
  {
    id: 'collection:services',
    scope: 'collection',
    config: { entities: [{ '@type': 'Service', role: 'primary', properties: {} }] },
  },
  {
    id: 'site',
    scope: 'site',
    config: {
      entities: [
        {
          '@type': 'ProfessionalService',
          role: 'primary',
          properties: { name: 'Fjord Studio', telephone: '+47 22 00 00 00' },
        },
        { '@type': 'WebSite', role: 'site', properties: {} },
      ],
    },
  },
  {
    id: 'route:/services/*',
    scope: 'route',
    config: { entities: [{ '@type': 'Service', properties: {} }] },
  },
  {
    id: 'doc:pages/about',
    scope: 'document',
    // A page's own settings, as Data mode saves them: one entity per emitted node, its role kept
    config: { entities: [{ '@type': 'Article', role: 'primary', properties: { about: 'Us' } }] },
  },
]

/** `GET /api/seo/catalog`: a type per kind of answer, and the retired ones the catalog still holds */
export const CATALOG = {
  types: [
    {
      type: 'ProfessionalService',
      label: 'Professional Service',
      description: 'A firm.',
      richResult: 'Local business',
      richResultStatus: 'active',
      docsUrl: LOCAL_SOURCE,
      category: 'business',
      siteLevel: true,
      documentLevel: false,
    },
    {
      type: 'WebSite',
      label: 'WebSite',
      description: 'The site.',
      richResult: 'Site names',
      richResultStatus: 'active',
      docsUrl: SITE_NAMES_SOURCE,
      category: 'navigation',
      siteLevel: true,
      documentLevel: false,
    },
    {
      type: 'Article',
      label: 'Article',
      description: 'An article.',
      richResult: 'Article',
      richResultStatus: 'active',
      docsUrl: ARTICLE_SOURCE,
      category: 'content',
      siteLevel: false,
      documentLevel: true,
    },
    {
      type: 'Event',
      label: 'Event',
      description: 'An event.',
      richResult: 'Event',
      richResultStatus: 'active',
      docsUrl: EVENT_SOURCE,
      category: 'people',
      siteLevel: false,
      documentLevel: true,
    },
    {
      type: 'HowTo',
      label: 'How-To',
      description: 'Steps.',
      richResult: 'How-to',
      richResultStatus: 'retired',
      docsUrl: '',
      category: 'content',
      siteLevel: false,
      documentLevel: true,
    },
    {
      type: 'Service',
      label: 'Service',
      description: 'A service.',
      richResult: null,
      richResultStatus: 'none',
      docsUrl: '',
      category: 'commerce',
      siteLevel: false,
      documentLevel: true,
    },
    {
      type: 'Person',
      label: 'Person',
      description: 'A person.',
      richResult: null,
      richResultStatus: 'none',
      docsUrl: '',
      category: 'people',
      siteLevel: true,
      documentLevel: true,
    },
    {
      type: 'BreadcrumbList',
      label: 'Breadcrumb',
      description: 'A trail.',
      richResult: 'Breadcrumb',
      richResultStatus: 'active',
      docsUrl: BREADCRUMB_SOURCE,
      category: 'navigation',
      siteLevel: false,
      documentLevel: true,
    },
    {
      type: 'FAQPage',
      label: 'FAQ Page',
      description: 'Questions.',
      richResult: 'FAQ',
      richResultStatus: 'retired',
      docsUrl: '',
      category: 'content',
      siteLevel: false,
      documentLevel: true,
    },
    {
      type: 'Dataset',
      label: 'Dataset',
      description: 'Data.',
      richResult: 'Dataset Search',
      richResultStatus: 'restricted',
      docsUrl: '',
      category: 'content',
      siteLevel: false,
      documentLevel: true,
    },
  ],
  categories: {
    business: 'Business & Organization',
    content: 'Content & Media',
    commerce: 'Products & Services',
    people: 'People & Events',
    navigation: 'Navigation & Structure',
  },
}

/** `GET /api/settings/llm` with Anthropic set up and no model chosen: the preset's default model */
export const LLM_SETTINGS = {
  configured: true,
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  providers: [],
  assistantProvider: null,
}

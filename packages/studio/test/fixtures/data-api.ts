import { json, type Route } from './site-api.js'

// ---------------------------------------------------------------------------
// The SEO, version and enrichment answers Data mode reads for pages/pricing
// ---------------------------------------------------------------------------

export const ORG_ID = 'https://fjord.example/#org'
export const ARTICLE_ID = 'https://fjord.example/pricing/#article'

/** The resolved entities: one value from each §6 source */
export const RESOLVED = {
  entities: [
    {
      type: 'Organization',
      id: ORG_ID,
      level: 'site',
      properties: [
        {
          property: 'name',
          value: 'Fjord Studio',
          source: 'site',
          scope: 'site',
          origin: 'site.name',
          editable: true,
        },
      ],
    },
    {
      type: 'Article',
      id: ARTICLE_ID,
      level: 'document',
      properties: [
        {
          property: 'headline',
          value: 'Pricing',
          source: 'auto',
          scope: 'document',
          origin: 'the content field "title"',
          editable: true,
        },
        {
          property: 'articleSection',
          value: 'Plans',
          source: 'manual',
          scope: 'collection',
          origin: 'the SEO settings',
          editable: true,
        },
        {
          property: 'about',
          value: 'Costs',
          source: 'manual',
          scope: 'route',
          origin: 'the SEO settings',
          editable: true,
        },
        {
          property: 'url',
          value: 'https://fjord.example/pricing',
          source: 'computed',
          scope: 'computed',
          origin: "the page's path",
          editable: true,
        },
        {
          property: 'publisher',
          value: { '@id': ORG_ID },
          source: 'manual',
          scope: 'linked',
          origin: 'the SEO settings',
          editable: false,
        },
      ],
    },
  ],
}

export const WEBPAGE_ID = 'https://fjord.example/pricing/#webpage'
export const BREADCRUMB_ID = 'https://fjord.example/pricing/#breadcrumb'

/** The graph as composition emits it: the configured entities, then the page and breadcrumb decorators' nodes */
export const EMITTED = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': ORG_ID, name: 'Fjord Studio' },
    {
      '@type': 'Article',
      '@id': ARTICLE_ID,
      headline: 'Pricing',
      articleSection: 'Plans',
      about: 'Costs',
      url: 'https://fjord.example/pricing',
      publisher: { '@id': ORG_ID },
    },
    {
      '@type': 'WebPage',
      '@id': WEBPAGE_ID,
      url: 'https://fjord.example/pricing',
      name: 'Pricing',
      mainEntity: { '@id': ARTICLE_ID },
      breadcrumb: { '@id': BREADCRUMB_ID },
      dateModified: '2026-10-02T10:00:00.000Z',
      inLanguage: 'en',
    },
    {
      '@type': 'BreadcrumbList',
      '@id': BREADCRUMB_ID,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://fjord.example/' },
        { '@type': 'ListItem', position: 2, name: 'Pricing' },
      ],
    },
  ],
}

const FINDINGS = {
  findings: [
    { severity: 'warning', check: 'meta-description', message: 'The meta description is short.' },
    {
      severity: 'error',
      check: 'structured-data',
      message: 'Article needs an image.',
      reader: 'google',
      type: 'Article',
      property: 'image',
      source: 'https://developers.google.com/search/docs/appearance/structured-data/article',
    },
  ],
  readers: [
    { id: 'google', name: 'Google' },
    { id: 'bing', name: 'Bing' },
  ],
}

const SITE_FINDINGS = {
  pages: [
    {
      collection: 'pages',
      slug: 'pricing',
      path: '/pricing',
      readers: { google: { errors: 1, warnings: 0, info: 0 } },
      features: [
        { reader: 'google', feature: 'Article', type: 'Article', eligible: true },
        { reader: 'bing', feature: 'Breadcrumb', type: 'BreadcrumbList', eligible: false },
      ],
    },
  ],
  readers: FINDINGS.readers,
}

export interface Version {
  version: number
  title: string
}

/** Whose versions: pricing in pages, unless another document is named */
export interface VersionsOf {
  collection: string
  slug: string
}

/** A version list and its versions, in the shape the versions endpoints answer */
export function versionRoutes(
  versions: () => readonly Version[],
  of: VersionsOf = { collection: 'pages', slug: 'pricing' },
): Record<string, Route> {
  const base = `/api/content/${of.collection}/${of.slug}/versions`
  const routes: Record<string, Route> = {
    [`GET ${base}`]: () =>
      json({
        // The real list: each version's metadata, without its fields or body
        versions: versions().map(({ version }) => ({
          collection: of.collection,
          slug: of.slug,
          locale: 'en',
          version,
          liveVersion: 2,
          status: 'published',
          source: 'database',
          changedBy: 'editor:person@example.test',
          createdAt: '2026-10-02T10:00:00.000Z',
        })),
      }),
  }
  for (const { version, title } of versions()) {
    routes[`GET ${base}/${version}`] = () =>
      json({
        metadata: {},
        contract: null,
        defaults: [],
        repositoryBasis: null,

        meta: {
          version,
          changedBy: 'editor:person@example.test',
          createdAt: '2026-10-02T10:00:00.000Z',
        },
        fields: { title },
        body: `Body of v${version}`,
      })
  }
  return routes
}

/** Data mode's answers; the LLM is set up unless `llm` says otherwise */
export function dataRoutes(options: { llm?: boolean | undefined } = {}): Record<string, Route> {
  return {
    'GET /api/seo/resolved/pages/pricing': () => json(RESOLVED),
    'GET /api/seo/findings/pages/pricing': () => json(FINDINGS),
    'GET /api/seo/findings': () => json(SITE_FINDINGS),
    'GET /api/seo/preview/pages/pricing': () => json(EMITTED),
    'GET /api/seo/config/site': () => json({ config: null }),
    'GET /api/settings/llm': () =>
      json({
        configured: options.llm ?? true,
        provider: options.llm === false ? null : 'anthropic',
        model: null,
        providers: [],
        assistantProvider: null,
      }),
  }
}

/** Enrichment that answers each step at once: the meta description written, the properties filled */
export function enrichRoutes(sent: Array<Record<string, unknown>>): Record<string, Route> {
  return {
    'POST /api/seo/enrich': (body) => {
      const request = body as Record<string, unknown>
      sent.push(request)
      return json(
        {
          jobId: `job-${String(request.type)}`,
          status: 'running',
          type: request.type,
          totalItems: 1,
        },
        202,
      )
    },
    'GET /api/seo/enrich/status': (_body, url) => {
      const jobId = url.searchParams.get('jobId') ?? ''
      const meta = jobId === 'job-meta-descriptions'
      return json({
        jobId,
        status: 'complete',
        type: meta ? 'meta-descriptions' : 'archetype',
        progress: { total: 1, completed: 1, skipped: 0, errors: 0, current: null },
        items: [
          {
            collection: 'pages',
            slug: 'pricing',
            status: 'complete',
            result: meta ? 'Wrote 142 characters' : 'Filled 2 properties',
          },
        ],
      })
    },
  }
}

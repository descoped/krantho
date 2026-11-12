import {
  ABOUT_ARTICLE_ID,
  ABOUT_BREADCRUMB_ID,
  ABOUT_WEBPAGE_ID,
  ARTICLE_SOURCE,
  BASE,
  BREADCRUMB_SOURCE,
  BUSINESS_ID,
  LOCAL_SOURCE,
  SITE_NAMES_SOURCE,
  STRATEGY_SERVICE_ID,
  WEBSITE_ID,
} from './structure-data.js'

// ---------------------------------------------------------------------------
// The live site as Structure reads it, in the shapes the real handlers and
// pages answer: the live pages' findings with each feature's eligibility, a
// page's HTML as served with its JSON-LD, the resolved values (probed from
// `GET /api/seo/resolved` for the settings in structure-data), and the
// crawler files.
// ---------------------------------------------------------------------------

function feature(
  featureName: string,
  type: string,
  nodeId: string,
  source: string,
  missing: string[] = [],
  conditions: string[] = [],
): Record<string, unknown> {
  return {
    reader: 'google',
    feature: featureName,
    type,
    nodeId,
    status: 'active',
    eligible: missing.length === 0,
    missing,
    conditions,
    source,
  }
}

/** The site's features on every page: the business lacks an address, the site names show on conditions */
const siteFeatures = (): Record<string, unknown>[] => [
  feature('Local business', 'ProfessionalService', BUSINESS_ID, LOCAL_SOURCE, ['address']),
  feature('Site names', 'WebSite', WEBSITE_ID, SITE_NAMES_SOURCE, [], ['On the home page']),
]

/** `GET /api/seo/findings`: three live pages, about with a valid graph, home and strategy with errors */
export const SITE_FINDINGS = {
  pages: [
    {
      collection: 'pages',
      slug: 'about',
      path: '/about',
      readers: {
        page: { errors: 0, warnings: 1, info: 0 },
        google: { errors: 0, warnings: 0, info: 6 },
      },
      features: [
        ...siteFeatures(),
        feature('Article', 'Article', ABOUT_ARTICLE_ID, ARTICLE_SOURCE),
        feature('Breadcrumb', 'BreadcrumbList', ABOUT_BREADCRUMB_ID, BREADCRUMB_SOURCE),
      ],
    },
    {
      collection: 'pages',
      slug: 'home',
      path: '/',
      readers: { google: { errors: 1, warnings: 0, info: 0 } },
      features: [
        ...siteFeatures(),
        feature('Article', 'Article', `${BASE}/#article`, ARTICLE_SOURCE, ['headline']),
      ],
    },
    {
      collection: 'services',
      slug: 'strategy',
      path: '/services/strategy',
      readers: { google: { errors: 1, warnings: 0, info: 0 } },
      features: siteFeatures(),
    },
  ],
  readers: [
    { id: 'google', name: 'Google' },
    { id: 'bing', name: 'Bing' },
  ],
}

/** The about page's JSON-LD as the site serves it: site entities, then the page's own, then the decorators' */
export const ABOUT_SERVED = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ProfessionalService',
      '@id': BUSINESS_ID,
      name: 'Fjord Studio',
      url: BASE,
      telephone: '+47 22 00 00 00',
    },
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      publisher: { '@id': BUSINESS_ID },
      name: 'Fjord Studio',
      url: BASE,
      inLanguage: 'en',
    },
    {
      '@type': 'Article',
      '@id': ABOUT_ARTICLE_ID,
      headline: 'About us',
      author: { '@id': BUSINESS_ID },
      publisher: { '@id': BUSINESS_ID },
      isPartOf: { '@id': WEBSITE_ID },
      description: 'Who we are',
      datePublished: '2026-09-01T08:00:00.000Z',
      dateModified: '2026-10-01T08:00:00.000Z',
      about: 'Us',
      inLanguage: 'en',
      url: `${BASE}/about`,
      mainEntityOfPage: `${BASE}/about`,
    },
    {
      '@type': 'BreadcrumbList',
      '@id': ABOUT_BREADCRUMB_ID,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
        { '@type': 'ListItem', position: 2, name: 'About us', item: `${BASE}/about` },
      ],
    },
    {
      '@type': 'WebPage',
      '@id': ABOUT_WEBPAGE_ID,
      url: `${BASE}/about`,
      name: 'About us',
      isPartOf: { '@id': WEBSITE_ID },
      mainEntity: { '@id': ABOUT_ARTICLE_ID },
      inLanguage: 'en',
      breadcrumb: { '@id': ABOUT_BREADCRUMB_ID },
    },
  ],
}

export const STRATEGY_SERVED = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'ProfessionalService', '@id': BUSINESS_ID, name: 'Fjord Studio' },
    {
      '@type': 'Service',
      '@id': STRATEGY_SERVICE_ID,
      name: 'Strategy',
      provider: { '@id': BUSINESS_ID },
    },
  ],
}

/** A page's HTML with its JSON-LD as `SeoJsonLd` writes it */
export function pageHtml(...graphs: unknown[]): string {
  const scripts = graphs.map(
    (g) => `<script type="application/ld+json">${JSON.stringify(g)}</script>`,
  )
  return `<!doctype html><html><head><title>Page</title>${scripts.join('')}</head><body><h1>Page</h1></body></html>`
}

/** Where a resolved value comes from, as `seo.resolve` names it for each origin */
const SOURCES = {
  /** The site section of krantho.config.ts */
  config: { source: 'site', scope: 'site' },
  /** The site's SEO settings */
  siteSettings: { source: 'manual', scope: 'site' },
  /** The page's own SEO settings */
  pageSettings: { source: 'manual', scope: 'document' },
  /** A content field of the page */
  field: { source: 'auto', scope: 'document' },
  /** Computed from the page and its versions */
  computed: { source: 'computed', scope: 'computed' },
} as const

function resolvedProperty(
  property: string,
  value: unknown,
  from: keyof typeof SOURCES,
  origin: string,
): Record<string, unknown> {
  return { property, value, ...SOURCES[from], origin, editable: true }
}

/**
 * `GET /api/seo/resolved/pages/about`, as the real handler answers it for
 * CONFIGS and the about page: each entity's values with their source and scope
 */
export const ABOUT_RESOLVED = {
  entities: [
    {
      type: 'ProfessionalService',
      id: BUSINESS_ID,
      level: 'site',
      properties: [
        resolvedProperty('name', 'Fjord Studio', 'siteSettings', 'the SEO settings'),
        resolvedProperty('url', BASE, 'config', 'site.baseUrl'),
        resolvedProperty('telephone', '+47 22 00 00 00', 'siteSettings', 'the SEO settings'),
      ],
    },
    {
      type: 'WebSite',
      id: WEBSITE_ID,
      level: 'site',
      properties: [
        resolvedProperty('name', 'Fjord Studio', 'config', 'site.name'),
        resolvedProperty('url', BASE, 'config', 'site.baseUrl'),
        resolvedProperty('inLanguage', 'en', 'config', 'site.language'),
      ],
    },
    {
      type: 'Article',
      id: ABOUT_ARTICLE_ID,
      level: 'document',
      properties: [
        resolvedProperty('headline', 'About us', 'field', 'the content field "title"'),
        resolvedProperty('description', 'Who we are', 'field', 'the content field "description"'),
        resolvedProperty(
          'datePublished',
          '2026-09-01T08:00:00.000Z',
          'computed',
          "the document's first version",
        ),
        resolvedProperty(
          'dateModified',
          '2026-10-01T08:00:00.000Z',
          'computed',
          "the document's latest version",
        ),
        resolvedProperty('about', 'Us', 'pageSettings', 'the SEO settings'),
        resolvedProperty('inLanguage', 'en', 'computed', "the document's locale"),
        resolvedProperty('url', `${BASE}/about`, 'computed', "the page's path"),
        resolvedProperty('mainEntityOfPage', `${BASE}/about`, 'computed', "the page's path"),
      ],
    },
    { type: 'BreadcrumbList', id: ABOUT_BREADCRUMB_ID, level: 'document', properties: [] },
  ],
}

export const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE}/</loc>
    <lastmod>2026-10-02T23:42:05.515Z</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${BASE}/about</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`

/** `GET /api/seo/sitemap.json`: krantho's own list of the live pages */
export const BASE_SITEMAP = [{ loc: `${BASE}/`, changefreq: 'weekly', priority: '1.0' }]

export const ROBOTS = `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml`
export const LLMS = `# Fjord Studio\n\n## pages\n\n- [About us](${BASE}/about): Who we are\n`

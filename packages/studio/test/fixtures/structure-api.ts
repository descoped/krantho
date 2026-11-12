import { json, type Route } from './site-api.js'
import { CATALOG, CONFIGS, LLM_SETTINGS, SITE_CONFIG } from './structure-data.js'
import {
  ABOUT_RESOLVED,
  ABOUT_SERVED,
  BASE_SITEMAP,
  LLMS,
  pageHtml,
  ROBOTS,
  SITE_FINDINGS,
  SITEMAP_XML,
  STRATEGY_SERVED,
} from './structure-pages.js'

// ---------------------------------------------------------------------------
// The routes Structure reads and writes, answered with the fixtures of
// structure-data (the settings) and structure-pages (the live site), in
// groups: the SEO settings, the live pages, the crawler files, the archetype
// impact, and enrichment.
// ---------------------------------------------------------------------------

type Sent = Array<{ key: string; body: unknown }>
type Routes = Record<string, Route>

export function text(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...headers },
  })
}

export interface StructureOptions {
  /** What the site serves at /llms.txt; krantho's own by default */
  servedLlms?: string | null | undefined
  /** What the site serves at /sitemap.xml; null for nothing */
  servedSitemap?: string | null | undefined
  /** The stored SEO settings in place of CONFIGS */
  configs?: typeof CONFIGS | undefined
  /** The stored SEO settings cannot be read: every read of them fails */
  configsFail?: boolean | undefined
  /** The origin header krantho's llms.txt carries; null for none */
  llmsOrigin?: string | null | undefined
}

const failure = (): Response => json({ error: 'Internal server error' }, 500)

/** The SEO settings and the catalog; `sent` collects every settings body written */
function settingsRoutes(options: StructureOptions, sent: Sent): Routes {
  const configs = options.configs ?? CONFIGS
  const site = configs.find((config) => config.id === 'site')
  return {
    'GET /api/site-config': () => json(SITE_CONFIG),
    'GET /api/seo/config': () => (options.configsFail ? failure() : json({ configs })),
    'GET /api/seo/config/site': () =>
      options.configsFail ? failure() : json({ config: site ?? null }),
    'PUT /api/seo/config': (body) => {
      sent.push({ key: 'PUT /api/seo/config', body })
      // The real handler answers with the config it stored, under the id it was sent
      const { id, config } = body as { id: string; config: Record<string, unknown> }
      return json({ config: { id, scope: scopeOfId(id), config } })
    },
    'GET /api/seo/catalog': (_body, url) => {
      const type = url.searchParams.get('type')
      if (!type) return json(CATALOG)
      const found = CATALOG.types.find((t) => t.type === type)
      return found
        ? json({ type: found, properties: [], rules: [] })
        : json({ error: 'Unknown' }, 404)
    },
  }
}

/** The live pages: their findings, their resolved values and their HTML as served */
function pageRoutes(): Routes {
  return {
    'GET /api/seo/findings': () => json(SITE_FINDINGS),
    'GET /api/seo/resolved/pages/about': () => json(ABOUT_RESOLVED),
    'GET /api/seo/resolved/pages/home': () => json({ entities: [] }),
    'GET /api/seo/resolved/services/strategy': () => json({ entities: [] }),
    'GET /about': () => text(pageHtml(ABOUT_SERVED)),
    'GET /': () => text('<html><head></head><body>No structured data</body></html>'),
    'GET /services/strategy': () => text(pageHtml(STRATEGY_SERVED)),
  }
}

/** The sitemap, robots.txt and llms.txt: as the site serves them, and as krantho's API does */
function crawlerRoutes(options: StructureOptions): Routes {
  const served =
    (value: string | null | undefined, fallback: string): Route =>
    () =>
      value === null ? text('Not found', 404) : text(value ?? fallback)
  const origin = options.llmsOrigin === undefined ? 'generated' : options.llmsOrigin
  return {
    'GET /sitemap.xml': served(options.servedSitemap, SITEMAP_XML),
    'GET /api/seo/sitemap.json': () => json({ urls: BASE_SITEMAP }),
    'GET /robots.txt': () => text(ROBOTS),
    'GET /api/seo/robots.txt': () => text(ROBOTS),
    'GET /llms.txt': served(options.servedLlms, LLMS),
    'GET /api/seo/llms.txt': () =>
      text(LLMS, 200, origin === null ? {} : { 'x-krantho-llms-origin': origin }),
  }
}

/** What changing the pages collection's archetype does, and the fields it can be filled from */
function archetypeRoutes(): Routes {
  return {
    'GET /api/seo/collection/pages/impact': (_body, url) =>
      json({
        archetype: url.searchParams.get('archetype') ?? '',
        totalDocuments: 3,
        affectedDocuments: [
          {
            slug: 'about',
            title: 'About us',
            orphanedProperties: [{ entityType: 'Article', property: 'about', value: 'Us' }],
            missingRequired: [],
          },
        ],
        summary: {
          documentsWithOrphans: 1,
          documentsWithMissingRequired: 0,
          totalOrphanedProperties: 1,
          totalMissingRequired: 0,
        },
      }),
    'GET /api/schema/pages': () =>
      json({
        contract: {
          id: 'test/content',
          revision: 'test',
          label: 'Content',
          fields: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              status: { type: 'string' },
            },
          },
          metadata: {},
          body: 'optional',
          sections: [],
        },

        name: 'pages',
        source: 'database',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string' },
          },
        },
      }),
  }
}

/** Every answer Structure reads; `sent` collects the bodies written */
export function structureRoutes(options: StructureOptions = {}, sent: Sent = []): Routes {
  return {
    ...settingsRoutes(options, sent),
    ...pageRoutes(),
    ...crawlerRoutes(options),
    ...archetypeRoutes(),
  }
}

/** The scope the API infers from a config id */
function scopeOfId(id: string): string {
  if (id === 'site') return 'site'
  if (id.startsWith('collection:')) return 'collection'
  if (id.startsWith('route:')) return 'route'
  return 'document'
}

/** A job's items as `GET /api/seo/enrich/status` lists them, per step */
const STEP_ITEMS: Readonly<Record<string, Array<Record<string, unknown>>>> = {
  'meta-descriptions': [
    {
      collection: 'services',
      slug: 'strategy',
      status: 'complete',
      result: 'meta-description: Strategy for calm software teams, from first sketch to launch.',
    },
  ],
  archetype: [
    { collection: 'services', slug: 'strategy', status: 'complete', result: 'Filled 2 properties' },
  ],
}

/** Holds every job running until `release` is called; settles at once without one */
export interface FillGate {
  released: boolean
}

/** `GET /api/seo/enrich/status`: the job of a step, running while held, then complete */
function statusOf(type: string, jobId: string | null, gate: FillGate | undefined): Response {
  const items = STEP_ITEMS[type] ?? []
  const running = gate !== undefined && !gate.released
  return json({
    jobId,
    status: running ? 'running' : 'complete',
    type,
    progress: {
      total: items.length,
      completed: running ? 0 : items.length,
      skipped: 0,
      errors: 0,
      current: running ? 'services/strategy' : null,
    },
    // A running job lists its items as they are, the current one generating
    items: running
      ? items.map((item) => ({
          collection: item['collection'],
          slug: item['slug'],
          status: 'generating',
        }))
      : items,
    summary: { generated: running ? 0 : items.length, skipped: 0, errors: 0 },
    usage: {
      inputTokens: running ? 0 : 1200,
      outputTokens: running ? 0 : 340,
      model: 'fake-model',
    },
  })
}

/** Enrichment: a job per step, settled at once or held by `gate`; with the AI provider set up */
export function fillRoutes(sent: Sent, gate?: FillGate): Routes {
  return {
    'POST /api/seo/enrich': (body) => {
      sent.push({ key: 'POST /api/seo/enrich', body })
      const type = String((body as Record<string, unknown>)['type'])
      return json({ jobId: `job-${type}`, status: 'running', type, totalItems: 1 }, 202)
    },
    'GET /api/seo/enrich/status': (_body, url) => {
      const jobId = url.searchParams.get('jobId')
      return statusOf(jobId?.replace(/^job-/, '') ?? '', jobId, gate)
    },
    'GET /api/settings/llm': () => json(LLM_SETTINGS),
  }
}

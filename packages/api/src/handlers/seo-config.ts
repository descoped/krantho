import type { SeoConfigData, SeoConfigEntity, SeoStructureDefaults } from '@krantho/seo-shared'
import { inferSeoConfigScope } from '@krantho/seo-shared'
import { announceChange } from '../content-change.js'
import { documentOfSeoId, documentSeo, saveDocumentSeo } from '../document-seo.js'
import { requireRole } from '../permissions.js'
import { loadSeoModule } from '../seo-loader.js'
import { isSeoModuleMissing, loadSeo } from '../seo-subsystem.js'
import type { ApiHandler } from '../types.js'
import { validateRequestBody } from '../validators.js'

/**
 * GET /api/seo/catalog — list available Schema.org types. With `?type=`, the
 * type's properties and each active reader's rule for it, with the
 * documentation the rule cites.
 */
export const seoCatalog: ApiHandler = async (req, ctx) => {
  // Dynamic import to avoid bundling seo package in all builds
  const seo = await loadSeoModule()
  const { SCHEMA_CATALOG, CATEGORY_LABELS } = seo
  const typeParam = req.query['type']

  if (typeParam) {
    const catalogType = seo.getCatalogType(typeParam)
    if (!catalogType) {
      return { status: 404, body: { error: `Unknown Schema.org type: ${typeParam}` } }
    }
    const properties = seo.getTypeProperties(typeParam)
    const { readers } = await loadSeo(ctx.config)
    const rules = readers.flatMap((id) => {
      const profile = seo.getProfile(id)
      const rule = profile ? seo.ruleFor(profile, typeParam) : undefined
      return profile && rule ? [{ reader: id, readerName: profile.name, ...rule }] : []
    })
    return { status: 200, body: { type: catalogType, properties, rules } }
  }

  return { status: 200, body: { types: SCHEMA_CATALOG, categories: CATEGORY_LABELS } }
}

/** Types no entity may have: unknown to the vocabulary, superseded or retired; empty without @krantho/seo */
async function unusableTypes(types: readonly string[]): Promise<string[]> {
  let seo: Awaited<ReturnType<typeof loadSeoModule>>
  try {
    seo = await loadSeoModule()
  } catch (err) {
    if (isSeoModuleMissing(err)) return []
    throw err
  }
  return types.flatMap((type) => {
    if (!seo.getVocabularyType(type)) return [`"${type}" is not a Schema.org type`]
    const lifecycle = seo.lifecycleOf(type)
    if (lifecycle?.status === 'superseded') {
      return [`"${type}" is superseded by "${lifecycle.by}" in Schema.org`]
    }
    if (lifecycle?.status === 'retired') return [`"${type}" is retired from Schema.org`]
    return []
  })
}

/** A trail step as stored: a name, and a URL unless it is the page itself */
function isTrailStep(step: unknown): step is { name: string; url?: string } {
  if (typeof step !== 'object' || step === null) return false
  const { name, url } = step as Record<string, unknown>
  return typeof name === 'string' && name !== '' && (url === undefined || typeof url === 'string')
}

/** A scope's page structure from a request; undefined when absent, null when malformed */
function structureOf(raw: unknown): SeoStructureDefaults | undefined | null {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const { trail, kind } = raw as Record<string, unknown>
  if (trail !== undefined && !(Array.isArray(trail) && trail.every(isTrailStep))) return null
  if (kind !== undefined && typeof kind !== 'string') return null
  return {
    ...(trail ? { trail: trail.map(({ name, url }) => (url ? { name, url } : { name })) } : {}),
    ...(kind ? { kind } : {}),
  }
}

/**
 * The site's robots.txt override from a request: undefined when absent or
 * empty, the text when the site scope gives it, else why it is refused
 */
function robotsTxtOf(
  raw: unknown,
  scope: string,
): { robotsTxt: string | undefined } | { error: string } {
  if (raw === undefined || raw === null || raw === '') return { robotsTxt: undefined }
  if (typeof raw !== 'string') return { error: 'robotsTxt takes the robots.txt text' }
  if (scope !== 'site') return { error: 'robotsTxt belongs to the site scope only' }
  return { robotsTxt: raw }
}

/** GET /api/seo/config/:id — get SEO config (site, collection:name, doc:col/slug) */
export const getSeoConfig: ApiHandler = async (req, ctx) => {
  if (!ctx.seoConfigAdapter) {
    return { status: 501, body: { error: 'SEO configuration not available' } }
  }

  const id = req.params['id'] ?? req.query['id']
  if (!id) {
    // List all configs
    const scope = req.query['scope'] as 'site' | 'collection' | 'document' | undefined
    const configs = await ctx.seoConfigAdapter.listConfigs(scope)
    return { status: 200, body: { configs } }
  }

  if (documentOfSeoId(id)) {
    const entry = await documentSeo(ctx, id, req.query['locale'])
    return {
      status: 200,
      body: {
        config: entry?.config
          ? {
              id,
              scope: 'document',
              config: entry.config,
              createdAt: entry.document.meta.createdAt,
              updatedAt: entry.document.meta.createdAt,
            }
          : null,
        version: entry?.document.meta.version ?? null,
      },
    }
  }
  const config = await ctx.seoConfigAdapter.getConfig(id)
  if (!config) {
    return { status: 200, body: { config: null } }
  }

  return { status: 200, body: { config } }
}

/** An entity of a request, with only the keys an entity has */
function entityOf(e: Record<string, unknown>): SeoConfigEntity {
  return {
    '@type': String(e['@type'] ?? ''),
    ...(e['@id'] ? { '@id': String(e['@id']) } : {}),
    ...(e['role'] ? { role: String(e['role']) } : {}),
    properties: (typeof e['properties'] === 'object' && e['properties'] !== null
      ? e['properties']
      : {}) as Record<string, unknown>,
  }
}

/**
 * A scope's configuration from a request — `{ config: { entities, … } }`, or
 * the same keys at the top level — or why it is refused
 */
function configOf(
  payload: Record<string, unknown>,
  scope: string,
): { config: SeoConfigData } | { error: string } {
  const nested = payload['config'] as Record<string, unknown> | undefined
  const pick = (key: string): unknown => nested?.[key] ?? payload[key]
  const rawEntities = Array.isArray(nested?.['entities']) ? nested['entities'] : payload['entities']
  const entities = Array.isArray(rawEntities) ? (rawEntities as Array<Record<string, unknown>>) : []
  const rawFieldMappings = pick('fieldMappings')
  const fieldMappings =
    typeof rawFieldMappings === 'object' && rawFieldMappings !== null
      ? (rawFieldMappings as Record<string, string>)
      : undefined
  const structure = structureOf(pick('structure'))
  if (structure === null)
    return { error: 'structure takes a trail of { name, url? } steps and a kind' }
  const robots = robotsTxtOf(pick('robotsTxt'), scope)
  if ('error' in robots) return robots
  return {
    config: {
      entities: entities.map(entityOf),
      ...(fieldMappings ? { fieldMappings } : {}),
      ...(structure ? { structure } : {}),
      ...(robots.robotsTxt ? { robotsTxt: robots.robotsTxt } : {}),
    },
  }
}

/** PUT /api/seo/config/:id — save SEO config */
export const saveSeoConfig: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.seoConfigAdapter) {
    return { status: 501, body: { error: 'SEO configuration not available' } }
  }

  const bodyCheck = validateRequestBody(req.body)
  if (!bodyCheck.isValid) return bodyCheck.response

  const payload = bodyCheck.body as Record<string, unknown>
  const id = (req.params['id'] ?? req.query['id'] ?? payload['id']) as string | undefined
  if (!id) {
    return { status: 400, body: { error: 'Config ID is required' } }
  }

  const scope = inferSeoConfigScope(id)
  const parsed = configOf(payload, scope)
  if ('error' in parsed) return { status: 400, body: { error: parsed.error } }
  const { config } = parsed

  const issues = await unusableTypes(config.entities.map((entity) => entity['@type']))
  if (issues.length > 0) {
    return { status: 400, body: { error: 'The configuration names types it cannot use', issues } }
  }

  if (scope === 'document') {
    if (!documentOfSeoId(id)) return { status: 400, body: { error: 'Invalid document SEO ID' } }
    const entry = await documentSeo(
      ctx,
      id,
      typeof payload['locale'] === 'string' ? payload['locale'] : req.query['locale'],
    )
    if (!entry) return { status: 404, body: { error: 'Document not found' } }
    if (typeof payload['_version'] !== 'number')
      return { status: 400, body: { error: 'A document version is required' } }
    const saved = await saveDocumentSeo(ctx, entry.document, config, payload['_version'])
    return saved.ok ? { status: 200, body: { ...saved, message: 'Saved draft' } } : saved.response
  }
  await ctx.seoConfigAdapter.saveConfig({ id, scope, config })
  await announceChange(ctx, { kind: 'seo', configId: id })

  const saved = await ctx.seoConfigAdapter.getConfig(id)
  return { status: 200, body: { config: saved } }
}

/** DELETE /api/seo/config/:id — delete SEO config */
export const deleteSeoConfig: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.seoConfigAdapter) {
    return { status: 501, body: { error: 'SEO configuration not available' } }
  }

  const id = req.params['id'] ?? req.query['id']
  if (!id) {
    return { status: 400, body: { error: 'Config ID is required' } }
  }

  if (documentOfSeoId(id)) {
    const payload = req.body as { _version?: unknown; locale?: string } | undefined
    const entry = await documentSeo(ctx, id, payload?.locale ?? req.query['locale'])
    if (!entry) return { status: 404, body: { error: 'Document not found' } }
    if (typeof payload?._version !== 'number')
      return { status: 400, body: { error: 'A document version is required' } }
    const saved = await saveDocumentSeo(ctx, entry.document, null, payload._version)
    return saved.ok ? { status: 200, body: { ...saved, deleted: true } } : saved.response
  }
  await ctx.seoConfigAdapter.deleteConfig(id)
  await announceChange(ctx, { kind: 'seo', configId: id })
  return { status: 200, body: { deleted: true } }
}

/** DELETE /api/seo/config — delete ALL SEO configs (clean slate) */
export const deleteAllSeoConfigs: ApiHandler = async (_req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.seoConfigAdapter) {
    return { status: 501, body: { error: 'SEO configuration not available' } }
  }

  const count = await ctx.seoConfigAdapter.deleteAllConfigs()
  await announceChange(ctx, { kind: 'seo' })

  return {
    status: 200,
    body: { deleted: count, message: `Removed ${count} SEO configurations` },
  }
}

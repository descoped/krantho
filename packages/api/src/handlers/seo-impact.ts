/**
 * Collection impact analysis handler.
 *
 * Evaluates the impact of changing a collection's archetype by scanning
 * all documents and identifying orphaned properties (currently set but
 * unsupported under the new archetype) and missing required properties
 * (required under the new archetype but not currently set).
 *
 * GET /api/seo/collection/:name/impact?archetype=preset-name
 */

import { canQuery, type SeoConfig } from '@krantho/persistence'
import { requireRole } from '../permissions.js'
import { loadSeoModule } from '../seo-loader.js'
import { loadSeo } from '../seo-subsystem.js'
import type { ApiHandler } from '../types.js'

export interface ImpactResponse {
  archetype: string
  totalDocuments: number
  affectedDocuments: Array<{
    slug: string
    title: string
    orphanedProperties: Array<{
      entityType: string
      property: string
      value: unknown
    }>
    missingRequired: Array<{
      entityType: string
      property: string
    }>
  }>
  summary: {
    documentsWithOrphans: number
    documentsWithMissingRequired: number
    totalOrphanedProperties: number
    totalMissingRequired: number
  }
}

export const seoCollectionImpact: ApiHandler = async (req, ctx) => {
  const denied = requireRole(ctx.auth, 'admin')
  if (denied) return denied

  if (!ctx.seoConfigAdapter) {
    return { status: 501, body: { error: 'SEO configuration not available' } }
  }

  const collectionName = req.params.name
  if (!collectionName) {
    return { status: 400, body: { error: 'Collection name required' } }
  }

  const archetypeName = req.query.archetype
  if (!archetypeName) {
    return { status: 400, body: { error: 'Archetype query parameter required' } }
  }

  // Dynamically import to avoid bundling @krantho/seo in the API
  const seo = await loadSeoModule()
  const { readers } = await loadSeo(ctx.config)

  // Build the set of entity types in the proposed archetype
  // For now, accept a comma-separated list of types as the archetype parameter
  const proposedTypes = archetypeName
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  if (proposedTypes.length === 0) {
    return { status: 400, body: { error: 'No types specified in archetype' } }
  }

  const proposedTypeSet = new Set(proposedTypes)

  // The properties any active reader's rule for each type requires
  const requiredByType = new Map<string, readonly string[]>()
  for (const type of proposedTypes) {
    const required = new Set<string>()
    for (const id of readers) {
      const profile = seo.getProfile(id)
      const rule = profile ? seo.ruleFor(profile, type) : undefined
      if (rule?.status === 'active' || rule?.status === 'restricted') {
        for (const property of rule.required ?? []) required.add(property)
      }
    }
    if (required.size > 0) requiredByType.set(type, [...required])
  }

  // List all documents in the collection
  if (!canQuery(ctx.adapter)) {
    return { status: 501, body: { error: 'Collection listing not available' } }
  }

  const { items: documents } = await ctx.adapter.query({
    state: 'current',
    status: 'published',
    projection: 'summary',
    collections: [collectionName],
  })

  // Batch-load all document SEO configs for this collection in a single query
  const docConfigs = await ctx.seoConfigAdapter.listConfigsByPrefix(`doc:${collectionName}/`)
  const configBySlug = new Map<string, SeoConfig>()
  for (const config of docConfigs) {
    // Extract slug from config id: "doc:pages/home" → "home"
    const slug = config.id.slice(`doc:${collectionName}/`.length)
    configBySlug.set(slug, config)
  }

  const affectedDocuments: ImpactResponse['affectedDocuments'] = []

  for (const doc of documents) {
    const docConfig = configBySlug.get(doc.meta.slug)
    if (!docConfig) continue

    const orphanedProperties: Array<{ entityType: string; property: string; value: unknown }> = []
    const missingRequired: Array<{ entityType: string; property: string }> = []

    // Find orphaned properties: properties on entities whose @type is not in the proposed archetype
    for (const entity of docConfig.config.entities) {
      if (!proposedTypeSet.has(entity['@type'])) {
        // Entire entity is orphaned — list all its populated properties
        for (const [prop, val] of Object.entries(entity.properties)) {
          if (val !== undefined && val !== null && val !== '') {
            orphanedProperties.push({
              entityType: entity['@type'],
              property: prop,
              value: val,
            })
          }
        }
      }
    }

    // Find missing required: required properties under the proposed types that are not set
    for (const type of proposedTypes) {
      const required = requiredByType.get(type)
      if (!required) continue

      // Find matching entity in the doc's config
      const docEntity = docConfig.config.entities.find((e) => e['@type'] === type)

      for (const prop of required) {
        const value = docEntity?.properties[prop]
        if (value === undefined || value === null || value === '') {
          missingRequired.push({ entityType: type, property: prop })
        }
      }
    }

    if (orphanedProperties.length > 0 || missingRequired.length > 0) {
      const title = typeof doc.fields.title === 'string' ? doc.fields.title : doc.meta.slug
      affectedDocuments.push({
        slug: doc.meta.slug,
        title,
        orphanedProperties,
        missingRequired,
      })
    }
  }

  const summary = {
    documentsWithOrphans: affectedDocuments.filter((d) => d.orphanedProperties.length > 0).length,
    documentsWithMissingRequired: affectedDocuments.filter((d) => d.missingRequired.length > 0)
      .length,
    totalOrphanedProperties: affectedDocuments.reduce(
      (sum, d) => sum + d.orphanedProperties.length,
      0,
    ),
    totalMissingRequired: affectedDocuments.reduce((sum, d) => sum + d.missingRequired.length, 0),
  }

  const response: ImpactResponse = {
    archetype: archetypeName,
    totalDocuments: documents.length,
    affectedDocuments,
    summary,
  }

  return { status: 200, body: response }
}

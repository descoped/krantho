import { toPublicConfig } from '@krantho/config/public'
import type { ApiHandler } from '../types.js'

/**
 * GET /api/site-config — the browser-safe configuration (`PublicConfig`: site
 * identity, SEO limits and readers, features, page-cache settings) and the
 * collection schemas
 */
export const siteConfigHandler: ApiHandler = async (_req, ctx) => {
  const collections: Array<{
    name: string
    source: string
    fieldCount: number
  }> = []

  for (const [name, collection] of ctx.contentConfig.collections) {
    const schema = collection.schema
    let fieldCount = 0
    if (schema && 'shape' in schema && typeof schema.shape === 'object' && schema.shape) {
      fieldCount = Object.keys(schema.shape).length
    }
    collections.push({
      name,
      source: collection.source,
      fieldCount,
    })
  }

  return {
    status: 200,
    body: { ...toPublicConfig(ctx.config), collections },
  }
}

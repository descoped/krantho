import type { ApiHandler, ApiResponse } from '../types.js'
import { hasVersioning } from '../types.js'

/** GET /api/capabilities — runtime feature detection */
export const capabilities: ApiHandler = async (_req, ctx): Promise<ApiResponse> => {
  const persistence = ctx.persistenceType ?? 'filesystem'

  // Build descriptive capabilities instead of bare booleans
  const features: Record<string, string> = {}

  features.write = typeof ctx.adapter.writeContent === 'function' ? 'enabled' : 'read-only'
  features.versioning = hasVersioning(ctx.adapter) ? 'append-only' : 'disabled'
  features.checkpoints = ctx.checkpointAdapter !== undefined ? 'enabled' : 'disabled'
  features.contentMigration = ctx.contentMigrationAdapter !== undefined ? 'enabled' : 'disabled'
  // The file store's provider name ('local', 'vercel-blob', 's3', 'gcs')
  features.media =
    ctx.mediaStorage === undefined ? 'disabled' : (ctx.config.media.provider ?? 'enabled')
  features.mediaFolders = ctx.mediaFolderStorage !== undefined ? 'enabled' : 'disabled'
  features.imageOptimizer = ctx.imageOptimizer !== undefined ? 'sharp' : 'disabled'
  features.runtimeSchema =
    typeof ctx.adapter.getRuntimeSchema === 'function' ? 'enabled' : 'disabled'
  features.webhooks = ctx.fireWebhook !== undefined ? 'enabled' : 'disabled'
  features.webhookDeliveries = ctx.webhookDeliveryAdapter !== undefined ? 'enabled' : 'disabled'
  features.seo = ctx.seoConfigAdapter !== undefined ? 'enabled' : 'disabled'
  // `GET /api/preview` exists: Studio offers Live mode and Open on site
  features.sitePreview = ctx.sitePreview ?? 'disabled'
  // Localization is enabled when the site declares more than one supported
  // locale. Single-locale sites don't need translation tracking — the
  // /api/translations/status handler already short-circuits in that case,
  // so hiding the UI matches server behavior.
  const supportedLocales = ctx.config.site.supportedLocales
  features.localization = supportedLocales.length > 1 ? 'enabled' : 'disabled'
  // Only present when on: Studio treats a missing key as off
  if (ctx.config.assistant.enabled) features.assistant = 'enabled'

  return {
    status: 200,
    body: {
      persistence,
      // The server package hosting the API; null when the API is created without one
      framework: ctx.framework ?? null,
      authMode: ctx.config.auth.mode,
      schemaVersion: ctx.schemaVersion ?? null,
      features,
    },
  }
}

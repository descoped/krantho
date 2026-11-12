import type { ContentHooks } from './hooks.js'
import type { ApiHandler } from './types.js'

/** Custom API route definition */
export interface PluginRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  handler: ApiHandler
}

/** Custom Studio page definition (metadata only — admin renders based on this) */
export interface PluginStudioPage {
  /** Route path in Studio (e.g., 'analytics') → /studio/plugins/analytics */
  path: string
  /** Display name in sidebar */
  label: string
  /** URL to the page component (loaded via iframe or script) */
  componentUrl?: string | undefined
}

/** Custom field type definition */
export interface PluginFieldType {
  /** Type name used in schema (e.g., 'markdown-preview') */
  type: string
  /** Display label in field editor */
  label: string
  /** URL to the field renderer component */
  componentUrl?: string | undefined
}

/** Plugin manifest — the contract for extending krantho */
export interface KranthoPlugin {
  /** Unique plugin name (e.g., '@myorg/krantho-analytics') */
  name: string
  /** Plugin version */
  version: string
  /** Plugin description */
  description?: string | undefined
  /** Lifecycle hooks */
  hooks?: ContentHooks | undefined
  /** Custom API routes (mounted under /api/plugins/:pluginName/) */
  routes?: PluginRoute[] | undefined
  /** Custom Studio pages (metadata for Studio sidebar) */
  studioPages?: PluginStudioPage[] | undefined
  /** Custom field types */
  fieldTypes?: PluginFieldType[] | undefined
  /** Called once when the plugin is loaded */
  onLoad?: (() => Promise<void> | void) | undefined
  /** Called when the server shuts down */
  onUnload?: (() => Promise<void> | void) | undefined
}

/** Merged plugin state after loading all plugins */
export interface PluginRegistry {
  hooks: ContentHooks
  routes: Array<PluginRoute & { plugin: string }>
  studioPages: Array<PluginStudioPage & { plugin: string }>
  fieldTypes: Array<PluginFieldType & { plugin: string }>
}

/** Load and merge multiple plugins into a single registry */
export async function loadPlugins(plugins: KranthoPlugin[]): Promise<PluginRegistry> {
  const registry: PluginRegistry = {
    hooks: {},
    routes: [],
    studioPages: [],
    fieldTypes: [],
  }

  for (const plugin of plugins) {
    // Run onLoad
    if (plugin.onLoad) {
      await plugin.onLoad()
    }

    // Merge hooks (chain multiple hooks for the same event)
    if (plugin.hooks) {
      registry.hooks = mergeHooks(registry.hooks, plugin.hooks)
    }

    // Collect routes with plugin prefix
    if (plugin.routes) {
      for (const route of plugin.routes) {
        registry.routes.push({ ...route, plugin: plugin.name })
      }
    }

    // Collect Studio pages
    if (plugin.studioPages) {
      for (const page of plugin.studioPages) {
        registry.studioPages.push({ ...page, plugin: plugin.name })
      }
    }

    // Collect field types
    if (plugin.fieldTypes) {
      for (const fieldType of plugin.fieldTypes) {
        registry.fieldTypes.push({ ...fieldType, plugin: plugin.name })
      }
    }
  }

  return registry
}

/** Chain two hook functions — runs both in order */
function chainHook<T>(
  existing: ((ctx: T) => Promise<T | void>) | undefined,
  incoming: ((ctx: T) => Promise<T | void>) | undefined,
): ((ctx: T) => Promise<T | void>) | undefined {
  if (!existing) return incoming
  if (!incoming) return existing
  return async (ctx: T) => {
    const result1 = await existing(ctx)
    const updated = (result1 ?? ctx) as T
    const result2 = await incoming(updated)
    return result2 ?? updated
  }
}

/** Chain two void hook functions — runs both in order */
function chainVoidHook<T>(
  existing: ((ctx: T) => Promise<void>) | undefined,
  incoming: ((ctx: T) => Promise<void>) | undefined,
): ((ctx: T) => Promise<void>) | undefined {
  if (!existing) return incoming
  if (!incoming) return existing
  return async (ctx: T) => {
    await existing(ctx)
    await incoming(ctx)
  }
}

export function mergeHooks(a: ContentHooks, b: ContentHooks): ContentHooks {
  return {
    beforeSave: chainHook(a.beforeSave, b.beforeSave),
    afterCreate: chainVoidHook(a.afterCreate, b.afterCreate),
    afterUpdate: chainVoidHook(a.afterUpdate, b.afterUpdate),
    afterPublish: chainVoidHook(a.afterPublish, b.afterPublish),
    beforeDelete: chainVoidHook(a.beforeDelete, b.beforeDelete),
    afterDelete: chainVoidHook(a.afterDelete, b.afterDelete),
  }
}

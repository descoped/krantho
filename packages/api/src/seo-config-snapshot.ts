import type { ISeoConfigAdapter } from '@krantho/persistence'

/** What composing a page's JSON-LD reads from the SEO configuration store */
export type SeoConfigReader = Pick<ISeoConfigAdapter, 'getConfig' | 'listConfigs'>

/**
 * Every stored SEO configuration, read once and answered from memory. A request
 * that composes many pages' graphs (the site's findings) would otherwise read
 * the site, collection, URL-pattern and document scopes again for each page.
 */
export async function seoConfigSnapshot(
  store: ISeoConfigAdapter | undefined,
): Promise<SeoConfigReader | undefined> {
  if (!store) return undefined
  const configs = await store.listConfigs()
  const byId = new Map(configs.map((stored) => [stored.id, stored]))
  return {
    getConfig: async (id) => byId.get(id) ?? null,
    listConfigs: async (scope) =>
      scope === undefined ? [...configs] : configs.filter((stored) => stored.scope === scope),
  }
}

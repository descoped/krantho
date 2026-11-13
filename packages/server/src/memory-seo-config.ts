import type { ISeoConfigAdapter, SeoConfig, SeoConfigScope } from '@krantho/persistence'

/**
 * SEO configuration kept in memory: the store a site without a database reads,
 * filled from the `seo` section when the loader opens. Nothing persists, so
 * the code-defined configuration is all there is.
 */
export class MemorySeoConfigAdapter implements ISeoConfigAdapter {
  private readonly configs = new Map<string, SeoConfig>()

  async getConfig(id: string): Promise<SeoConfig | null> {
    return this.configs.get(id) ?? null
  }

  async saveConfig(config: Omit<SeoConfig, 'createdAt' | 'updatedAt'>): Promise<void> {
    const now = new Date().toISOString()
    const createdAt = this.configs.get(config.id)?.createdAt ?? now
    this.configs.set(config.id, { ...config, createdAt, updatedAt: now })
  }

  async deleteConfig(id: string): Promise<void> {
    this.configs.delete(id)
  }

  async listConfigs(scope?: SeoConfigScope): Promise<SeoConfig[]> {
    const all = [...this.configs.values()]
    return scope ? all.filter((config) => config.scope === scope) : all
  }

  async listConfigsByPrefix(prefix: string): Promise<SeoConfig[]> {
    return [...this.configs.values()].filter((config) => config.id.startsWith(prefix))
  }

  async deleteAllConfigs(): Promise<number> {
    const count = this.configs.size
    this.configs.clear()
    return count
  }
}

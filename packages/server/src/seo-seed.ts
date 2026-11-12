import { resolve } from 'node:path'
import type { KranthoConfig, SeoSection } from '@krantho/config'
import { isConfigured } from '@krantho/config'
import type { ISeoConfigAdapter } from '@krantho/persistence'
import type { SeoSeedConfig } from './seo-config-io.js'
import { applySeedConfig } from './seo-config-io.js'

/**
 * This process's SEO seeds, by database and seed: the API handler and the
 * content loader open their own connections to one database, and each seed
 * runs once between them — concurrent first requests share it, and a later
 * caller does not seed again over edits made since. A failed seed is
 * forgotten, so the next caller retries it.
 */
const seeds = new Map<string, Promise<void>>()

/**
 * Seed the stored SEO configuration from the `seo` section, once per process
 * and database. The handler and the loader both await it before they serve
 * anything, so no page is composed — and cached — from an unseeded database,
 * and the seed has nothing to announce. Seeding is idempotent across
 * processes too: `seed` mode writes only missing rows, and a row is saved
 * whole, so two instances seeding one database write the same rows.
 */
export function seedSeoOnce(config: KranthoConfig, adapter: ISeoConfigAdapter): Promise<void> {
  if (!isConfigured(config, 'seo')) return Promise.resolve()
  const plan = seedPlan(config.seo)
  const key = JSON.stringify([
    databaseKey(config.persistence),
    config.seo.definitions,
    config.seo.seedMode,
    plan,
  ])
  let seeding = seeds.get(key)
  if (!seeding) {
    seeding = seedSeoConfig(config.seo, plan, adapter).catch((err: unknown) => {
      seeds.delete(key)
      throw err
    })
    seeds.set(key, seeding)
  }
  return seeding
}

/** The database a connection opens, whichever connection it is */
function databaseKey(persistence: KranthoConfig['persistence']): string {
  switch (persistence.provider) {
    case 'sqlite':
      return `sqlite:${resolve(persistence.sqlite.path)}`
    case 'postgres':
      return `postgres:${persistence.postgres.url ?? ''}`
    case 'filesystem':
      return `filesystem:${resolve(persistence.filesystem.contentPath)}`
  }
}

/**
 * Seed SEO config from developer-defined defaults: the definition files the
 * configuration loaded from `configDir` first, then the section's own shapes.
 * Seed mode `seed` (the default) keeps stored rows; `overwrite` replaces them.
 */
async function seedSeoConfig(
  seo: SeoSection,
  plan: SeoSeedConfig,
  adapter: ISeoConfigAdapter,
): Promise<void> {
  if (seo.configDir) {
    await applySeedConfig(adapter, seo.definitions, seo.seedMode)
  }
  if (plan.site || plan.collections || plan.routes) {
    await applySeedConfig(adapter, plan, seo.seedMode)
  }
}

/**
 * The seed the section's own shapes describe:
 * 1. Thin: `identity`, `collections`, `routes` — type lists only
 * 2. Rich: `site`, `richCollections`, `richRoutes` — full entity config, which
 *    wins over the thin shape for the same scope
 */
function seedPlan(seo: SeoSection): SeoSeedConfig {
  const plan: SeoSeedConfig = {}

  if (seo.site) {
    plan.site = seo.site
  } else if (seo.identity) {
    plan.site = { entities: [{ '@type': seo.identity, properties: {} }] }
  }

  if (Object.keys(seo.richCollections).length > 0) {
    plan.collections = { ...seo.richCollections }
  }
  if (Object.keys(seo.richRoutes).length > 0) {
    plan.routes = { ...seo.richRoutes }
  }

  for (const [collection, types] of Object.entries(seo.collections)) {
    if (seo.richCollections[collection]) continue
    plan.collections ??= {}
    plan.collections[collection] = {
      entities: types.map((t) => ({ '@type': t, properties: {} })),
    }
  }

  for (const [pattern, types] of Object.entries(seo.routes)) {
    if (seo.richRoutes[pattern]) continue
    plan.routes ??= {}
    plan.routes[pattern] = { entities: types.map((t) => ({ '@type': t, properties: {} })) }
  }

  return plan
}

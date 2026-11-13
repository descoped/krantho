/**
 * SEO configuration export and import, and seeding the stored configuration.
 *
 * Writes per-entity YAML files in the layout `@krantho/config/node` reads
 * definition files from (`readSeoDefinitions`), so production state
 * round-trips into a project's `seo.configDir`.
 *
 * Layout:
 *   krantho.seo/
 *   ├── site/                          ← site-scope entities
 *   │   ├── professional-service.yaml
 *   │   ├── website.yaml
 *   │   ├── founder.person.yaml        ← role.type.yaml
 *   │   └── _field-mappings.yaml
 *   ├── collections/{name}/            ← collection-scope entities
 *   └── routes/{slug-encoded}.yaml
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { encodeRouteSlug, readSeoDefinitions } from '@krantho/config/node'
import type { ISeoConfigAdapter } from '@krantho/persistence'
import type { SeoConfigData, SeoConfigEntity } from '@krantho/seo-shared'
import { stringify as stringifyYaml } from 'yaml'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What a seed writes: scopes of SEO configuration, as definition files or code define them */
export interface SeoSeedConfig {
  /** Site-level configuration */
  site?: SeoConfigData | null | undefined
  /** Per-collection configuration, keyed by collection name */
  collections?: Record<string, SeoConfigData> | undefined
  /** Per-route configuration, keyed by URL pattern */
  routes?: Record<string, SeoConfigData> | undefined
}

export interface ExportResult {
  scopesExported: number
  entitiesExported: number
  filesWritten: string[]
}

export interface ImportResult {
  scopesImported: number
  entitiesImported: number
  skipped: string[]
  errors: Array<{ file: string; message: string }>
}

// ---------------------------------------------------------------------------
// Export — DB → files
// ---------------------------------------------------------------------------

/** Export all SEO config from the database to a directory. */
export async function exportSeoConfig(
  adapter: ISeoConfigAdapter,
  targetDir: string,
): Promise<ExportResult> {
  const configs = await adapter.listConfigs()
  const filesWritten: string[] = []
  let entitiesExported = 0

  for (const config of configs) {
    const { id, config: data } = config

    // Route scope: write all entities with index prefix per pattern
    if (id.startsWith('route:')) {
      const routesDir = join(targetDir, 'routes')
      await mkdir(routesDir, { recursive: true })
      const pattern = id.slice('route:'.length)
      const slug = encodeRouteSlug(pattern)
      for (let i = 0; i < data.entities.length; i++) {
        const entity = data.entities[i]!
        const prefix = String(i).padStart(2, '0')
        const filePath = join(routesDir, `${slug}--${prefix}-${entityToFilename(entity)}`)
        await writeFile(filePath, stringifyEntityYaml(entity), 'utf-8')
        filesWritten.push(filePath)
        entitiesExported++
      }
      continue
    }

    const scopeDir = scopeIdToDir(id, targetDir)
    await mkdir(scopeDir, { recursive: true })

    // Write entity files with index prefix to preserve order
    for (let i = 0; i < data.entities.length; i++) {
      const entity = data.entities[i]!
      const prefix = String(i).padStart(2, '0')
      const filename = `${prefix}-${entityToFilename(entity)}`
      const filePath = join(scopeDir, filename)
      await writeFile(filePath, stringifyEntityYaml(entity), 'utf-8')
      filesWritten.push(filePath)
      entitiesExported++
    }

    // Write field mappings if present
    if (data.fieldMappings && Object.keys(data.fieldMappings).length > 0) {
      const mappingsPath = join(scopeDir, '_field-mappings.yaml')
      await writeFile(mappingsPath, stringifyYaml(data.fieldMappings), 'utf-8')
      filesWritten.push(mappingsPath)
    }
  }

  return {
    scopesExported: configs.length,
    entitiesExported,
    filesWritten,
  }
}

// ---------------------------------------------------------------------------
// Import — files → DB
// ---------------------------------------------------------------------------

/** Import SEO config from a directory into the database. */
export async function importSeoConfig(
  adapter: ISeoConfigAdapter,
  sourceDir: string,
  options?: { mode?: 'seed' | 'overwrite' | undefined } | undefined,
): Promise<ImportResult> {
  const mode = options?.mode ?? 'seed'
  return applySeedConfig(adapter, readSeoDefinitions(sourceDir), mode)
}

// ---------------------------------------------------------------------------
// Seed application — shared by directory loader and programmatic seed
// ---------------------------------------------------------------------------

/** Apply a SeoSeedConfig to the database. */
export async function applySeedConfig(
  adapter: ISeoConfigAdapter,
  config: SeoSeedConfig,
  mode: 'seed' | 'overwrite' = 'seed',
): Promise<ImportResult> {
  let scopesImported = 0
  let entitiesImported = 0
  const skipped: string[] = []

  async function seedScope(
    id: string,
    scope: 'site' | 'collection' | 'route',
    data: SeoConfigData,
  ): Promise<void> {
    if (mode === 'seed') {
      const existing = await adapter.getConfig(id)
      if (existing) {
        skipped.push(id)
        return
      }
    }
    await adapter.saveConfig({ id, scope, config: data })
    scopesImported++
    entitiesImported += data.entities.length
  }

  if (config.site) {
    await seedScope('site', 'site', config.site)
  }

  for (const [name, data] of Object.entries(config.collections ?? {})) {
    await seedScope(`collection:${name}`, 'collection', data)
  }

  for (const [pattern, data] of Object.entries(config.routes ?? {})) {
    await seedScope(`route:${pattern}`, 'route', data)
  }

  return { scopesImported, entitiesImported, skipped, errors: [] }
}

// ---------------------------------------------------------------------------
// File naming helpers
// ---------------------------------------------------------------------------

/** Convert a SeoConfigEntity to a filename. */
function entityToFilename(entity: SeoConfigEntity): string {
  const type = toKebabCase(entity['@type'])
  if (entity.role) {
    return `${toKebabCase(entity.role)}.${type}.yaml`
  }
  return `${type}.yaml`
}

/** Convert a scope config ID to a directory path. */
function scopeIdToDir(id: string, baseDir: string): string {
  if (id === 'site') return join(baseDir, 'site')
  if (id.startsWith('collection:'))
    return join(baseDir, 'collections', id.slice('collection:'.length))
  if (id.startsWith('route:')) {
    return join(baseDir, 'routes')
  }
  throw new Error(`Unknown scope ID format: ${id}`)
}

/** Stringify an entity as YAML. */
function stringifyEntityYaml(entity: SeoConfigEntity): string {
  const obj: Record<string, unknown> = { '@type': entity['@type'] }
  if (entity['@id']) obj['@id'] = entity['@id']
  if (entity.role) obj.role = entity.role
  obj.properties = entity.properties
  return stringifyYaml(obj)
}

/** Convert PascalCase to kebab-case. */
function toKebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

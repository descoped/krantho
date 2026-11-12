#!/usr/bin/env node
/**
 * Unified SEO CLI — archetype-driven SEO management.
 *
 * The database, the site identity and the content paths come from the project's
 * `krantho.config.ts` — the same configuration the running site resolves.
 *
 * Usage:
 *   pnpm run seo config show [target]      — show archetype config
 *   pnpm run seo config set-site <type>    — set site-level Schema.org type
 *   pnpm run seo config set <col> <types>  — set collection archetype
 *   pnpm run seo config reset <target>     — remove config override
 *   pnpm run seo preview <col/slug>        — print JSON-LD to stdout
 *   pnpm run seo validate <col/slug>       — show each reader's rules for its types
 *   pnpm run seo validate --config         — check the configuration as the server does at start
 *   pnpm run seo validate --all            — validate every published page's graph
 *   pnpm run seo --root <dir> <command>    — run against another project
 */

import { existsSync } from 'node:fs'
import type { KranthoConfig } from '@krantho/config'
import type { ContentDocument, QueryReader } from '@krantho/persistence'
import type { SeoConfigData } from '@krantho/seo-shared'
import { inferSeoConfigScope } from '@krantho/seo-shared'
import { loadConfig, parseRoot, withoutRoot } from '../shared/config'
import { previewOf } from './preview-command'
import { withTypes } from './set-types'
import { printReaderRules, validateConfig, validateDocuments } from './validate-command'

// ── Configuration ──

const argv = process.argv.slice(2)
const projectRoot = parseRoot(argv)

let cached: KranthoConfig | null = null

/** The project's resolved configuration, read once per run. */
async function resolvedConfig(): Promise<KranthoConfig> {
  cached ??= await loadConfig(projectRoot)
  return cached
}

// ── Persistence helpers ──

interface SeoConfig {
  id: string
  scope: string
  config: SeoConfigData
}

interface SeoConfigAdapter {
  getConfig(id: string): Promise<SeoConfig | null>
  saveConfig(config: Omit<SeoConfig, 'createdAt' | 'updatedAt'>): Promise<void>
  deleteConfig(id: string): Promise<void>
  listConfigs(scope?: string): Promise<SeoConfig[]>
}

async function openDb(): Promise<SeoDb | null> {
  const config = await resolvedConfig()
  if (config.persistence.provider !== 'sqlite') {
    console.error(
      `The SEO CLI reads the SQLite database; this project uses "${config.persistence.provider}".`,
    )
    process.exit(1)
  }

  const dbPath = config.persistence.sqlite.path
  if (!existsSync(dbPath)) return null
  return openDbAt(dbPath, config.site.defaultLocale)
}

interface SeoDb {
  db: unknown
  adapter: SeoConfigAdapter
  content: {
    query: QueryReader['query']
    getPublished(collection: string, slug: string): Promise<ContentDocument | null>
  }
}

async function openDbAt(dbPath: string, defaultLocale: string): Promise<SeoDb> {
  // Use the SQLiteAdapter to open the database — it handles better-sqlite3 internally
  const { SQLiteAdapter, SqliteSeoConfigAdapter, runMigrations, sqliteMigrations } = await import(
    '@krantho/persistence-sqlite'
  )
  const sqliteAdapter = new SQLiteAdapter(dbPath, { defaultLocale })
  // Run migrations to ensure seo_config table exists
  const rawDb = sqliteAdapter.database
  runMigrations(rawDb, sqliteMigrations)
  const adapter = new SqliteSeoConfigAdapter(rawDb) as unknown as SeoConfigAdapter
  return { db: rawDb, adapter, content: sqliteAdapter }
}

// ── Commands ──

async function configShow(target?: string): Promise<void> {
  const conn = await openDb()
  if (!conn) {
    console.error('No database found. Start the dev server first to create the database.')
    process.exit(1)
  }

  if (!target) {
    // Show all configs
    const configs = await conn.adapter.listConfigs()
    if (configs.length === 0) {
      console.log('No SEO archetype configurations found.')
      return
    }
    console.log(`\nSEO Archetype Configurations (${configs.length}):\n`)
    for (const c of configs) {
      console.log(`  ${c.id} (${c.scope})`)
      const types = c.config.entities.map((e) => e['@type'])
      console.log(`    Types: ${types.join(', ') || 'none'}`)
      if (Object.keys(c.config.fieldMappings ?? {}).length > 0) {
        console.log(`    Mappings: ${JSON.stringify(c.config.fieldMappings)}`)
      }
      for (const entity of c.config.entities) {
        if (Object.keys(entity.properties).length > 0) {
          console.log(`    ${entity['@type']} properties: ${JSON.stringify(entity.properties)}`)
        }
      }
      console.log()
    }
    return
  }

  // Show specific config with effective resolution
  const { resolveEffectiveConfig } = await import('@krantho/seo')

  let configId: string
  if (target === 'site') {
    configId = 'site'
  } else if (target.includes('/')) {
    const [col, slug] = target.split('/')
    configId = `doc:${col}/${slug}`

    // Show resolved effective config
    const [site, collection, document] = await Promise.all([
      conn.adapter.getConfig('site'),
      conn.adapter.getConfig(`collection:${col}`),
      conn.adapter.getConfig(configId),
    ])
    const effective = resolveEffectiveConfig({
      site: site?.config ?? null,
      collection: collection?.config ?? null,
      document: document?.config ?? null,
    })

    console.log(`\nEffective config for ${target}:\n`)
    const types = effective.entities.map((e) => e['@type'])
    console.log(`  Types: ${types.join(', ') || 'none'}`)
    console.log(
      `  Source: ${document ? 'document override' : collection ? 'collection' : site ? 'site' : 'fallback'}`,
    )
    if (Object.keys(effective.fieldMappings ?? {}).length > 0) {
      console.log(`  Mappings: ${JSON.stringify(effective.fieldMappings)}`)
    }
    return
  } else {
    configId = `collection:${target}`
  }

  const config = await conn.adapter.getConfig(configId)
  if (!config) {
    console.log(`No config found for "${configId}".`)
    return
  }
  console.log(`\n${configId} (${config.scope}):`)
  const configTypes = config.config.entities.map((e) => e['@type'])
  console.log(`  Types: ${configTypes.join(', ')}`)
  if (Object.keys(config.config.fieldMappings ?? {}).length > 0) {
    console.log(`  Mappings: ${JSON.stringify(config.config.fieldMappings)}`)
  }
  for (const entity of config.config.entities) {
    if (Object.keys(entity.properties).length > 0) {
      console.log(`  ${entity['@type']} properties: ${JSON.stringify(entity.properties)}`)
    }
  }
}

async function configSetSite(type: string): Promise<void> {
  const conn = await openDb()
  if (!conn) {
    console.error('No database found.')
    process.exit(1)
  }
  const types = type.split(',').map((t) => t.trim())
  // set-site changes only the types: what the site keeps beside its entities stays
  const existing = (await conn.adapter.getConfig('site'))?.config
  await conn.adapter.saveConfig({ id: 'site', scope: 'site', config: withTypes(existing, types) })
  console.log(`Site-level types set to: ${types.join(', ')}`)
}

async function configSet(target: string, types: string): Promise<void> {
  const conn = await openDb()
  if (!conn) {
    console.error('No database found.')
    process.exit(1)
  }
  const typeList = types.split(',').map((t) => t.trim())
  const id = target.includes('/') ? `doc:${target}` : `collection:${target}`
  const scope = inferSeoConfigScope(id)
  const existing = (await conn.adapter.getConfig(id))?.config
  await conn.adapter.saveConfig({ id, scope, config: withTypes(existing, typeList) })
  console.log(`${scope} "${target}" types set to: ${typeList.join(', ')}`)
}

async function configReset(target: string): Promise<void> {
  const conn = await openDb()
  if (!conn) {
    console.error('No database found.')
    process.exit(1)
  }
  const id =
    target === 'site' ? 'site' : target.includes('/') ? `doc:${target}` : `collection:${target}`
  await conn.adapter.deleteConfig(id)
  console.log(`Config removed for "${id}". Will inherit from parent level.`)
}

async function configClean(): Promise<void> {
  const conn = await openDb()
  if (!conn) {
    console.error('No database found.')
    process.exit(1)
  }
  const configs = await conn.adapter.listConfigs()
  if (configs.length === 0) {
    console.log('No SEO configurations to remove.')
    return
  }
  for (const config of configs) {
    await conn.adapter.deleteConfig(config.id)
  }
  console.log(`Removed ${configs.length} SEO configuration(s). Clean slate.`)
}

async function preview(target: string): Promise<void> {
  const conn = await openDb()
  if (!conn) {
    console.error('No database found.')
    process.exit(1)
  }

  if (!target.includes('/')) {
    console.error('Usage: seo preview <collection>/<slug>')
    process.exit(1)
  }

  const [collection = '', slug = ''] = target.split('/')
  console.log(
    JSON.stringify(
      await previewOf(
        conn.adapter,
        collection,
        slug,
        await conn.content.getPublished(collection, slug),
      ),
      null,
      2,
    ),
  )
}

/** The collections that hold published documents */
function publishedCollections(db: unknown): string[] {
  const statement = (
    db as { prepare(sql: string): { all(): Array<{ collection: string }> } }
  ).prepare(
    'SELECT DISTINCT collection FROM content WHERE is_current = 1 AND live_version IS NOT NULL AND deleted_at IS NULL ORDER BY collection',
  )
  return statement.all().map((row) => row.collection)
}

/** Validate the configuration, or every published page; a non-zero exit on any error */
async function validateAll(configOnly: boolean): Promise<void> {
  const config = await resolvedConfig()
  const checked = await validateConfig(config)
  let errors = checked.errors
  if (!configOnly && checked.seo) {
    const conn = await openDb()
    if (!conn) {
      console.error('No database found.')
      process.exit(1)
    }
    errors += await validateDocuments(checked.seo, conn.adapter, {
      collections: () => publishedCollections(conn.db),
      documents: async (collection) =>
        (
          await conn.content.query({
            state: 'published',
            projection: 'summary',
            collections: [collection],
          })
        ).items,
    })
  }
  if (errors > 0) process.exit(1)
}

/** Each active reader's rules for the types a collection or document is configured with */
async function validateTarget(target: string): Promise<void> {
  const conn = await openDb()
  if (!conn) {
    console.error('No database found.')
    process.exit(1)
  }
  const id = target.includes('/') ? `doc:${target}` : `collection:${target}`
  const stored = await conn.adapter.getConfig(id)
  if (!stored) {
    console.log(`No config found for "${id}".`)
    return
  }

  console.log(`\nReader rules for ${id}:\n`)
  await printReaderRules(
    await resolvedConfig(),
    stored.config.entities.map((e) => e['@type']),
  )
}

async function validate(target: string): Promise<void> {
  if (target === '--all' || target === '--config') return validateAll(target === '--config')
  return validateTarget(target)
}

// ── Main ──

const args = withoutRoot(argv)
const command = args[0]
const subcommand = args[1]

async function main(): Promise<void> {
  switch (command) {
    case 'config':
      switch (subcommand) {
        case 'show':
          await configShow(args[2])
          break
        case 'set-site':
          if (!args[2]) {
            console.error('Usage: seo config set-site <Type>')
            process.exit(1)
          }
          await configSetSite(args[2])
          break
        case 'set':
          if (!args[2] || !args[3]) {
            console.error('Usage: seo config set <collection> <Type,Type,...>')
            process.exit(1)
          }
          await configSet(args[2], args[3])
          break
        case 'reset':
          if (!args[2]) {
            console.error('Usage: seo config reset <target>')
            process.exit(1)
          }
          await configReset(args[2])
          break
        case 'clean':
          await configClean()
          break
        default:
          console.error(`Unknown config subcommand: ${subcommand}`)
          console.log('Available: show, set-site, set, reset, clean')
          process.exit(1)
      }
      break

    case 'preview':
      if (!args[1]) {
        console.error('Usage: seo preview <collection>/<slug>')
        process.exit(1)
      }
      await preview(args[1])
      break

    case 'validate':
      await validate(args[1] ?? '--all')
      break

    default:
      console.log(`
krantho SEO CLI — archetype-driven structured data management

Commands:
  config show [target]           Show archetype configuration
  config set-site <Type>         Set site-level Schema.org type
  config set <col> <Types>       Set collection archetype types
  config reset <target>          Remove config override
  config clean                   Remove ALL SEO configs (clean slate)
  preview <col/slug>             Preview effective config for a document
  validate <target>              Show each reader's rules for a target's types
  validate --config              Check the configuration as the server does at start
  validate --all                 Validate every published page; exits non-zero on errors

Options:
  --root <dir>                   Project root (default: the working directory)

Examples:
  seo config show                Show all configurations
  seo config show pages          Show pages collection config
  seo config show pages/home     Show effective config for pages/home
  seo config set-site ProfessionalService
  seo config set pages Article,FAQPage
  seo validate --all
`)
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

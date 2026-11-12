/**
 * The SEO definition files of `seo.configDir`:
 *
 *   <configDir>/
 *   ├── site/                          ← one file per entity
 *   │   ├── organization.yaml
 *   │   ├── founder.person.yaml        ← role.type.yaml
 *   │   ├── _field-mappings.yaml
 *   │   └── _structure.yaml            ← trail and kind of the scope's pages
 *   ├── collections/{collection}/      ← same layout as site/
 *   ├── documents/{collection}/{slug}.yaml
 *   └── routes/{slug-encoded}.yaml
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'
import { KranthoConfigError } from '../errors.js'
import { seoScopeSchema } from '../schema.js'
import type { SeoDefinitions, SeoEntityConfig, SeoScopeConfig } from '../types.js'
import { decodeRouteSlug } from './route-slug.js'

const EXTENSIONS = new Set(['.yaml', '.yml', '.json'])

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Definition files of a directory, in name order */
function definitionFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => EXTENSIONS.has(extname(file)))
    .sort()
}

function parseFile(path: string): unknown {
  const text = readFileSync(path, 'utf-8')
  try {
    return extname(path) === '.json' ? (JSON.parse(text) as unknown) : (parseYaml(text) as unknown)
  } catch (err) {
    throw new KranthoConfigError([`${path}: ${err instanceof Error ? err.message : String(err)}`])
  }
}

/** One entity file, checked against the scope schema */
function parseEntity(path: string): SeoEntityConfig {
  const raw = parseFile(path)
  const parsed = seoScopeSchema.shape.entities.element.safeParse(
    raw && typeof raw === 'object' && !Array.isArray(raw) ? { properties: {}, ...raw } : raw,
  )
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const field = issue.path.map(String).join('.') || '(file)'
      return `${path}: ${field === '@type' ? 'missing @type' : `${field}: ${issue.message}`}`
    })
    throw new KranthoConfigError(issues)
  }
  return parsed.data as SeoEntityConfig
}

/** A scope setting file (`_field-mappings`, `_structure`), checked against its schema */
function parseSetting<T>(path: string, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(parseFile(path))
  if (!parsed.success) throw new KranthoConfigError([`${path}: ${parsed.error.message}`])
  return parsed.data
}

/** A scope directory: its entity files, `_field-mappings` and `_structure` */
function readScope(dir: string): SeoScopeConfig {
  const entities: SeoEntityConfig[] = []
  let fieldMappings: SeoScopeConfig['fieldMappings']
  let structure: SeoScopeConfig['structure']
  for (const file of definitionFiles(dir)) {
    const name = basename(file, extname(file))
    const path = join(dir, file)
    if (name === '_field-mappings') {
      fieldMappings = parseSetting(path, seoScopeSchema.shape.fieldMappings)
    } else if (name === '_structure') {
      structure = parseSetting(path, seoScopeSchema.shape.structure)
    } else if (!name.startsWith('_')) {
      entities.push(parseEntity(path))
    }
  }
  return {
    entities,
    ...(fieldMappings ? { fieldMappings } : {}),
    ...(structure ? { structure } : {}),
  }
}

/** Each subdirectory of `dir` as a scope, keyed by its name */
function readScopes(dir: string): Record<string, SeoScopeConfig> {
  if (!isDirectory(dir)) return {}
  const scopes: Record<string, SeoScopeConfig> = {}
  for (const name of readdirSync(dir).sort()) {
    if (isDirectory(join(dir, name))) scopes[name] = readScope(join(dir, name))
  }
  return scopes
}

/** `routes/{slug-encoded}.yaml`, keyed by URL pattern */
function readRoutes(dir: string): Record<string, SeoScopeConfig> {
  if (!isDirectory(dir)) return {}
  const routes: Record<string, SeoScopeConfig> = {}
  for (const file of definitionFiles(dir)) {
    routes[decodeRouteSlug(basename(file, extname(file)))] = {
      entities: [parseEntity(join(dir, file))],
    }
  }
  return routes
}

/**
 * Read a directory of SEO definition files. A missing directory, or a
 * missing scope directory in it, defines nothing; a file that does not parse
 * or lacks a `@type` throws a {@link KranthoConfigError} naming it.
 */
export function readSeoDefinitions(dir: string): SeoDefinitions {
  const siteDir = join(dir, 'site')
  return {
    site: isDirectory(siteDir) ? readScope(siteDir) : null,
    collections: readScopes(join(dir, 'collections')),
    routes: readRoutes(join(dir, 'routes')),
  }
}

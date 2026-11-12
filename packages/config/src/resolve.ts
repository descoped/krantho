import type { ZodIssue } from 'zod'
import { DEFAULTS } from './defaults.js'
import { derive, suppliedPaths } from './derive.js'
import { buildEnvOverlay } from './env.js'
import { KranthoConfigError } from './errors.js'
import { LEAVES } from './leaves.js'
import { deepMerge } from './object-path.js'
import {
  crossFieldIssues,
  kranthoConfigSchema,
  persistenceIssues,
  persistenceTreeSchema,
} from './schema.js'
import type {
  ConfigSource,
  KranthoConfig,
  KranthoConfigInput,
  KranthoConfigTree,
  PersistenceSection,
  SeoDefinitions,
} from './types.js'

/** Knobs the resolver itself takes — not part of the configuration tree */
export interface ResolveOptions {
  /** Directory relative paths resolve against. Defaults to the working directory. */
  cwd?: string | undefined
}

function renderZodIssue(issue: ZodIssue, origins: ReadonlyMap<string, string>): string {
  const path = issue.path.map(String).join('.')
  const envName = origins.get(path)
  const label = path === '' ? '(root)' : path
  return envName ? `${envName} (${label}): ${issue.message}` : `${label}: ${issue.message}`
}

function computeSources(
  code: KranthoConfigInput,
  origins: ReadonlyMap<string, string>,
): Map<string, ConfigSource> {
  const codePaths = suppliedPaths(code)
  const sources = new Map<string, ConfigSource>()

  for (const leaf of LEAVES) {
    if (origins.has(leaf.path)) {
      sources.set(leaf.path, 'env')
      continue
    }
    const fromCode = codePaths.some(
      (path) => path === leaf.path || path.startsWith(`${leaf.path}.`),
    )
    sources.set(leaf.path, fromCode ? 'code' : 'default')
  }

  return sources
}

/**
 * Resolve the configuration tree: defaults, then the developer's code, then the
 * environment. Every problem — a bad environment value, a leaf that fails
 * validation, a rule spanning two leaves — is collected and thrown as one
 * {@link KranthoConfigError} naming each variable and path.
 *
 * Call it once, at startup.
 */
export function resolveConfig(
  code: KranthoConfigInput = {},
  env: Record<string, string | undefined> = {},
  options: ResolveOptions = {},
): KranthoConfig {
  const overlay = buildEnvOverlay(env)
  const withCode = deepMerge(DEFAULTS, code) as Record<string, unknown>
  const merged = deepMerge(withCode, overlay.values) as Record<string, unknown>
  const cwd = options.cwd ?? process.cwd()
  const derived = derive(merged, cwd)

  const parsed = kranthoConfigSchema.safeParse(derived)

  const issues = overlay.issues.map((issue) => `${issue.env} (${issue.path}): ${issue.message}`)
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map((issue) => renderZodIssue(issue, overlay.origins)))
    throw new KranthoConfigError(issues)
  }

  issues.push(...crossFieldIssues(parsed.data))
  if (issues.length > 0) throw new KranthoConfigError(issues)

  const tree = parsed.data as Omit<KranthoConfigTree, 'seo'> & {
    seo: Omit<KranthoConfigTree['seo'], 'definitions'>
  }
  return {
    ...tree,
    seo: { ...tree.seo, definitions: emptySeoDefinitions() },
    sources: computeSources(code, overlay.origins),
  }
}

/** No SEO definition files — what the pure resolver, which reads no files, gives */
export function emptySeoDefinitions(): SeoDefinitions {
  return { site: null, collections: {}, routes: {} }
}

/** Leaves {@link resolvePersistence} reads — the paths the database location derives from, and the backend */
const PERSISTENCE_LEAVES = LEAVES.filter(
  (leaf) => leaf.path.startsWith('paths.') || leaf.path.startsWith('persistence.'),
)

/**
 * Resolve only the persistence section, from the defaults and the environment.
 *
 * For a process that opens the database without access to `krantho.config.ts`
 * — the shared Next.js cache handler, which Next loads by path. Values set in
 * code are not seen, so a deployment that needs one sets its variable. Throws
 * a {@link KranthoConfigError} like {@link resolveConfig}.
 */
export function resolvePersistence(
  env: Record<string, string | undefined> = {},
  options: ResolveOptions = {},
): PersistenceSection {
  const overlay = buildEnvOverlay(env, PERSISTENCE_LEAVES)
  const defaults = { paths: DEFAULTS.paths, persistence: DEFAULTS.persistence }
  const merged = deepMerge(defaults, overlay.values) as Record<string, unknown>
  const derived = derive(merged, options.cwd ?? process.cwd())

  const parsed = persistenceTreeSchema.safeParse(derived)

  const issues = overlay.issues.map((issue) => `${issue.env} (${issue.path}): ${issue.message}`)
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map((issue) => renderZodIssue(issue, overlay.origins)))
    throw new KranthoConfigError(issues)
  }

  issues.push(...persistenceIssues(parsed.data.persistence))
  if (issues.length > 0) throw new KranthoConfigError(issues)

  return parsed.data.persistence
}

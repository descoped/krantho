import { buildEnvOverlay } from '../env.js'
import { resolveConfig } from '../resolve.js'
import type { KranthoConfig, KranthoConfigInput } from '../types.js'
import { readSeoDefinitions } from './seo-definitions.js'

/** What a site's configuration is loaded from */
export interface LoadConfigOptions {
  /** The developer's `krantho.config.ts` */
  code?: KranthoConfigInput | undefined
  /** The environment; `process.env` in a running site */
  env?: Record<string, string | undefined> | undefined
  /** Directory relative paths resolve against. Defaults to the working directory. */
  cwd?: string | undefined
}

/**
 * Loaded instances, per code object, then per working directory and
 * environment — for the life of the process: a site loads one environment, so
 * an entry per distinct environment stays a handful
 */
const loaded = new WeakMap<KranthoConfigInput, Map<string, KranthoConfig>>()

function load(
  code: KranthoConfigInput,
  env: Record<string, string | undefined>,
  cwd: string,
): KranthoConfig {
  const config = resolveConfig(code, env, { cwd })
  if (!config.seo.configDir) return config
  const sources = new Map(config.sources)
  sources.set('seo.definitions', 'file')
  return {
    ...config,
    seo: { ...config.seo, definitions: readSeoDefinitions(config.seo.configDir) },
    sources,
  }
}

/**
 * Load a site's configuration into one validated instance: defaults, then the
 * developer's code, then the environment, then the SEO definition files in
 * `seo.configDir`. Every consumer — the API handler, the content loader, the
 * Studio gate, the page cache, the tools — asks for it and gets the same
 * instance, loaded once per process for the same code, working directory and
 * environment. Throws a {@link KranthoConfigError} naming every problem.
 */
export function loadConfig(options: LoadConfigOptions = {}): KranthoConfig {
  const code = options.code ?? {}
  const env = options.env ?? {}
  const cwd = options.cwd ?? process.cwd()
  const overlay = buildEnvOverlay(env)
  const key = JSON.stringify([cwd, overlay.values, overlay.issues])
  let byKey = loaded.get(code)
  if (!byKey) {
    byKey = new Map()
    loaded.set(code, byKey)
  }
  let config = byKey.get(key)
  if (!config) {
    config = load(code, env, cwd)
    byKey.set(key, config)
  }
  return config
}

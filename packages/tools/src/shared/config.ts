/**
 * The tools resolve the same configuration tree the runtime does.
 *
 * A script takes `--root <dir>` (default: the working directory), imports that
 * project's `krantho.config.ts` and hands it to `loadConfig` together with
 * `process.env`, so build-time enrichment starts from the provider, model, key,
 * paths and SEO definitions the running site loads. Runtime enrichment reads the provider,
 * model and base URL from stored settings the server seeds once, and picks its
 * credential per request.
 */

import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { KranthoConfig, KranthoConfigInput } from '@krantho/config'
import { KranthoConfigError } from '@krantho/config'
import { loadConfig as loadKranthoConfig } from '@krantho/config/node'

const CONFIG_FILENAME = 'krantho.config.ts'

/**
 * Read `--root <dir>` from CLI arguments. Relative values resolve against the working
 * directory. The last `--root` wins, so a caller can override a default a script passes.
 */
export function parseRoot(args: string[], cwd: string = process.cwd()): string {
  const index = args.lastIndexOf('--root')
  const value = index === -1 ? undefined : args[index + 1]
  if (!value || value.startsWith('--')) return cwd
  return isAbsolute(value) ? value : resolve(cwd, value)
}

/** The arguments with `--root <dir>` removed, for commands that read positionals. */
export function withoutRoot(args: string[]): string[] {
  const rest: string[] = []
  for (let index = 0; index < args.length; index++) {
    const value = args[index]
    if (value === undefined) continue
    if (value === '--root') {
      index++
      continue
    }
    rest.push(value)
  }
  return rest
}

/** Import a project's `krantho.config.ts`, or null when it has none. */
export async function readConfigFile(root: string): Promise<KranthoConfigInput | null> {
  const file = join(root, CONFIG_FILENAME)
  if (!existsSync(file)) return null

  const module = (await import(pathToFileURL(file).href)) as { default?: KranthoConfigInput }
  return module.default ?? {}
}

/**
 * Load a project's configuration: defaults, then `krantho.config.ts`, then the
 * environment, then the SEO definition files. Relative paths resolve against
 * the project root, not the working directory, so a script run from the
 * repository root still writes into the project.
 */
export async function loadConfig(
  root: string = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): Promise<KranthoConfig> {
  const code = await readConfigFile(root)

  try {
    return loadKranthoConfig({ code: code ?? {}, env, cwd: root })
  } catch (error) {
    if (code === null && error instanceof KranthoConfigError) {
      throw new Error(
        `No ${CONFIG_FILENAME} in ${root}. Run the command from the project root, or pass --root <dir>.\n${error.message}`,
      )
    }
    throw error
  }
}

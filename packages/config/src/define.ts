import type { KranthoConfigInput } from './types.js'

/**
 * Declare a site's configuration.
 *
 * The call is a typed identity function: it gives `krantho.config.ts` its
 * shape and its editor completions. Nothing is resolved here — the server and
 * the tools hand the result to {@link resolveConfig}, which layers the
 * environment on top and validates the whole tree once.
 */
export function defineKranthoConfig(config: KranthoConfigInput): KranthoConfigInput {
  return config
}

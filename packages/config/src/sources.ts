import type { KranthoConfig } from './types.js'

/**
 * Whether anything at or below a dotted path was supplied by the developer or
 * the operator rather than left at its default.
 *
 * Seeding uses it: a section nobody configured is a section the server has
 * nothing to write.
 */
export function isConfigured(config: KranthoConfig, pathPrefix: string): boolean {
  for (const [path, source] of config.sources) {
    if (source === 'default') continue
    if (path === pathPrefix || path.startsWith(`${pathPrefix}.`)) return true
  }
  return false
}

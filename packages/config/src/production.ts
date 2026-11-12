import type { KranthoConfigTree } from './types.js'

/**
 * Settings that start fine but are unsafe once the site serves real traffic.
 *
 * Advisory only: the server logs each one at startup and keeps going, so the
 * operator decides whether to enforce them. Returns nothing outside production.
 */
export function productionWarnings(
  config: KranthoConfigTree,
  nodeEnv: string | undefined,
): string[] {
  if (nodeEnv !== 'production') return []

  const warnings: string[] = []

  if (config.auth.mode === 'none') {
    warnings.push(
      'auth.mode is "none" in production: every visitor is an admin with full write access. Set KRANTHO_AUTH to "oidc" or "token".',
    )
  } else if (!config.auth.jwtSecret) {
    warnings.push(
      'auth.jwtSecret is unset in production: each instance signs sessions with its own ephemeral key, so sign-ins fail across instances and restarts. Set KRANTHO_JWT_SECRET to a random value of at least 32 bytes.',
    )
  }

  if (config.assistant.enabled && config.auth.mode === 'none') {
    warnings.push(
      'assistant.enabled with auth.mode "none" in production: every visitor can drive the assistant on the site\'s LLM credential. Set KRANTHO_AUTH to "oidc" or "token".',
    )
  }

  return warnings
}

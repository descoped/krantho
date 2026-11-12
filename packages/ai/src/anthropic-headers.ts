export const ANTHROPIC_VERSION = '2023-06-01'
export const OAUTH_BETA = 'oauth-2025-04-20'

/**
 * Request headers for the Anthropic Messages API: content type, API version,
 * and either `authorization: Bearer` plus the OAuth beta header (when an OAuth
 * token is given) or `x-api-key`.
 */
export function anthropicHeaders(
  apiKey: string | undefined,
  authToken: string | undefined,
): Record<string, string> {
  const base = { 'content-type': 'application/json', 'anthropic-version': ANTHROPIC_VERSION }
  if (authToken !== undefined && authToken !== '') {
    return { ...base, authorization: `Bearer ${authToken}`, 'anthropic-beta': OAUTH_BETA }
  }
  return { ...base, 'x-api-key': apiKey ?? '' }
}

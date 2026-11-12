import { purgeWithRetry } from './retry.js'
import type { CdnInvalidator } from './types.js'

const COMPUTE_API = 'https://compute.googleapis.com/compute'
const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token'
/** Cloud CDN accepts at most this many tags per invalidation request */
const TAGS_PER_REQUEST = 10
/** Refresh a metadata token this long before it expires */
const TOKEN_EXPIRY_MARGIN_MS = 60_000

export interface GcpInvalidatorOptions {
  project: string
  urlMap: string
  /** A fixed bearer token; without one, tokens come from the metadata server */
  accessToken?: string | undefined
}

interface MetadataToken {
  access_token: string
  expires_in: number
}

/**
 * Cloud CDN purges through the URL map's `invalidateCache`: tags in chunks
 * to the `beta` endpoint, each path to `v1`. The bearer token is the
 * configured one, or a metadata-server token reused until it expires. Cloud
 * CDN only deletes, so the mode is ignored.
 */
export function createGcpInvalidator(options: GcpInvalidatorOptions): CdnInvalidator {
  const token = createTokenSource(options.accessToken)
  const mapPath = `projects/${encodeURIComponent(options.project)}/global/urlMaps/${encodeURIComponent(options.urlMap)}/invalidateCache`

  function invalidate(version: 'beta' | 'v1', body: Record<string, unknown>): Promise<void> {
    return purgeWithRetry('gcp', async () => {
      const response = await fetch(`${COMPUTE_API}/${version}/${mapPath}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`invalidateCache answered ${response.status}`)
    })
  }

  return {
    async purgeTags(tags) {
      for (let i = 0; i < tags.length; i += TAGS_PER_REQUEST) {
        await invalidate('beta', { cacheTags: tags.slice(i, i + TAGS_PER_REQUEST) })
      }
    },
    async purgePaths(paths) {
      for (const path of paths) {
        await invalidate('v1', { path })
      }
    },
  }
}

/** The configured token, or a metadata-server token cached until shortly before it expires */
function createTokenSource(accessToken: string | undefined): () => Promise<string> {
  if (accessToken !== undefined) return async () => accessToken
  let cached: { value: string; expiresAt: number } | undefined
  return async () => {
    if (cached !== undefined && Date.now() < cached.expiresAt) return cached.value
    const response = await fetch(METADATA_TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } })
    if (!response.ok) throw new Error(`metadata server answered ${response.status}`)
    const body = (await response.json()) as MetadataToken
    cached = {
      value: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS,
    }
    return cached.value
  }
}

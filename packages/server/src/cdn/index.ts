import type { CacheSection } from '@krantho/config'
import { createCloudFrontInvalidator } from './cloudfront.js'
import { createGcpInvalidator } from './gcp.js'
import type { CdnInvalidator } from './types.js'
import { createVercelInvalidator } from './vercel.js'

export type { CdnInvalidator } from './types.js'

/**
 * The CDN invalidator for the configured provider; null when no CDN is
 * configured. Configuration validation guarantees each provider's settings.
 */
export function createCdnInvalidator(cache: CacheSection): CdnInvalidator | null {
  const { cdn } = cache
  switch (cdn.provider) {
    case 'none':
      return null
    case 'vercel':
      return createVercelInvalidator()
    case 'cloudfront':
      return createCloudFrontInvalidator(
        required(cdn.cloudfront.distributionId, 'cache.cdn.cloudfront.distributionId'),
      )
    case 'gcp':
      return createGcpInvalidator({
        project: required(cdn.gcp.project, 'cache.cdn.gcp.project'),
        urlMap: required(cdn.gcp.urlMap, 'cache.cdn.gcp.urlMap'),
        accessToken: cdn.gcp.accessToken,
      })
  }
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value === '')
    throw new Error(`${name} is required for this CDN provider`)
  return value
}

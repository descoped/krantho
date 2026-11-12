import { randomUUID } from 'node:crypto'
import type { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { purgeWithRetry } from './retry.js'
import type { CdnInvalidator } from './types.js'

/** CloudFront's API is global; requests are signed for us-east-1 */
const CLOUDFRONT_REGION = 'us-east-1'

/**
 * CloudFront purges through `CreateInvalidation` with `@aws-sdk/client-cloudfront`
 * (an optional peer); credentials come from the SDK's default chain. A tag
 * invalidates as a `#`-prefixed path. CloudFront only deletes, so the mode is
 * ignored.
 */
export function createCloudFrontInvalidator(distributionId: string): CdnInvalidator {
  let client: CloudFrontClient | undefined

  async function invalidate(items: string[]): Promise<void> {
    if (items.length === 0) return
    // One reference per purge: a retry of the same batch is idempotent.
    const callerReference = `krantho-${Date.now()}-${randomUUID()}`
    await purgeWithRetry('cloudfront', async () => {
      const sdk = await import('@aws-sdk/client-cloudfront')
      client ??= new sdk.CloudFrontClient({ region: CLOUDFRONT_REGION })
      await client.send(
        new sdk.CreateInvalidationCommand({
          DistributionId: distributionId,
          InvalidationBatch: {
            CallerReference: callerReference,
            Paths: { Quantity: items.length, Items: items },
          },
        }),
      )
    })
  }

  return {
    purgeTags: (tags) => invalidate(tags.map((tag) => `#${tag}`)),
    purgePaths: (paths) => invalidate([...paths]),
  }
}

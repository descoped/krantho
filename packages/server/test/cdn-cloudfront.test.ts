import type { CacheSection } from '@krantho/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCdnInvalidator } from '../src/cdn/index.js'

/**
 * CloudFront purges through `CreateInvalidation`: tags as `#`-prefixed paths,
 * paths as given, one invalidation batch per purge. Mode is ignored —
 * CloudFront only deletes.
 */

interface InvalidationInput {
  DistributionId: string
  InvalidationBatch: {
    CallerReference: string
    Paths: { Quantity: number; Items: string[] }
  }
}

const aws = vi.hoisted(() => {
  const send = vi.fn(async (_command: unknown) => ({}))
  const clients: unknown[] = []
  class CloudFrontClient {
    readonly send = send
    constructor(readonly config: unknown) {
      clients.push(config)
    }
  }
  class CreateInvalidationCommand {
    constructor(readonly input: InvalidationInput) {}
  }
  return { send, clients, CloudFrontClient, CreateInvalidationCommand }
})

vi.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: aws.CloudFrontClient,
  CreateInvalidationCommand: aws.CreateInvalidationCommand,
}))

const cache: CacheSection = {
  pages: 'cdn',
  cdn: {
    provider: 'cloudfront',
    sMaxAgeSec: 86400,
    staleWhileRevalidateSec: 604800,
    tagHeader: 'x-krantho-cache-tag',
    cloudfront: { distributionId: 'E2EXAMPLE' },
    gcp: {},
  },
  shared: 'none',
}

function sentInputs(): InvalidationInput[] {
  return aws.send.mock.calls.map(([command]) => {
    expect(command).toBeInstanceOf(aws.CreateInvalidationCommand)
    return (command as InstanceType<typeof aws.CreateInvalidationCommand>).input
  })
}

afterEach(() => {
  aws.send.mockReset()
  aws.send.mockImplementation(async () => ({}))
  aws.clients.length = 0
  vi.restoreAllMocks()
})

describe('CloudFront CDN invalidator', () => {
  it('invalidates tags as #-prefixed paths on the configured distribution', async () => {
    await createCdnInvalidator(cache)?.purgeTags(['k:site', 'k:d:pages:about'], 'expire')

    const [input] = sentInputs()
    expect(input?.DistributionId).toBe('E2EXAMPLE')
    expect(input?.InvalidationBatch.Paths).toEqual({
      Quantity: 2,
      Items: ['#k:site', '#k:d:pages:about'],
    })
    expect(input?.InvalidationBatch.CallerReference).toMatch(/\S/)
  })

  it('invalidates paths as given, whatever the mode', async () => {
    await createCdnInvalidator(cache)?.purgePaths(['/about', '/about*'], 'stale')

    const [input] = sentInputs()
    expect(input?.InvalidationBatch.Paths).toEqual({ Quantity: 2, Items: ['/about', '/about*'] })
  })

  it('treats stale and expire alike', async () => {
    const invalidator = createCdnInvalidator(cache)
    await invalidator?.purgeTags(['k:c:pages'], 'stale')
    await invalidator?.purgeTags(['k:c:pages'], 'expire')

    const [stale, expire] = sentInputs()
    expect(stale?.InvalidationBatch.Paths).toEqual(expire?.InvalidationBatch.Paths)
  })

  it('gives every purge a unique caller reference', async () => {
    const invalidator = createCdnInvalidator(cache)
    await invalidator?.purgeTags(['k:site'], 'expire')
    await invalidator?.purgeTags(['k:site'], 'expire')

    const [first, second] = sentInputs()
    expect(first?.InvalidationBatch.CallerReference).not.toBe(
      second?.InvalidationBatch.CallerReference,
    )
  })

  it('reuses one client for the invalidator', async () => {
    const invalidator = createCdnInvalidator(cache)
    await invalidator?.purgeTags(['k:site'], 'expire')
    await invalidator?.purgePaths(['/*'], 'stale')

    expect(aws.clients).toHaveLength(1)
  })

  it('sends nothing for no tags or paths', async () => {
    const invalidator = createCdnInvalidator(cache)
    await invalidator?.purgeTags([], 'expire')
    await invalidator?.purgePaths([], 'expire')

    expect(aws.send).not.toHaveBeenCalled()
  })

  it('retries a failed invalidation once with the same batch', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    aws.send.mockRejectedValueOnce(new Error('throttled'))

    await createCdnInvalidator(cache)?.purgeTags(['k:site'], 'expire')

    const [first, retry] = sentInputs()
    expect(aws.send).toHaveBeenCalledTimes(2)
    expect(retry).toEqual(first)
    expect(error).not.toHaveBeenCalled()
  })

  it('logs a second failure without throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    aws.send.mockRejectedValue(new Error('access denied'))

    await expect(createCdnInvalidator(cache)?.purgePaths(['/*'], 'stale')).resolves.toBeUndefined()
    expect(aws.send).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledTimes(1)
  })
})

import { describe, expect, it } from 'vitest'
import {
  cdnCacheHeaders,
  collectionTag,
  documentTag,
  pageTagBudget,
  previewHeaders,
  SITE_TAG,
} from '../src/index.js'

const base = {
  tags: [SITE_TAG, 'k:d:pages:about', 'k:c:services'],
  sMaxAgeSec: 86400,
  staleWhileRevalidateSec: 604800,
  tagHeader: 'x-krantho-cache-tag',
}

describe('cdnCacheHeaders', () => {
  it('caches at the Vercel CDN, tagged with Vercel-Cache-Tag', () => {
    expect(cdnCacheHeaders({ ...base, provider: 'vercel' })).toEqual({
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      'Vercel-Cache-Tag': 'k:site,k:d:pages:about,k:c:services',
    })
  })

  it('caches at CloudFront through Cache-Control itself, tagged with the configured header', () => {
    expect(cdnCacheHeaders({ ...base, provider: 'cloudfront' })).toEqual({
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
      'x-krantho-cache-tag': 'k:site,k:d:pages:about,k:c:services',
    })
  })

  it('caches at Cloud CDN, tagged with Cache-Tag', () => {
    expect(
      cdnCacheHeaders({ ...base, provider: 'gcp', sMaxAgeSec: 60, staleWhileRevalidateSec: 30 }),
    ).toEqual({
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      'Cache-Tag': 'k:site,k:d:pages:about,k:c:services',
    })
  })

  it('carries the budgeted tags, deduplicated', () => {
    const tags = [SITE_TAG, SITE_TAG, ...documentTags('pages', 80)]
    const header = cdnCacheHeaders({ ...base, tags, provider: 'gcp' })['Cache-Tag']
    expect(header).toBe('k:site,k:c:pages')
  })
})

describe('previewHeaders', () => {
  it('keeps a preview out of every cache and every index', () => {
    expect(previewHeaders()).toEqual({
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    })
  })
})

describe('pageTagBudget', () => {
  it('drops duplicates and keeps tags within the budget as they are', () => {
    expect(pageTagBudget([SITE_TAG, 'k:d:pages:about', SITE_TAG, 'k:d:pages:about'])).toEqual([
      SITE_TAG,
      'k:d:pages:about',
    ])
    const tags = [SITE_TAG, ...documentTags('pages', 49)]
    expect(pageTagBudget(tags)).toEqual(tags)
  })

  it('collapses document tags to their collection tag first when over the budget', () => {
    const tags = [
      SITE_TAG,
      collectionTag('services'),
      'k:seo',
      ...documentTags('pages', 30),
      ...documentTags('services', 30),
    ]
    expect(pageTagBudget(tags)).toEqual([
      SITE_TAG,
      collectionTag('services'),
      'k:seo',
      collectionTag('pages'),
    ])
  })

  it('never exceeds the budget and always keeps k:site', () => {
    const collections = Array.from({ length: 120 }, (_, i) => collectionTag(`c${i}`))
    const tags = [...collections, ...documentTags('pages', 40), SITE_TAG]
    const budgeted = pageTagBudget(tags)
    expect(budgeted).toHaveLength(50)
    expect(budgeted[0]).toBe(SITE_TAG)
    expect(budgeted.slice(1)).toEqual(collections.slice(0, 49))
    expect(pageTagBudget(tags, 10)).toHaveLength(10)
    expect(pageTagBudget(tags, 10)).toContain(SITE_TAG)
  })

  it('cuts to the budget when the tags carry no site tag', () => {
    const collections = Array.from({ length: 60 }, (_, i) => collectionTag(`c${i}`))
    expect(pageTagBudget(collections)).toEqual(collections.slice(0, 50))
  })
})

function documentTags(collection: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => documentTag(collection, `doc-${i}`))
}

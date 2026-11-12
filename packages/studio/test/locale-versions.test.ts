import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLocaleVersions } from '../src/editor/use-locale-versions.js'
import { createContentItem, fetchContent } from '../src/lib/api.js'
import { ApiError } from '../src/lib/api-client.js'
import type { ContentItem } from '../src/lib/api-types.js'

vi.mock('../src/lib/api.js', async (original) => ({
  ...(await original<typeof import('../src/lib/api.js')>()),
  fetchContent: vi.fn(),
  createContentItem: vi.fn(async () => ({})),
}))

const LOCALES = ['en', 'nb']

function version(slug: string, locale: string): ContentItem {
  return {
    metadata: {},
    contract: null,
    defaults: [],
    repositoryBasis: null,

    meta: { slug, locale, version: 1, liveVersion: null, status: 'draft' },
    fields: {},
    body: '',
    html: '',
    sections: {},
  } as unknown as ContentItem
}

const missing = (): Promise<ContentItem> =>
  Promise.reject(new ApiError('Not found', 404, { error: 'Not found' }))

afterEach(() => {
  vi.mocked(fetchContent).mockReset()
})

describe('the locales a document exists in', () => {
  it('reads another document’s locales afresh: the last one’s never show meanwhile', async () => {
    vi.mocked(fetchContent).mockImplementation(async (_c, slug, locale) =>
      slug === 'about' || locale === 'en' ? version(slug, locale ?? 'en') : missing(),
    )
    const { result, rerender } = renderHook(
      ({ slug }) => useLocaleVersions('pages', slug, LOCALES, 'en'),
      { initialProps: { slug: 'pricing' } },
    )
    await waitFor(() => expect(result.current.states?.get('nb')).toBe('missing'))
    let answer: () => void = () => {}
    vi.mocked(fetchContent).mockImplementation(
      (_c, slug, locale) =>
        new Promise<ContentItem>((resolve) => {
          answer = () => resolve(version(slug, locale ?? 'en'))
        }),
    )
    rerender({ slug: 'about' })
    expect(result.current.states).toBeNull()
    await act(async () => answer())
  })

  it('keeps a version created while the locales were read', async () => {
    const reads: Array<() => void> = []
    vi.mocked(fetchContent).mockImplementation(
      (_c, slug, locale) =>
        new Promise<ContentItem>((resolve, reject) => {
          reads.push(() =>
            locale === 'nb'
              ? reject(new ApiError('Not found', 404, { error: 'Not found' }))
              : resolve(version(slug, locale ?? 'en')),
          )
        }),
    )
    const { result } = renderHook(() => useLocaleVersions('pages', 'pricing', LOCALES, 'en'))
    // The first read of each locale is still out; the create reads, and is answered, on its own
    const pending = reads.splice(0)
    vi.mocked(fetchContent).mockImplementation(async (_c, slug, locale) =>
      locale === 'nb' ? missing() : version(slug, locale ?? 'en'),
    )
    await act(() => result.current.create('nb'))
    expect(createContentItem).toHaveBeenCalledTimes(1)
    await act(async () => {
      for (const answer of pending) answer()
    })
    expect(result.current.states?.get('nb')).toBe('exists')
    expect(result.current.states?.get('en')).toBe('exists')
  })
})

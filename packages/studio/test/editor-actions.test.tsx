import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveFailure } from '../src/editor/save-failure.js'
import { type ActionsInput, useEditorActions } from '../src/editor/use-editor-actions.js'
import type { SavedContent } from '../src/lib/api.js'
import { updateContentItem } from '../src/lib/api.js'
import { ApiError } from '../src/lib/api-client.js'
import type { ContentItem } from '../src/lib/api-types.js'
import { ToastProvider } from '../src/ui/toast.js'
import { contentOf } from './fixtures/editor-api.js'

vi.mock('../src/lib/api.js', async (original) => ({
  ...(await original<typeof import('../src/lib/api.js')>()),
  updateContentItem: vi.fn(),
  fetchContent: vi.fn(async () => SAVED),
}))

const SAVED = contentOf({
  slug: 'pricing',
  version: 3,
  liveVersion: 3,
  fields: { title: 'Pricing' },
}) as unknown as ContentItem

function input(): ActionsInput {
  return {
    collection: 'pages',
    saved: SAVED,
    baseVersion: 3,
    newLocale: undefined,
    draft: {
      metadata: {},
      fields: { title: 'Prices' },
      body: '',
    },
    newSlug: '',
    onSaved: () => {},
    onReplaced: () => {},
    onCreated: () => {},
  }
}

function wrapper({ children }: { children: ReactNode }): ReactNode {
  return (
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  )
}

afterEach(() => {
  vi.mocked(updateContentItem).mockReset()
})

describe('saving', () => {
  it('sends one save at a time: a second save while the first runs sends nothing', async () => {
    let answer: (saved: SavedContent) => void = () => {}
    vi.mocked(updateContentItem).mockImplementation(
      () =>
        new Promise<SavedContent>((resolve) => {
          answer = resolve
        }),
    )
    const { result } = renderHook(() => useEditorActions(input()), { wrapper })
    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.save(undefined)
    })
    await act(() => result.current.save(undefined))
    expect(updateContentItem).toHaveBeenCalledTimes(1)
    await act(async () => {
      answer({ slug: 'pricing', collection: 'pages', version: 4, liveVersion: 3, message: '' })
      await first
    })
    expect(result.current.failure).toBeNull()
    expect(result.current.busy).toBeNull()
  })
})

describe('a refused save', () => {
  it('marks the fields a validation answer names, and passes over details that are not objects', () => {
    const err = new ApiError('Validation failed', 400, {
      details: [null, 'title', { field: 'title', message: 'Required' }, { field: 3 }],
    })
    expect(saveFailure(err, 'The draft could not be saved').fieldErrors).toEqual({
      title: 'Required',
    })
  })
})

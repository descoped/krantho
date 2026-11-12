import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Draft } from '../src/editor/editor-model.js'
import { autosaveKey, readAutosave, writeAutosave } from '../src/editor/kept-work.js'
import { type AutosaveInput, useAutosave } from '../src/editor/use-autosave.js'

const KEY = autosaveKey('services', 'advisory', 'en')
const OPENED: Draft = {
  metadata: {},
  fields: { ingress: 'Saved ingress' },
  body: '',
}
const TYPED: Draft = {
  metadata: {},
  fields: { ingress: 'Unsaved work' },
  body: '',
}

function input(draft: Draft, dirty: boolean): AutosaveInput {
  return { key: KEY, draft, dirty, opened: OPENED, context: { baseVersion: 4 } }
}

function memoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
}

/** The page goes: a reload, a closed tab, an address typed */
function leavePage(): void {
  window.dispatchEvent(new Event('pagehide'))
}

describe('unsaved work as the page goes', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is kept at once, while the editor is still open and before the keep-after delay', () => {
    const { unmount } = renderHook(() => useAutosave(input(TYPED, true)))
    expect(readAutosave(KEY)).toBeNull()
    leavePage()
    expect(readAutosave(KEY)).toMatchObject({ ...TYPED, baseVersion: 4 })
    unmount()
  })

  it('keeps nothing when nothing is unsaved', () => {
    const { unmount } = renderHook(() => useAutosave(input(OPENED, false)))
    leavePage()
    expect(readAutosave(KEY)).toBeNull()
    unmount()
  })

  it('leaves the slot of work still offered from an earlier visit', () => {
    const earlier: Draft = {
      metadata: {},
      fields: { ingress: 'Earlier work' },
      body: '',
    }
    writeAutosave(KEY, earlier, { baseVersion: 4 })
    const { result, unmount } = renderHook(() => useAutosave(input(TYPED, true)))
    expect(result.current.offer).toMatchObject(earlier)
    leavePage()
    expect(readAutosave(KEY)).toMatchObject(earlier)
    unmount()
  })

  it('stops listening once the editor closes', () => {
    const { rerender, unmount } = renderHook((props: AutosaveInput) => useAutosave(props), {
      initialProps: input(TYPED, true),
    })
    rerender(input(OPENED, false))
    unmount()
    localStorage.clear()
    leavePage()
    expect(readAutosave(KEY)).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rebaseDraft, sameDraft, toSlug } from '../src/editor/editor-model.js'
import { conflictKeeping } from '../src/editor/editor-notices.js'
import {
  autosaveKey,
  clearAutosave,
  keptBasis,
  leaveMessage,
  newDocumentKey,
  readAutosave,
  worthOffering,
  writeAutosave,
} from '../src/editor/kept-work.js'
import { FieldRefusal, saveFailure } from '../src/editor/save-failure.js'
import { nextAsk, retryAfter } from '../src/editor/use-edit-lock.js'
import { ApiError } from '../src/lib/api-client.js'

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

describe('drafts', () => {
  it('compares drafts by content, not key order; an undefined field equals an absent one', () => {
    const a = {
      metadata: {},
      fields: { title: 'A', order: 2 },
      body: 'x',
    }
    expect(
      sameDraft(a, {
        metadata: {},
        fields: { order: 2, title: 'A' },
        body: 'x',
      }),
    ).toBe(true)
    expect(
      sameDraft(a, {
        metadata: {},
        fields: { title: 'A', order: 2, note: undefined },
        body: 'x',
      }),
    ).toBe(true)
    expect(
      sameDraft(a, {
        metadata: {},
        fields: { title: 'B', order: 2 },
        body: 'x',
      }),
    ).toBe(false)
    expect(
      sameDraft(a, {
        metadata: {},
        fields: { title: 'A', order: 2 },
        body: 'y',
      }),
    ).toBe(false)
  })

  it('keeps what was typed while a save was in flight, and takes the rest from the saved copy', () => {
    const sent = {
      metadata: {},
      fields: { title: 'Sent', order: 1 },
      body: 'sent body',
    }
    const current = {
      metadata: {},
      fields: { title: 'Sent', order: 1, note: 'typed later' },
      body: 'typed',
    }
    const saved = {
      metadata: {},
      fields: { title: 'Sent', order: 1, 'updated-by': 'api' },
      body: 'sent body',
    }
    expect(rebaseDraft(current, sent, saved)).toEqual({
      metadata: {},

      fields: { title: 'Sent', order: 1, 'updated-by': 'api', note: 'typed later' },
      body: 'typed',
    })
    // Nothing typed since: the saved copy as it is
    expect(rebaseDraft(sent, sent, saved)).toEqual(saved)
  })

  it('suggests a slug from a title', () => {
    expect(toSlug('  Hello, Fjord World! ')).toBe('hello-fjord-world')
  })
})

describe('kept work', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps each locale version’s work under its own key, whatever the site’s locales', () => {
    expect(autosaveKey('pages', 'about', 'en')).toBe('krantho-autosave-pages-about-en')
    expect(autosaveKey('pages', 'about', 'no')).toBe('krantho-autosave-pages-about-no')
  })

  it('keeps a new document’s work per collection and locale', () => {
    expect(newDocumentKey('pages', undefined)).toBe('krantho-autosave-new-pages')
    expect(newDocumentKey('pages', 'no')).toBe('krantho-autosave-new-pages-no')
  })

  it('keeps work with its base version and slug, reads it back and clears it', () => {
    const key = autosaveKey('pages', 'about', 'en')
    const draft = {
      metadata: {},
      fields: { title: 'Kept' },
      body: 'b',
    }
    writeAutosave(key, draft, { baseVersion: 5 }, new Date('2026-10-02T10:00:00Z'))
    expect(readAutosave(key)).toEqual({
      metadata: {},

      fields: { title: 'Kept' },
      body: 'b',
      baseVersion: 5,
      savedAt: '2026-10-02T10:00:00.000Z',
    })
    clearAutosave(key)
    expect(readAutosave(key)).toBeNull()
    localStorage.setItem(key, '{not json')
    expect(readAutosave(key)).toBeNull()
    localStorage.setItem(
      key,
      JSON.stringify({
        metadata: {},
        fields: [],
        body: 1,
      }),
    )
    expect(readAutosave(key)).toBeNull()
    // Without the time it was kept, it is not an entry this editor wrote
    localStorage.setItem(
      key,
      JSON.stringify({
        metadata: {},
        fields: {},
        body: '',
      }),
    )
    expect(readAutosave(key)).toBeNull()
  })

  it('reports that nothing was kept when storage refuses', () => {
    vi.stubGlobal('localStorage', {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(
      writeAutosave('k', {
        metadata: {},
        fields: {},
        body: '',
      }),
    ).toBe(false)
  })

  it('offers kept work that differs from what opened, or that holds a typed slug', () => {
    const opened = {
      metadata: {},
      fields: {},
      body: '',
    }
    const at = '2026-10-02T10:00:00.000Z'
    expect(worthOffering(null, opened, false)).toBe(false)
    expect(
      worthOffering(
        {
          metadata: {},
          fields: {},
          body: '',
          savedAt: at,
        },
        opened,
        false,
      ),
    ).toBe(false)
    const slugged = {
      metadata: {},
      fields: {},
      body: '',
      savedAt: at,
      slug: 'draft-page',
    }
    expect(worthOffering(slugged, opened, false)).toBe(true)
    const titled = {
      metadata: {},
      fields: { title: 'T' },
      body: '',
      savedAt: at,
    }
    expect(worthOffering(titled, opened, false)).toBe(true)
  })

  it('never offers work on a saved document that does not name the version it was made on', () => {
    const opened = {
      metadata: {},
      fields: {},
      body: '',
    }
    const kept = {
      metadata: {},
      fields: { title: 'T' },
      body: '',
      savedAt: '2026-10-02T10:00:00.000Z',
    }
    expect(worthOffering(kept, opened, true)).toBe(false)
    expect(worthOffering({ ...kept, baseVersion: 3 }, opened, true)).toBe(true)
  })

  it('says which version the kept work was made on, and that the document moved on', () => {
    const kept = {
      metadata: {},
      fields: {},
      body: '',
      savedAt: '2026-10-02T10:00:00.000Z',
      baseVersion: 5,
    }
    expect(keptBasis(kept, 5)).toBe('made on v5')
    expect(keptBasis(kept, 6)).toBe('made on v5 — the document is now v6')
    expect(keptBasis({ ...kept, baseVersion: undefined }, 6)).toBeNull()
  })

  it('tells the truth about leaving in every case', () => {
    expect(leaveMessage('about', 'kept')).toContain('offered back when you open it again')
    expect(leaveMessage('about', 'offer-pending')).toContain('They are not kept')
    expect(leaveMessage('about', 'unavailable')).toContain('cannot keep them')
  })
})

describe('save failures', () => {
  it('says a version conflict, naming both versions, without steering into overwriting', () => {
    const err = new ApiError('modified', 409, { currentVersion: 6, yourVersion: 5 })
    const failure = saveFailure(err, 'failed')
    expect(failure.conflictWith).toBe(6)
    expect(failure.message).toContain('v6 was saved after v5')
    expect(failure.message).toContain('Nothing was saved')
    expect(failure.message).not.toMatch(/overwrite|save again|kept/i)
  })

  it('says of a conflict whether the work is kept in this browser, truthfully', () => {
    expect(conflictKeeping('kept', 6)).toBe(
      ' They are also kept in this browser; reload to see v6.',
    )
    expect(conflictKeeping('offer-pending', 6)).toContain('not kept in this browser')
    expect(conflictKeeping('unavailable', 6)).toBe(
      ' This browser cannot keep them: reloading loses them.',
    )
  })

  it('names the lock holder without the role prefix', () => {
    const err = new ApiError('locked', 423, { lockedBy: 'editor:other@e2e.local' })
    expect(saveFailure(err, 'failed')).toMatchObject({ lockedBy: 'other@e2e.local' })
  })

  it('maps validation details to fields', () => {
    const err = new ApiError('Validation failed', 422, {
      details: [{ field: 'title', message: 'Required' }],
    })
    expect(saveFailure(err, 'failed').fieldErrors).toEqual({ title: 'Required' })
  })

  it('puts a refused slug on the slug field', () => {
    const failure = saveFailure(new FieldRefusal('slug', 'Taken'), 'failed')
    expect(failure).toEqual({ message: 'Taken', fieldErrors: { slug: 'Taken' } })
  })
})

describe('edit lock renewal', () => {
  it('waits longer after each failed ask, up to a minute', () => {
    expect([1, 2, 3, 4, 5, 9].map(retryAfter)).toEqual([
      5000, 10_000, 20_000, 40_000, 60_000, 60_000,
    ])
  })

  const now = Date.parse('2026-10-02T10:00:00Z')

  it('renews a held lock at half its remaining lease, as the server sets it', () => {
    const in5min = new Date(now + 5 * 60_000).toISOString()
    expect(nextAsk({ state: 'held', expiresAt: in5min }, now)).toBe(150_000)
    const in1min = new Date(now + 60_000).toISOString()
    expect(nextAsk({ state: 'held', expiresAt: in1min }, now)).toBe(30_000)
  })

  it('never renews sooner than five seconds, and once a minute without an expiry', () => {
    const lapsed = new Date(now - 1000).toISOString()
    expect(nextAsk({ state: 'held', expiresAt: lapsed }, now)).toBe(5000)
    expect(nextAsk({ state: 'held', expiresAt: null }, now)).toBe(60_000)
  })

  it('asks again every half minute while someone else holds it, and not at all otherwise', () => {
    expect(nextAsk({ state: 'foreign', holder: 'a', expiresAt: null }, now)).toBe(30_000)
    expect(nextAsk({ state: 'none' }, now)).toBeNull()
    expect(nextAsk({ state: 'unavailable' }, now)).toBeNull()
  })
})

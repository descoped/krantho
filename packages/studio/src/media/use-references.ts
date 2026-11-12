import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMediaUsage, fetchMediaUsages } from '../lib/api.js'
import { type References, referencingDocuments } from './media-model.js'

export interface ReferenceBook {
  /** What is known of each file's references, by id; a missing id is not read yet */
  of: (id: string) => References | undefined
  /** Read a file's references again */
  refresh: (id: string) => void
}

/**
 * Each shown file's references: the files of a page read together, from
 * `GET /api/media/usage?ids=`, and one again on request
 * (`GET /api/media/:id/usage`). A file whose usage cannot be read says so;
 * no count is ever guessed.
 */
export function useReferences(ids: readonly string[]): ReferenceBook {
  const [book, setBook] = useState<ReadonlyMap<string, References>>(new Map())
  const requested = useRef(new Set<string>())

  const record = useCallback((entries: ReadonlyArray<readonly [string, References]>) => {
    setBook((current) => {
      const next = new Map(current)
      for (const [id, references] of entries) next.set(id, references)
      return next
    })
  }, [])

  /** One file again, on request: after a write, or when a delete is asked */
  const read = useCallback(
    (id: string) => {
      requested.current.add(id)
      record([[id, { state: 'loading' }]])
      fetchMediaUsage(id)
        .then(
          (usage) => ({ state: 'ready', documents: referencingDocuments(usage.usage) }) as const,
        )
        .catch(() => ({ state: 'failed' }) as const)
        .then((references: References) => record([[id, references]]))
    },
    [record],
  )

  /** The files not read yet, in one request: every collection is read once for all of them */
  useEffect(() => {
    const unread = ids.filter((id) => !requested.current.has(id))
    if (unread.length === 0) return
    for (const id of unread) requested.current.add(id)
    record(unread.map((id) => [id, { state: 'loading' }] as const))
    fetchMediaUsages(unread)
      .then((usage) =>
        unread.map(
          (id) =>
            [id, { state: 'ready', documents: referencingDocuments(usage[id] ?? []) }] as const,
        ),
      )
      .catch(() => unread.map((id) => [id, { state: 'failed' }] as const))
      .then((entries: ReadonlyArray<readonly [string, References]>) => record(entries))
  }, [ids, record])

  const of = useCallback((id: string) => book.get(id), [book])
  return { of, refresh: read }
}

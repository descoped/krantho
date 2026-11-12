import { useEffect, useState } from 'react'
import { type CollectionImpactResponse, fetchCollectionImpact } from '../lib/api.js'

/** What changing a collection's types would do to its documents: unasked, being read, read, or unreadable */
export type Impact =
  | { state: 'idle' }
  | { state: 'reading' }
  | { state: 'ready'; impact: CollectionImpactResponse }
  | { state: 'error' }

/**
 * The impact analysis of a change to the collection's types
 * (`GET /api/seo/collection/:name/impact`): read again each time the choice
 * changes, an older answer never overtaking a newer one
 */
export function useArchetypeImpact(
  collection: string,
  types: readonly string[],
  changed: boolean,
): Impact {
  const [impact, setImpact] = useState<Impact>({ state: 'idle' })
  const archetype = types.join(',')
  useEffect(() => {
    if (!changed || archetype === '') {
      setImpact({ state: 'idle' })
      return
    }
    let current = true
    setImpact({ state: 'reading' })
    fetchCollectionImpact(collection, archetype).then(
      (answer) => current && setImpact({ state: 'ready', impact: answer }),
      () => current && setImpact({ state: 'error' }),
    )
    return () => {
      current = false
    }
  }, [collection, archetype, changed])
  return impact
}

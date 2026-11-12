import { useEffect, useState } from 'react'
import { type SearchHit, searchContent } from '../lib/api.js'

/** Searching starts at this many characters, as the API requires */
export const MIN_QUERY_LENGTH = 2

const DEBOUNCE_MS = 200

/** At most this many matches are listed */
const MAX_RESULTS = 8

export type SearchState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'done'; items: readonly SearchHit[] }
  | { phase: 'failed'; message: string }

/** Documents matching a query, debounced; idle below the minimum length */
export function useDocumentSearch(query: string): SearchState {
  const [state, setState] = useState<SearchState>({ phase: 'idle' })
  const term = query.trim()

  useEffect(() => {
    if (term.length < MIN_QUERY_LENGTH) {
      setState({ phase: 'idle' })
      return
    }
    let active = true
    setState({ phase: 'loading' })
    const timer = setTimeout(() => {
      searchContent(term)
        .then((result) => {
          if (active) setState({ phase: 'done', items: result.items.slice(0, MAX_RESULTS) })
        })
        .catch((err: unknown) => {
          if (active) {
            setState({
              phase: 'failed',
              message: err instanceof Error ? err.message : 'Search failed',
            })
          }
        })
    }, DEBOUNCE_MS)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [term])

  return state
}

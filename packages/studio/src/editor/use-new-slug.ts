import { useCallback, useState } from 'react'
import { suggestsSlug, toSlug } from './editor-model.js'

export interface NewSlugState {
  value: string
  /** The person types a slug: it is no longer suggested */
  onChange: (value: string) => void
  /** A field changed: a title suggests the slug until the person has typed one */
  suggestFrom: (name: string, value: unknown) => void
}

/** A new document's slug: suggested from its title until the person types one */
export function useNewSlug(): NewSlugState {
  const [value, setValue] = useState('')
  const [typed, setTyped] = useState(false)
  const onChange = useCallback((next: string) => {
    setValue(next)
    setTyped(true)
  }, [])
  const suggestFrom = useCallback(
    (name: string, next: unknown) => {
      if (!typed && suggestsSlug(name) && typeof next === 'string') setValue(toSlug(next))
    },
    [typed],
  )
  return { value, onChange, suggestFrom }
}

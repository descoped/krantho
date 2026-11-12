import type { Decorator } from './types.js'

const decorators: Decorator[] = []

/**
 * Register a page-structure decorator. A site registers its own for
 * structures krantho does not know, the same way krantho registers its
 * built-ins; one with the id of a registered decorator replaces it in place.
 * Returns a function that restores the previous registration.
 */
export function registerDecorator(decorator: Decorator): () => void {
  const index = decorators.findIndex((registered) => registered.id === decorator.id)
  const previous = index >= 0 ? decorators[index] : undefined
  if (index >= 0) decorators[index] = decorator
  else decorators.push(decorator)
  return () => {
    const at = decorators.indexOf(decorator)
    if (at < 0) return
    if (previous) decorators[at] = previous
    else decorators.splice(at, 1)
  }
}

/** The registered decorators, in the order they run */
export function registeredDecorators(): readonly Decorator[] {
  return [...decorators]
}

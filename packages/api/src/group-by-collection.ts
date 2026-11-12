/**
 * Items grouped by the collection they belong to, in the order of `names`: every name has a
 * group, empty when no item belongs to it. Items keep the order they came in.
 */
export function groupByCollection<T>(
  items: readonly T[],
  names: readonly string[],
  collectionOf: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>(names.map((name) => [name, []]))
  for (const item of items) groups.get(collectionOf(item))?.push(item)
  return groups
}

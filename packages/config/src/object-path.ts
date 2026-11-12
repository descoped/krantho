/** Plain object check — arrays, null and class instances are not plain */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value) as unknown
  return proto === Object.prototype || proto === null
}

/** Read a dotted path out of a nested object */
export function getPath(target: unknown, path: string): unknown {
  let current: unknown = target
  for (const segment of path.split('.')) {
    if (!isPlainObject(current)) return undefined
    current = current[segment]
  }
  return current
}

/** Write a dotted path into a nested object, creating intermediate objects */
export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.')
  const last = segments.pop()
  if (last === undefined) return
  let current = target
  for (const segment of segments) {
    const next = current[segment]
    if (!isPlainObject(next)) {
      const created: Record<string, unknown> = {}
      current[segment] = created
      current = created
    } else {
      current = next
    }
  }
  current[last] = value
}

/**
 * Merge `overlay` onto `base`, recursing into plain objects.
 * Arrays replace wholesale and `undefined` never overwrites.
 */
export function deepMerge<T>(base: T, overlay: unknown): T {
  if (overlay === undefined) return base
  if (!isPlainObject(base) || !isPlainObject(overlay)) return overlay as T

  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue
    merged[key] = deepMerge(merged[key], value)
  }
  return merged as T
}

/**
 * Dotted paths of every value in `target` that is not a plain object.
 * `stopAt` paths are reported whole rather than descended into.
 */
export function leafPaths(target: unknown, stopAt: ReadonlySet<string>, prefix = ''): string[] {
  if (!isPlainObject(target)) return prefix ? [prefix] : []

  const paths: string[] = []
  for (const [key, value] of Object.entries(target)) {
    if (value === undefined) continue
    const path = prefix ? `${prefix}.${key}` : key
    if (stopAt.has(path) || !isPlainObject(value)) {
      paths.push(path)
      continue
    }
    paths.push(...leafPaths(value, stopAt, path))
  }
  return paths
}

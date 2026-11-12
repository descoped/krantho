/**
 * `path` resolved the way a browser resolves it against `base`, kept only when
 * it stays on `base`'s origin and its path cannot be read as another host: a
 * path that normalises to `//host` (`/..//host`, and `/../\host`, whose raw
 * backslash the URL parser turns into `/`) or carries an encoded backslash
 * (`%5C`) is refused. Returns null for anything refused or unparseable.
 */
export function resolveSitePath(path: string, base: string | URL): URL | null {
  let target: URL
  let decoded: string
  try {
    target = new URL(path, base)
    decoded = decodeURIComponent(target.pathname)
  } catch {
    return null
  }
  if (target.origin !== new URL(base).origin) return null
  if (decoded.startsWith('//') || decoded.includes('\\')) return null
  return target
}

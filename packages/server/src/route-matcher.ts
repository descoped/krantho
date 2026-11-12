/**
 * Route-scope pattern matching and specificity scoring.
 *
 * Pattern syntax:
 * - Literal segments: `/services/consulting` — exact match
 * - Single-segment wildcard: `/services/*` — matches one segment
 * - Multi-segment wildcard: `/services/**` — matches one or more segments
 *   (deliberately requires at least one segment, unlike standard glob zero-or-more)
 *
 * Specificity: more literal segments = higher specificity.
 * Used to determine which route-scope config wins when multiple patterns match.
 */

/** Test whether a URL path matches a route pattern. */
export function matchRoute(pattern: string, url: string): boolean {
  const patternParts = splitPath(pattern)
  const urlParts = splitPath(url)
  return matchParts(patternParts, urlParts, 0, 0)
}

/**
 * Compute a specificity score for a route pattern.
 * Higher score = more specific = higher precedence.
 * Literal segments score 2, single wildcards 1, multi-wildcards 0.
 */
export function routeSpecificity(pattern: string): number {
  const parts = splitPath(pattern)
  let score = 0
  for (const part of parts) {
    if (part === '**') {
      // Globstar contributes nothing — least specific
    } else if (part === '*') {
      score += 1
    } else {
      score += 2
    }
  }
  return score
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean)
}

function matchParts(pattern: string[], url: string[], pi: number, ui: number): boolean {
  // Both exhausted — match
  if (pi === pattern.length && ui === url.length) return true

  // Pattern exhausted, URL has more — no match
  if (pi === pattern.length) return false

  const segment = pattern[pi]!

  // Multi-segment wildcard — matches one or more remaining URL segments
  if (segment === '**') {
    for (let skip = 1; skip <= url.length - ui; skip++) {
      if (matchParts(pattern, url, pi + 1, ui + skip)) return true
    }
    return false
  }

  // URL exhausted but pattern still has non-** segments — no match
  if (ui === url.length) return false

  // Single-segment wildcard — matches any one segment
  if (segment === '*') {
    return matchParts(pattern, url, pi + 1, ui + 1)
  }

  // Literal segment — must match exactly
  if (segment === url[ui]) {
    return matchParts(pattern, url, pi + 1, ui + 1)
  }

  return false
}

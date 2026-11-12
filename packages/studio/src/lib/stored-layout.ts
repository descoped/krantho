/** A layout the viewer chose, kept in this browser: what an unreadable or unavailable store reads as is `{}` */
export function readLayout(key: string): Record<string, unknown> {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown
    return typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function writeLayout(key: string, layout: object): void {
  try {
    localStorage.setItem(key, JSON.stringify(layout))
  } catch {
    // Storage unavailable: the layout holds for this page only.
  }
}

/** A width the viewer chose, when it is a number within the bounds; otherwise the default */
export function widthOf(
  value: unknown,
  bounds: { min: number; max: number },
  fallback: number,
): number {
  return typeof value === 'number' && value >= bounds.min && value <= bounds.max ? value : fallback
}

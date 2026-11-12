import { Plus } from 'lucide-react'
import type { ReactElement } from 'react'
import { Button } from '../ui/button.js'
import type { Size } from './live-geometry.js'
import { type Box, markBox } from './live-marks.js'
import type { PlaceholderAnchor } from './live-sections.js'

/**
 * The designed sections the body lacks. In the page, Studio's layer draws
 * only a thin dashed marker where each would show — after the earlier
 * designed section's mark or before the later one's — tagged "<Name> · not
 * written": it takes no clicks and covers nothing of the site. The full
 * placeholder, the §5 text with Add section, is listed under the frame, each
 * naming where the page would show it ("after Problem").
 */

/** A placeholder with where its marker goes: its anchor's box, or none */
export interface PlacedPlaceholder {
  readonly anchor: PlaceholderAnchor
  readonly box: Box | null
}

/** The anchors with their boxes, read now */
export function placePlaceholders(anchors: readonly PlaceholderAnchor[]): PlacedPlaceholder[] {
  return anchors.map((anchor) => ({
    anchor,
    box: anchor.mark ? markBox(anchor.mark.element) : null,
  }))
}

/** Where a missing section's marker is drawn, in the layer: a line at the anchor's bottom or top edge */
export function markerLine(
  box: Box,
  side: 'after' | 'before',
  layer: Size,
): { top: number; left: number; width: number } {
  const top = side === 'after' ? box.top + box.height : box.top
  const left = Math.max(0, box.left)
  const right = layer.width > 0 ? Math.min(box.left + box.width, layer.width) : box.left + box.width
  return { top, left, width: Math.max(0, right - left) }
}

/** The thin dashed markers in the page, in Studio's layer: they take no clicks and hide nothing */
export function PlaceholderMarkers({
  placed,
  layer,
}: {
  placed: readonly PlacedPlaceholder[]
  layer: Size
}): ReactElement | null {
  const shown = placed.filter((p): p is PlacedPlaceholder & { box: Box } => p.box !== null)
  if (shown.length === 0) return null
  return (
    <div className="live-placeholder-markers" aria-hidden="true">
      {shown.map(({ anchor, box }) => (
        <div
          key={anchor.name}
          className="live-placeholder-marker"
          data-section={anchor.name}
          style={markerLine(box, anchor.side, layer)}
        >
          <span className="live-placeholder-marker-tag">{`${anchor.name} · not written`}</span>
        </div>
      ))}
    </div>
  )
}

/** Where the page would show a missing section, for its list item */
function position(anchor: PlaceholderAnchor): string | null {
  if (!anchor.neighbour) return null
  return `${anchor.side} ${anchor.neighbour}`
}

/** The full placeholders, under the frame: the §5 text, where the page would show it, and Add section */
export function PlaceholderList({
  placed,
  readOnly,
  onAdd,
}: {
  placed: readonly PlacedPlaceholder[]
  readOnly: boolean
  onAdd: (name: string) => void
}): ReactElement | null {
  if (placed.length === 0) return null
  return (
    <ul className="live-missing" aria-label="Designed sections not written">
      {placed.map(({ anchor }) => (
        <li key={anchor.name} className="live-placeholder" data-section={anchor.name}>
          <p>
            {anchor.name} is in this page's section contract but hasn't been written. The page
            leaves it out.
            {position(anchor) && (
              <span className="live-placeholder-at"> In the page: {position(anchor)}.</span>
            )}
          </p>
          <Button
            size="sm"
            icon={Plus}
            disabled={readOnly}
            aria-label={`Add section ${anchor.name}`}
            onClick={() => onAdd(anchor.name)}
          >
            Add section
          </Button>
        </li>
      ))}
    </ul>
  )
}

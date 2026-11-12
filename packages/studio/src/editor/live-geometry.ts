import type { Box } from './live-marks.js'

/**
 * Where Live mode's own layer puts things over the frame: a tag on its
 * outline, and the inline editor at its element — always where they can be
 * seen whole, wherever the element is scrolled to. Pure arithmetic on boxes
 * in the frame's viewport, which the layer covers exactly.
 */

/** A width and a height, in pixels */
export interface Size {
  readonly width: number
  readonly height: number
}

/** The height a tag takes */
const TAG_HEIGHT = 20
/** About how wide one character of a tag is, to keep a short tag beside its element */
const TAG_CHAR_WIDTH = 7
/** The space kept between the inline editor, the element and the stage's edges */
export const EDITOR_GAP = 8
/** The narrowest a markdown editor is, however narrow the element it edits */
export const EDITOR_MIN_WIDTH = 360

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

/** A tag's place, relative to its outline's top left corner, and the width it may take */
export interface TagPlacement {
  readonly top: number
  readonly left: number
  readonly maxWidth: number
}

/** Whether two boxes share any area */
function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  )
}

/**
 * The tag sits above its outline when the layer has room there; otherwise
 * inside it, at the top of the part of the outline that shows — so an element
 * scrolled past its top still shows its tag at the top of the stage. It is
 * never under the inline editor (`avoid`): where the editor covers the place
 * above, the tag goes inside the outline's top edge, else under the element;
 * where the editor covers all three there is no tag — the open editor's
 * label names the same field or section. It is kept inside the layer's
 * width, as wide as its text where that fits.
 */
export function tagPlacement(
  box: Box,
  layer: Size,
  text: string,
  avoid: Box | null = null,
): TagPlacement | null {
  const inside = clamp(-box.top, 0, Math.max(0, box.height - TAG_HEIGHT))
  const above = box.top >= TAG_HEIGHT ? -TAG_HEIGHT : inside
  const below = box.top + box.height + TAG_HEIGHT <= layer.height ? box.height : inside
  const wanted = Math.min(text.length * TAG_CHAR_WIDTH + 2 * EDITOR_GAP, layer.width)
  const x = clamp(box.left, 0, Math.max(0, layer.width - wanted))
  const free = (top: number): boolean =>
    avoid === null ||
    !overlaps({ top: box.top + top, left: x, width: wanted, height: TAG_HEIGHT }, avoid)
  const top = [above, inside, below].find(free)
  if (top === undefined) return null
  return { top, left: x - box.left, maxWidth: Math.max(wanted, layer.width - x) }
}

/** Where the inline editor sits, its width when it follows its element, and the height it scrolls within when the stage is shorter than it */
export interface EditorPlacement {
  readonly top: number
  readonly left: number
  readonly maxHeight: number | null
  /** The width it takes: null leaves the editor its own */
  readonly width: number | null
}

/**
 * The width of an editor that is as wide as its element: the element's own
 * width, at least `EDITOR_MIN_WIDTH`, and never wider than the stage allows.
 * Null while the element has no box or the stage no width.
 */
export function editorWidth(box: Box | null, stage: Size): number | null {
  const room = stage.width - 2 * EDITOR_GAP
  if (!box || room <= 0) return null
  return Math.min(Math.max(box.width, EDITOR_MIN_WIDTH), room)
}

/**
 * The height a markdown editor's textarea takes: all of its text, up to the
 * most the stage leaves it, then it scrolls. Null before the text has a
 * height — nothing is laid out — which leaves the textarea its own.
 */
export function areaHeight(content: number, limit: number): number | null {
  if (content <= 0) return null
  return limit > 0 ? Math.min(content, limit) : content
}

/**
 * The inline editor's place in the stage, from its measured size: under the
 * element when that fits, above it when that fits, and always clamped whole
 * inside the stage — the element may be far above or below what shows.
 * Taller than the stage, it fills it and scrolls inside itself. `fit` makes it
 * as wide as the element (`editorWidth`), which then is its width here.
 */
export function editorPlacement(
  box: Box | null,
  stage: Size,
  size: Size,
  fit = false,
): EditorPlacement {
  const width = fit ? editorWidth(box, stage) : null
  const room = stage.height - 2 * EDITOR_GAP
  const left = clamp(
    box?.left ?? EDITOR_GAP,
    EDITOR_GAP,
    stage.width - EDITOR_GAP - (width ?? size.width),
  )
  if (room > 0 && size.height > room) return { top: EDITOR_GAP, left, maxHeight: room, width }
  if (!box || room <= 0) return { top: EDITOR_GAP, left, maxHeight: null, width }
  const lowest = stage.height - EDITOR_GAP - size.height
  const below = box.top + box.height + EDITOR_GAP
  const above = box.top - EDITOR_GAP - size.height
  const wanted = below <= lowest ? below : above >= EDITOR_GAP ? above : below
  return { top: clamp(wanted, EDITOR_GAP, lowest), left, maxHeight: null, width }
}

/** A compact element toolbar joined to its bottom edge, kept within the preview. */
export function elementToolbarPlacement(box: Box | null, stage: Size, size: Size): EditorPlacement {
  const room = Math.max(0, stage.width - 2 * EDITOR_GAP)
  const width = room > 0 ? Math.min(Math.max(box?.width ?? size.width, 200), room) : null
  const at = editorPlacement(box, stage, { ...size, width: width ?? size.width })
  if (!box || stage.height <= 0) return { ...at, width }
  const bottom = box.top + box.height + 5
  const fits = bottom + size.height <= stage.height - EDITOR_GAP
  return { ...at, top: fits ? Math.max(EDITOR_GAP, bottom) : at.top, width }
}

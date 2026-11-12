import { describe, expect, it } from 'vitest'
import {
  areaHeight,
  EDITOR_GAP,
  EDITOR_MIN_WIDTH,
  editorPlacement,
  editorWidth,
  elementToolbarPlacement,
  type TagPlacement,
  tagPlacement,
} from '../src/editor/live-geometry.js'

function placed(placement: TagPlacement | null): TagPlacement {
  if (!placement) throw new Error('the tag has no place')
  return placement
}

describe('placing the inline editor', () => {
  const stage = { width: 400, height: 600 }
  const size = { width: 300, height: 100 }
  const lowest = stage.height - EDITOR_GAP - size.height

  /** Wholly inside the stage, Done included */
  function expectWhole(top: number, height = size.height): void {
    expect(top).toBeGreaterThanOrEqual(EDITOR_GAP)
    expect(top + height).toBeLessThanOrEqual(stage.height - EDITOR_GAP)
  }

  it('sits under the element when it fits', () => {
    const box = { top: 20, left: 10, width: 100, height: 30 }
    expect(editorPlacement(box, stage, size)).toEqual({
      top: 58,
      left: 10,
      maxHeight: null,
      width: null,
    })
  })

  it('flips above an element near the bottom', () => {
    const box = { top: 540, left: 10, width: 100, height: 30 }
    const at = editorPlacement(box, stage, size)
    expect(at?.top).toBe(540 - EDITOR_GAP - size.height)
    expectWhole(at?.top)
  })

  it('stays whole for an element far below the stage', () => {
    const box = { top: 2000, left: 10, width: 100, height: 30 }
    const at = editorPlacement(box, stage, size)
    expect(at?.top).toBe(lowest)
    expectWhole(at?.top)
  })

  it('stays whole for an element partly below the stage', () => {
    const box = { top: 650, left: 10, width: 100, height: 300 }
    expectWhole(editorPlacement(box, stage, size).top)
    const peeking = { top: 590, left: 10, width: 100, height: 300 }
    expectWhole(editorPlacement(peeking, stage, size).top)
  })

  it('stays whole for an element far above the stage', () => {
    const box = { top: -2000, left: 10, width: 100, height: 30 }
    const at = editorPlacement(box, stage, size)
    expect(at?.top).toBe(EDITOR_GAP)
    expectWhole(at?.top)
  })

  it('stays inside the stage beside an element taller than it can clear', () => {
    const box = { top: 10, left: 10, width: 100, height: 580 }
    expectWhole(editorPlacement(box, stage, size).top)
  })

  it('fills a stage shorter than itself and scrolls inside it', () => {
    const small = { width: 400, height: 300 }
    const box = { top: 50, left: 10, width: 100, height: 30 }
    expect(editorPlacement(box, small, { width: 300, height: 400 })).toEqual({
      top: EDITOR_GAP,
      left: 10,
      maxHeight: small.height - 2 * EDITOR_GAP,
      width: null,
    })
  })

  it('keeps its whole width inside the stage', () => {
    const box = { top: 20, left: 350, width: 40, height: 20 }
    expect(editorPlacement(box, stage, size).left).toBe(stage.width - EDITOR_GAP - size.width)
  })
})

describe('placing a tag on its outline', () => {
  const layer = { width: 800, height: 600 }

  it('sits above an outline with room above it', () => {
    const at = tagPlacement({ top: 40, left: 10, width: 100, height: 20 }, layer, 'field · title')
    expect(at?.top).toBe(-20)
    expect(at?.left).toBe(0)
  })

  it('sits inside an outline at the top of the layer', () => {
    expect(tagPlacement({ top: 0, left: 0, width: 10, height: 30 }, layer, 'x')?.top).toBe(0)
  })

  it('shows at the top of the stage for a tall element scrolled past its top', () => {
    const box = { top: -500, left: 10, width: 300, height: 2000 }
    const at = placed(tagPlacement(box, layer, 'section · Approach · designed'))
    // Relative to the outline: 500px down it, which is the stage's top
    expect(box.top + at.top).toBe(0)
  })

  it('is never under the inline editor placed above the element: it goes inside the outline instead', () => {
    const stage = { width: 800, height: 480 }
    const size = { width: 360, height: 200 }
    const box = { top: 300, left: 10, width: 300, height: 100 }
    const editor = editorPlacement(box, stage, size)
    expect(editor.top).toBe(92)
    const avoid = { top: editor.top, left: editor.left, ...size }
    const text = 'section · Problem · designed'
    // Without the editor the tag sits above the outline, where the editor now is
    expect(tagPlacement(box, stage, text)?.top).toBe(-20)
    const at = tagPlacement(box, stage, text, avoid)
    expect(at?.top).toBe(0)
    const offset = at?.top ?? Number.NaN
    const tag = { top: box.top + offset, bottom: box.top + offset + 20 }
    expect(tag.top >= editor.top + size.height || tag.bottom <= editor.top).toBe(true)
  })

  it('goes under the element when the editor covers both above it and its top edge', () => {
    const box = { top: 100, left: 10, width: 300, height: 40 }
    const avoid = { top: 60, left: 0, width: 400, height: 70 }
    expect(tagPlacement(box, layer, 'field · title', avoid)?.top).toBe(40)
  })

  it('has no place when the editor covers above, inside and under the element: the editor names it', () => {
    const stage = { width: 1000, height: 480 }
    const size = { width: 360, height: 400 }
    const box = { top: 300, left: 10, width: 300, height: 30 }
    const editor = editorPlacement(box, stage, size)
    const avoid = { top: editor.top, left: editor.left, ...size }
    expect(tagPlacement(box, stage, 'field · title', avoid)).toBeNull()
  })

  it('stays inside a phone-width layer, cut with an ellipsis, its full text kept as its title', () => {
    const phone = { width: 390, height: 600 }
    const text = 'section · How we price our consulting engagements, in detail · designed'
    const box = { top: 100, left: 250, width: 120, height: 40 }
    const at = placed(tagPlacement(box, phone, text))
    const x = box.left + at.left
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x + at.maxWidth).toBeLessThanOrEqual(phone.width)
    const short = placed(tagPlacement(box, phone, 'field · title'))
    expect(box.left + short.left).toBe(250)
  })
})

describe('the width of a section editor', () => {
  const stage = { width: 800, height: 600 }
  const at = (width: number) => ({ top: 20, left: 40, width, height: 30 })

  it('is the width of its element', () => {
    expect(editorWidth(at(500), stage)).toBe(500)
  })

  it('is never narrower than the minimum', () => {
    expect(editorWidth(at(120), stage)).toBe(EDITOR_MIN_WIDTH)
  })

  it('is never wider than the stage allows, gaps included', () => {
    expect(editorWidth(at(2000), stage)).toBe(stage.width - 2 * EDITOR_GAP)
    expect(editorWidth(at(500), { width: 300, height: 600 })).toBe(300 - 2 * EDITOR_GAP)
  })

  it('is left to the editor while the element has no box or the stage no width', () => {
    expect(editorWidth(null, stage)).toBeNull()
    expect(editorWidth(at(500), { width: 0, height: 0 })).toBeNull()
  })

  it('places the editor with that width, clamped whole inside the stage', () => {
    const size = { width: 360, height: 100 }
    const under = editorPlacement(at(500), stage, size, true)
    expect(under).toMatchObject({ top: 58, left: 40, width: 500 })
    const right = { top: 20, left: 700, width: 500, height: 30 }
    expect(editorPlacement(right, stage, size, true).left).toBe(stage.width - EDITOR_GAP - 500)
  })

  it('leaves a field editor its own width', () => {
    expect(editorPlacement(at(500), stage, { width: 360, height: 100 }).width).toBeNull()
  })
})

describe('the height of a section editor’s textarea', () => {
  it('follows its text up to what the stage leaves it, then scrolls', () => {
    expect(areaHeight(120, 400)).toBe(120)
    expect(areaHeight(900, 400)).toBe(400)
  })

  it('is left alone where nothing is laid out, and unlimited where no limit is known', () => {
    expect(areaHeight(0, 400)).toBeNull()
    expect(areaHeight(300, 0)).toBe(300)
  })
})

describe('the attached element toolbar', () => {
  const stage = { width: 800, height: 600 }
  const size = { width: 240, height: 40 }

  it('joins the lower outline edge and follows the element’s width', () => {
    const at = elementToolbarPlacement({ top: 50, left: 20, width: 600, height: 80 }, stage, size)
    expect(at).toMatchObject({ top: 135, left: 20, width: 600 })
  })

  it('keeps the controls visible for a narrow element at the right edge', () => {
    const at = elementToolbarPlacement({ top: 50, left: 740, width: 30, height: 20 }, stage, size)
    expect(at.width).toBe(200)
    expect(at.left + (at.width ?? 0)).toBeLessThanOrEqual(stage.width - EDITOR_GAP)
  })

  it('flips above the element when there is no room beneath it', () => {
    const at = elementToolbarPlacement({ top: 560, left: 20, width: 600, height: 20 }, stage, size)
    expect(at.top).toBeLessThan(560)
    expect(at.top + size.height).toBeLessThanOrEqual(stage.height - EDITOR_GAP)
  })
})

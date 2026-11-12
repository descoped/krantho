import { describe, expect, it } from 'vitest'
import { renderContent } from '../src/content-engine.js'
import { findSection, joinSections, replaceSection, splitSections } from '../src/sections.js'

describe('splitSections', () => {
  it('keeps the lead and the sections in order', () => {
    const split = splitSections(
      'Intro line.\n\n## Problem\n\nIt drifts.\n\n## Approach\n\n- one\n- two\n',
    )
    expect(split.lead).toBe('Intro line.')
    expect(split.sections).toEqual([
      { heading: 'Problem', markdown: 'It drifts.' },
      { heading: 'Approach', markdown: '- one\n- two' },
    ])
  })

  it('has an empty lead when the body starts with a section', () => {
    expect(splitSections('## Only\n\nText').lead).toBe('')
  })

  it('has no sections when the body has no ## heading', () => {
    expect(splitSections('Just text.\n\n### Not a section')).toEqual({
      lead: 'Just text.\n\n### Not a section',
      sections: [],
    })
  })

  it('ignores ## lines inside fenced code', () => {
    const body =
      'Lead\n\n## Install\n\n```md\n## not a heading\n```\n\n~~~\n## nor this\n~~~\n\n## Use\n\nGo.'
    const split = splitSections(body)
    expect(split.sections.map((s) => s.heading)).toEqual(['Install', 'Use'])
    expect(split.sections[0]?.markdown).toContain('## not a heading')
    expect(split.sections[0]?.markdown).toContain('## nor this')
  })

  it('closes a fence only with the marker that opened it', () => {
    const body = '## A\n\n````\n```\n## inside\n```\n````\n\n## B'
    expect(splitSections(body).sections.map((s) => s.heading)).toEqual(['A', 'B'])
  })

  it('keeps sections that share a heading separate', () => {
    const split = splitSections('## Notes\n\nfirst\n\n## Notes\n\nsecond')
    expect(split.sections).toHaveLength(2)
    expect(split.sections[1]?.markdown).toBe('second')
  })

  it('strips closing #s and spaces from a heading', () => {
    expect(splitSections('##   How it works  ##\n\nx').sections[0]?.heading).toBe('How it works')
  })

  it('keeps an empty section', () => {
    expect(splitSections('## Empty\n## Next\n\nx').sections).toEqual([
      { heading: 'Empty', markdown: '' },
      { heading: 'Next', markdown: 'x' },
    ])
  })
})

describe('joinSections', () => {
  it('gives back a normalised body', () => {
    const body = 'Lead.\n\n## Problem\n\nIt drifts.\n\n## Empty\n\n## Approach\n\n- one\n- two'
    expect(joinSections(splitSections(body))).toBe(body)
  })

  it('round-trips through split and join', () => {
    const body = '## A\n\n```\n## code\n```\n\n## A\n\nagain'
    const once = joinSections(splitSections(body))
    expect(joinSections(splitSections(once))).toBe(once)
    expect(splitSections(once)).toEqual(splitSections(body))
  })
})

describe('replaceSection', () => {
  it('changes only the section it names', () => {
    const body = 'Lead.\n\n## Notes\n\nfirst\n\n## Notes\n\nsecond\n\n## End\n\nbye'
    const replaced = joinSections(replaceSection(splitSections(body), 1, 'changed'))
    expect(replaced).toBe('Lead.\n\n## Notes\n\nfirst\n\n## Notes\n\nchanged\n\n## End\n\nbye')
  })

  it('refuses an index with no section', () => {
    expect(() => replaceSection(splitSections('## A'), 3, 'x')).toThrow(RangeError)
  })
})

describe('findSection', () => {
  const split = splitSections('## Proof\n\nfirst\n\n## proof\n\nsecond')

  it('finds the first section with the heading, ignoring case', () => {
    expect(findSection(split, 'PROOF')?.markdown).toBe('first')
    expect(findSection(split.sections, 'proof')?.markdown).toBe('first')
  })

  it('finds nothing for a heading the body lacks', () => {
    expect(findSection(split, 'Limits')).toBeUndefined()
  })
})

describe('rendered sections', () => {
  it('render each section once, the first of a shared heading, and skip fenced headings', async () => {
    const rendered = await renderContent(
      {},
      'Lead.\n\n## A\n\n```\n## code\n```\n\n## A\n\nsecond\n\n## __proto__\n\nsafe',
    )
    expect(Object.keys(rendered.sections)).toEqual(['A', '__proto__'])
    expect(rendered.sections['A']).toContain('<code>## code')
    expect(Object.getPrototypeOf(rendered.sections)).toBe(Object.prototype)
  })
})

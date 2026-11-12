import { describe, expect, it } from 'vitest'
import {
  lengthMeter,
  metaAdvice,
  metaLengthState,
  titleLengthState,
} from '../src/editor/side-panel/findability-model.js'
import {
  addDesignedSection,
  isDesigned,
  pageSections,
  sectionAt,
  sectionKey,
  sectionMetaField,
  wordCount,
} from '../src/editor/side-panel/page-sections.js'
import {
  sameSelection,
  selectionAtCaret,
  selectionTitle,
  selectsOnKeyUp,
} from '../src/editor/side-panel/selection.js'
import { effectiveMetaDescription, metaCoverage } from '../src/lib/findability.js'

const BODY = [
  'Opening words.',
  '',
  '## Problem',
  '',
  'What hurts.',
  '',
  '```md',
  '## Not a heading',
  '```',
  '',
  '## Notes',
  '',
  'Some extra notes here.',
].join('\n')

const LIMITS = { minChars: 120, maxChars: 155 }

describe('the caret mapped to the part of the body it sits in', () => {
  it('is the lead before the first ##', () => {
    expect(selectionAtCaret(BODY, 0)).toEqual({ kind: 'lead' })
    expect(selectionAtCaret(BODY, BODY.indexOf('words'))).toEqual({ kind: 'lead' })
  })

  it('is the section whose heading line or markdown holds it', () => {
    const inHeading = BODY.indexOf('Problem') + 2
    expect(selectionAtCaret(BODY, inHeading)).toEqual({
      kind: 'section',
      heading: 'Problem',
      index: 0,
    })
    expect(selectionAtCaret(BODY, BODY.indexOf('hurts'))).toMatchObject({ heading: 'Problem' })
    expect(selectionAtCaret(BODY, BODY.length)).toEqual({
      kind: 'section',
      heading: 'Notes',
      index: 1,
    })
  })

  it('keeps a ## inside a fenced code block as text of its section', () => {
    expect(selectionAtCaret(BODY, BODY.indexOf('Not a heading'))).toMatchObject({
      heading: 'Problem',
      index: 0,
    })
  })

  it('names the whole heading even when the caret sits inside it', () => {
    const body = '## How it works\n\nText.'
    expect(selectionAtCaret(body, 6)).toMatchObject({ heading: 'How it works' })
  })

  it('selects a field again only on a key that types or edits, never on Esc, Tab or the arrows', () => {
    for (const key of ['a', 'Z', ' ', '1', 'Backspace', 'Delete', 'Enter']) {
      expect(selectsOnKeyUp(key)).toBe(true)
    }
    for (const key of [
      'Escape',
      'Tab',
      'ArrowUp',
      'ArrowLeft',
      'Home',
      'End',
      'PageDown',
      'Shift',
    ]) {
      expect(selectsOnKeyUp(key)).toBe(false)
    }
  })

  it('reads an empty body as the lead', () => {
    expect(selectionAtCaret('', 0)).toEqual({ kind: 'lead' })
  })

  it('compares selections by what they are about, and titles them', () => {
    expect(sameSelection({ kind: 'field', name: 'a' }, { kind: 'field', name: 'a' })).toBe(true)
    expect(sameSelection({ kind: 'field', name: 'a' }, { kind: 'field', name: 'b' })).toBe(false)
    expect(
      sameSelection(
        { kind: 'section', heading: 'A', index: 0 },
        { kind: 'section', heading: 'A', index: 1 },
      ),
    ).toBe(false)
    expect(sameSelection({ kind: 'lead' }, { kind: 'none' })).toBe(false)
    expect(selectionTitle({ kind: 'none' })).toBe('Page overview')
    expect(selectionTitle({ kind: 'field', name: 'title' })).toBe('Field · title')
    expect(selectionTitle({ kind: 'section', heading: 'Proof', index: 2 })).toBe('Section · Proof')
    expect(selectionTitle({ kind: 'lead' })).toBe('Lead')
  })
})

describe('the body against the section contract', () => {
  const designed = ['Problem', 'Approach', 'Proof']

  it('marks each designed section present or missing, and the others prose', () => {
    const parts = pageSections(BODY.replace('## Problem', '## problem'), designed)
    expect(parts.present).toBe(1)
    expect(parts.designed).toEqual([
      { name: 'Problem', found: { heading: 'problem', index: 0 } },
      { name: 'Approach', found: null },
      { name: 'Proof', found: null },
    ])
    expect(parts.prose).toEqual([{ heading: 'Notes', index: 1 }])
    expect(parts.lead).toBe('Opening words.')
  })

  it('reads every section as prose when the template designs none', () => {
    const parts = pageSections(BODY, [])
    expect(parts.present).toBe(0)
    expect(parts.prose.map((s) => s.heading)).toEqual(['Problem', 'Notes'])
    expect(isDesigned('Notes', [])).toBe(false)
    expect(isDesigned('PROOF', designed)).toBe(true)
  })

  it('adds a missing section before the next designed one present', () => {
    const body = '## Problem\n\nA.\n\n## Proof\n\nB.'
    const added = addDesignedSection(body, designed, 'Approach')
    expect(added.index).toBe(1)
    expect(added.body).toBe('## Problem\n\nA.\n\n## Approach\n\n## Proof\n\nB.')
  })

  it('adds it at the end when no later designed section is present', () => {
    const added = addDesignedSection(BODY, designed, 'Proof')
    expect(added.index).toBe(2)
    expect(added.body).toBe(`${BODY}\n\n## Proof\n`)
    expect(addDesignedSection('', designed, 'Problem')).toEqual({ body: '## Problem\n', index: 0 })
    expect(addDesignedSection('Lead.\n', designed, 'Problem').body).toBe('Lead.\n\n## Problem\n')
  })

  it('inserts only the heading: the rest of the body keeps its text and spacing', () => {
    const body = [
      'Lead with  two spaces.',
      '',
      '',
      '',
      '## Problem   ',
      'Tight under its heading.',
      '```',
      '## Proof inside a fence',
      '```',
      '## Proof',
      '',
      '',
      'Trailing lines.',
      '',
      '',
      '',
    ].join('\n')
    const added = addDesignedSection(body, designed, 'Approach')
    expect(added.index).toBe(1)
    const at = body.indexOf('## Proof\n')
    expect(added.body).toBe(`${body.slice(0, at)}## Approach\n\n${body.slice(at)}`)
    expect(added.body.replace('## Approach\n\n', '')).toBe(body)
  })

  it('finds where the heading line of a section starts, past a fenced ## that is text', () => {
    const body = '## A\n```\n## not\n```\n## B\ntext'
    const at = body.indexOf('## B')
    expect(addDesignedSection(body, ['A', 'X', 'B'], 'X').body).toBe(
      `${body.slice(0, at)}## X\n\n${body.slice(at)}`,
    )
  })

  it('finds a selected section again after the body changed around it', () => {
    expect(sectionAt(BODY, 'Notes', 1)?.index).toBe(1)
    expect(sectionAt(`## New\n\n${BODY}`, 'Notes', 1)?.index).toBe(2)
    expect(sectionAt(BODY, 'Gone', 0)).toBeNull()
  })

  it('never guesses between sections that repeat a heading', () => {
    const repeated = '## Team\n\none\n\n## Other\n\n## Team\n\ntwo'
    expect(sectionAt(repeated, 'Team', 2)?.index).toBe(2)
    expect(sectionAt(`## New\n\n${repeated}`, 'Team', 2)).toBeNull()
    expect(
      sectionAt(`## Team\n\n${repeated}`.replace('## Other', '## Else'), 'Other', 1),
    ).toBeNull()
  })

  it('counts words, names the section key and its meta description field', () => {
    expect(wordCount('Some extra notes here.')).toBe(4)
    expect(wordCount('- one\n- two\n\n> three — four')).toBe(4)
    expect(wordCount('')).toBe(0)
    expect(wordCount('The quick brown fox')).toBe(4)
    expect(wordCount('我们是一家专业的设计公司')).toBeGreaterThan(4)
    expect(wordCount('私たちは東京のデザイン会社です')).toBeGreaterThan(3)
    expect(sectionKey('how-it-works')).toBe('sections["how-it-works"]')
    expect(sectionMetaField('how-it-works')).toBe('meta-description-how-it-works')
  })
})

describe('lengths against the configured limits', () => {
  it('reads the meta description as missing, under, within or over the target', () => {
    expect(metaLengthState(0, LIMITS)).toBe('missing')
    expect(metaLengthState(119, LIMITS)).toBe('under')
    expect(metaLengthState(120, LIMITS)).toBe('within')
    expect(metaLengthState(155, LIMITS)).toBe('within')
    expect(metaLengthState(156, LIMITS)).toBe('over')
    // The limits are the site's own, never a fixed range
    expect(metaLengthState(60, { minChars: 50, maxChars: 70 })).toBe('within')
  })

  it('reads the title against its limit', () => {
    expect(titleLengthState(0, 60)).toBe('missing')
    expect(titleLengthState(60, 60)).toBe('within')
    expect(titleLengthState(61, 60)).toBe('over')
  })

  it('draws under as a warning, within as live and over as danger, on a scale that holds the limit', () => {
    expect(lengthMeter(80, 'under', 155)).toEqual({
      segments: [{ value: 80, tone: 'ahead' }],
      max: 155,
    })
    expect(lengthMeter(130, 'within', 155).segments[0]?.tone).toBe('live')
    expect(lengthMeter(200, 'over', 155)).toEqual({
      segments: [{ value: 200, tone: 'danger' }],
      max: 200,
    })
  })
})

describe('the effective meta description and its advice', () => {
  it('is meta-description, else description, else none', () => {
    expect(effectiveMetaDescription({ 'meta-description': 'Own', description: 'D' })).toEqual({
      text: 'Own',
      source: 'meta-description',
    })
    expect(effectiveMetaDescription({ 'meta-description': '  ', description: 'D' })).toEqual({
      text: 'D',
      source: 'description',
    })
    expect(effectiveMetaDescription({})).toEqual({ text: '', source: null })
    expect(metaCoverage({ description: 'D' })).toBe('fallback')
  })

  const form = new Set(['title', 'meta-description', 'description'])

  it('advises writing its own when it falls back, with Edit on meta-description', () => {
    const meta = effectiveMetaDescription({ description: 'Short' })
    expect(metaAdvice(meta, 'under', LIMITS, form)).toEqual([
      {
        text: 'Search results show the description. Write a meta description of its own.',
        field: 'meta-description',
      },
    ])
  })

  it('says so without Edit when the collection has no meta-description field', () => {
    const meta = effectiveMetaDescription({ description: 'Short' })
    const [advice] = metaAdvice(meta, 'under', LIMITS, new Set(['description']))
    expect(advice?.field).toBeNull()
    expect(advice?.text).toContain('no meta-description field')
  })

  it('advises shortening one that is too long, with Edit on the field it comes from', () => {
    const meta = effectiveMetaDescription({ 'meta-description': 'x'.repeat(170) })
    expect(metaAdvice(meta, 'over', LIMITS, form)).toEqual([
      {
        text: 'The meta description is 170 characters; search results cut it near 155.',
        field: 'meta-description',
      },
    ])
  })

  it('names a missing one, and gives no advice when it is its own and within the target', () => {
    expect(metaAdvice({ text: '', source: null }, 'missing', LIMITS, form)[0]?.field).toBe(
      'meta-description',
    )
    const own = effectiveMetaDescription({ 'meta-description': 'x'.repeat(130) })
    expect(metaAdvice(own, 'within', LIMITS, form)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { documentMark, scanMarks } from '../src/editor/live-marks.js'
import {
  elementsOf,
  markOfSection,
  numberBodySections,
  placeholderAnchors,
  placeOfSection,
  sectionIndexOf,
} from '../src/editor/live-sections.js'

const DOC = documentMark('features', 'seo')

/** A page as a site renders it in a preview, in a frame */
function page(html: string): Document {
  const frame = document.createElement('iframe')
  document.body.replaceChildren(frame)
  const doc = frame.contentDocument
  if (!doc) throw new Error('the frame has no document')
  doc.body.innerHTML = html
  return doc
}

/** A section as `markBodySections` wraps it in the body's render */
function wrapped(id: string, heading: string, text: string): string {
  return `<div id="${id}" data-krantho-document="features/seo" data-krantho-section="${heading}" style="display:contents"><h2>${heading}</h2><p>${text}</p></div>`
}

/** A section a page renders on its own (`kranthoSection`, `CMSMarkdown section=`) */
function own(id: string, heading: string, text: string): string {
  return `<div id="${id}" data-krantho-document="features/seo" data-krantho-section="${heading}"><p>${text}</p></div>`
}

function ids(elements: readonly Element[]): string[] {
  return elements.map((element) => element.id)
}

describe('which body section a mark is', () => {
  it('a heading the body has once: every mark with it is that section, wherever the page renders it', () => {
    const body = 'Lead.\n\n## Problem\n\nWhat hurts.\n\n## Notes\n\nMore.'
    const marks = numberBodySections(
      scanMarks(
        page(
          `${own('hero', 'Problem', 'What hurts.')}<article>${wrapped('problem', 'Problem', 'What hurts.')}${wrapped('notes', 'Notes', 'More.')}</article>`,
        ),
        DOC,
      ),
      body,
    )
    const [hero, problem] = marks
    if (!hero || !problem) throw new Error('marks missing')
    expect(sectionIndexOf(body, hero.target)).toBe(0)
    expect(sectionIndexOf(body, problem.target)).toBe(0)
    // Typing in the section patches every place the page shows it
    expect(ids(elementsOf(marks, hero.target, body))).toEqual(['hero', 'problem'])
    expect(ids(elementsOf(marks, problem.target, body))).toEqual(['hero', 'problem'])
  })

  it('a heading the body has twice: the body render tells them apart; a mark outside it cannot', () => {
    const body = 'Lead.\n\n## Notes\n\nFirst.\n\n## Notes\n\nSecond.'
    const marks = numberBodySections(
      scanMarks(
        page(
          `<aside>${own('side', 'Notes', 'First.')}</aside><article>${wrapped('n1', 'Notes', 'First.')}${wrapped('n2', 'Notes', 'Second.')}</article>`,
        ),
        DOC,
      ),
      body,
    )
    expect(marks.map((mark) => mark.target)).toEqual([
      { kind: 'section', heading: 'Notes', occurrence: null },
      { kind: 'section', heading: 'Notes', occurrence: 0 },
      { kind: 'section', heading: 'Notes', occurrence: 1 },
    ])
    const [side, n1, n2] = marks
    if (!side || !n1 || !n2) throw new Error('marks missing')
    expect(placeOfSection(body, 'Notes', null)).toEqual({ kind: 'ambiguous' })
    expect(sectionIndexOf(body, side.target)).toBeNull()
    expect(sectionIndexOf(body, n1.target)).toBe(0)
    expect(sectionIndexOf(body, n2.target)).toBe(1)
    expect(ids(elementsOf(marks, n1.target, body))).toEqual(['n1'])
    expect(ids(elementsOf(marks, n2.target, body))).toEqual(['n2'])
    expect(ids(elementsOf(marks, side.target, body))).toEqual(['side'])
  })

  it('finds a heading as written, then as core compares headings, and says when the body lacks it', () => {
    const body = '## Problem\n\nP\n\n## Notes ##\n\nMore.'
    expect(placeOfSection(body, 'Problem', null)).toEqual({ kind: 'index', index: 0 })
    expect(placeOfSection(body, 'notes', 0)).toEqual({ kind: 'index', index: 1 })
    expect(placeOfSection(body, 'Proof', 0)).toEqual({ kind: 'missing' })
    expect(placeOfSection('## A\n\n## A', 'A', 2)).toEqual({ kind: 'missing' })
  })
})

describe('the body render', () => {
  const body = 'Lead.\n\n## Notes\n\nFirst.\n\n## Problem\n\nP.\n\n## Notes\n\nSecond.'
  const lead = `<div id="lead" data-krantho-document="features/seo" data-krantho-section="__lead" style="display:contents"><p>Lead.</p></div>`
  const run = `${lead}${wrapped('n1', 'Notes', 'First.')}${wrapped('p', 'Problem', 'P.')}${wrapped('n2', 'Notes', 'Second.')}`
  const numbering = (html: string, text = body) =>
    numberBodySections(scanMarks(page(html), DOC), text).flatMap(({ element, target }) =>
      target.kind === 'section' ? [`${element.id}:${target.occurrence}`] : [],
    )

  it('is the run of wrappers side by side whose headings are the body’s, in order', () => {
    expect(numbering(`<article>${run}</article>`)).toEqual(['n1:0', 'p:0', 'n2:1'])
  })

  it('leaves out a site’s own display:contents section mark placed beside it, before or after', () => {
    const before = wrapped('own-before', 'Notes', 'Site.')
    const after = wrapped('own-after', 'Notes', 'Site.')
    expect(numbering(`<article>${before}${run}${after}</article>`)).toEqual([
      'own-before:null',
      'n1:0',
      'p:0',
      'n2:1',
      'own-after:null',
    ])
  })

  it('numbers nothing when the wrappers are not side by side or not in the body’s order', () => {
    const apart = `<article>${lead}${wrapped('n1', 'Notes', 'First.')}<hr>${wrapped('p', 'Problem', 'P.')}${wrapped('n2', 'Notes', 'Second.')}</article>`
    expect(numbering(apart)).toEqual(['n1:null', 'p:null', 'n2:null'])
    const reordered = `<article>${wrapped('p', 'Problem', 'P.')}${wrapped('n1', 'Notes', 'First.')}${wrapped('n2', 'Notes', 'Second.')}</article>`
    expect(numbering(reordered)).toEqual(['p:null', 'n1:null', 'n2:null'])
  })

  it('numbers nothing when a site’s own mark lets the body’s headings line up in two places', () => {
    const twice = '## Notes\n\nFirst.\n\n## Notes\n\nSecond.'
    const html = `<article>${wrapped('own', 'Notes', 'Site.')}${wrapped('n1', 'Notes', 'First.')}${wrapped('n2', 'Notes', 'Second.')}</article>`
    expect(numbering(html, twice)).toEqual(['own:null', 'n1:null', 'n2:null'])
  })

  it('numbers nothing when the page renders more repeated sections than the draft has', () => {
    const two = '## Notes\n\nTwo.\n\n## Notes\n\nThree.'
    const html = `<article>${wrapped('a', 'Notes', 'One.')}${wrapped('b', 'Notes', 'Two.')}${wrapped('c', 'Notes', 'Three.')}</article>`
    expect(numbering(html, two)).toEqual(['a:null', 'b:null', 'c:null'])
  })

  it('numbers nothing once the body no longer matches the page: a repeated heading is never guessed at', () => {
    const typed = body.replace('P.', 'P.\n\n## Notes\n\nTyped.')
    expect(numbering(`<article>${run}</article>`, typed)).toEqual(['n1:null', 'p:null', 'n2:null'])
  })
})

describe('where a missing designed section shows', () => {
  const body = '## Problem\n\nP\n\n## Proof\n\nQ'
  const marks = numberBodySections(
    scanMarks(
      page(
        `<article>${wrapped('problem', 'Problem', 'P')}${wrapped('proof', 'Proof', 'Q')}</article>`,
      ),
      DOC,
    ),
    body,
  )

  it('after the earlier designed section the page marks, else before the later one, else nowhere', () => {
    const designed = ['Intro', 'Problem', 'Approach', 'Proof', 'Outro']
    const anchors = placeholderAnchors(body, designed, marks).map((a) => ({
      name: a.name,
      at: a.mark ? `${a.side} ${a.mark.element.id}` : null,
      neighbour: a.neighbour,
    }))
    expect(anchors).toEqual([
      { name: 'Intro', at: 'before problem', neighbour: 'Problem' },
      { name: 'Approach', at: 'after problem', neighbour: 'Problem' },
      { name: 'Outro', at: 'after proof', neighbour: 'Proof' },
    ])
    expect(placeholderAnchors('Lead only.', ['Intro'], marks)).toEqual([
      { name: 'Intro', mark: null, side: 'after', neighbour: null },
    ])
  })

  it('anchors on the body render first when a section also renders on its own', () => {
    const both = numberBodySections(
      scanMarks(
        page(
          `${own('hero', 'Problem', 'P')}<article>${wrapped('problem', 'Problem', 'P')}</article>`,
        ),
        DOC,
      ),
      '## Problem\n\nP',
    )
    expect(markOfSection(both, body, 0)?.element.id).toBe('problem')
  })
})

import { describe, expect, it } from 'vitest'
import {
  type FrameState,
  inspectFrame,
  nextFrameState,
  samePath,
} from '../src/editor/live-frame-state.js'
import {
  addDesignedSection,
  type BodySplice,
  leadSplice,
  sectionSplice,
  spliceBody,
} from '../src/editor/side-panel/page-sections.js'

const BODY = 'Lead.\n\n## A\n\nAlpha.\n\n## B\n\nBeta.\n\n## C\n\nGamma.\n'
const AFTER_A = '\n\n## B\n\nBeta.\n\n## C\n\nGamma.\n'

function opened(splice: BodySplice | null): BodySplice {
  if (!splice) throw new Error('the part is not in the body')
  return splice
}

/** Type a text one character at a time from where the part opened, as the inline editor does */
function typeInto(splice: BodySplice, from: string, typed: string): string[] {
  const bodies: string[] = []
  for (let at = 1; at <= typed.length; at += 1) {
    bodies.push(spliceBody(splice, `${from}${typed.slice(0, at)}`))
  }
  return bodies
}

describe('editing a section or the lead in place', () => {
  it('opens a part with its exact surroundings: writing its text back gives the body byte for byte', () => {
    const bodies = [
      BODY,
      'Lead.\r\n\r\n## A\r\n\r\nAlpha.\r\n\r\n## B\r\n\r\nBeta.\r\n',
      'Lead.\n\n## A\n\nAlpha.',
      '## A\n## B\n',
      'Lead\n\n## A',
      '  Indented lead\n\n## A\n\n   indented\n',
    ]
    for (const body of bodies) {
      const lead = leadSplice(body)
      expect(spliceBody(lead, lead.text)).toBe(body)
      for (const index of [0, 1]) {
        const section = sectionSplice(body, index)
        if (section) expect(spliceBody(section, section.text)).toBe(body)
      }
    }
    expect(sectionSplice(BODY, 3)).toBeNull()
  })

  it('keeps every later section when a code fence is typed open, then closed', () => {
    const a = opened(sectionSplice(BODY, 0))
    expect(a.text).toBe('Alpha.')
    for (const body of typeInto(a, 'Alpha.\n\n', '```\ncode\n```')) {
      expect(body.startsWith('Lead.\n\n## A\n\nAlpha.\n\n')).toBe(true)
      expect(body.endsWith(AFTER_A)).toBe(true)
    }
  })

  it('keeps every section when a fence is typed in the lead', () => {
    const lead = leadSplice(BODY)
    expect(lead.text).toBe('Lead.')
    for (const body of typeInto(lead, 'Lead.\n', '```js')) {
      expect(body.endsWith('\n\n## A\n\nAlpha.\n\n## B\n\nBeta.\n\n## C\n\nGamma.\n')).toBe(true)
    }
    expect(spliceBody(lead, 'Lead.\n```js')).toBe(
      'Lead.\n```js\n\n## A\n\nAlpha.\n\n## B\n\nBeta.\n\n## C\n\nGamma.\n',
    )
  })

  it('writes a typed ## heading once, however it is typed', () => {
    const a = opened(sectionSplice(BODY, 0))
    const bodies = typeInto(a, 'Alpha.\n', '## New')
    for (const body of bodies) expect(body.endsWith(AFTER_A)).toBe(true)
    const last = bodies.at(-1) ?? ''
    expect(last).toBe(`Lead.\n\n## A\n\nAlpha.\n## New${AFTER_A}`)
    expect(last.match(/## New/g)).toHaveLength(1)
  })

  it('keeps a CRLF body CRLF, typed line breaks included', () => {
    const body = 'Lead.\r\n\r\n## A\r\n\r\nAlpha.\r\n\r\n## B\r\n\r\nBeta.\r\n'
    const a = opened(sectionSplice(body, 0))
    expect(a.text).toBe('Alpha.')
    const next = spliceBody(a, 'Alpha.\nMore')
    expect(next).toBe('Lead.\r\n\r\n## A\r\n\r\nAlpha.\r\nMore\r\n\r\n## B\r\n\r\nBeta.\r\n')
    expect(/[^\r]\n/.test(next)).toBe(false)
  })

  it('types the line breaks of the part as found, in a body with mixed line endings', () => {
    const body = 'Lead.\r\n\r\n## A\r\n\r\nl1\nl2\r\n\r\n## B\nBeta.\n'
    const a = opened(sectionSplice(body, 0))
    expect(a.text).toBe('l1\nl2')
    expect(spliceBody(a, 'l1\nl2\nl3')).toBe(
      'Lead.\r\n\r\n## A\r\n\r\nl1\nl2\nl3\r\n\r\n## B\nBeta.\n',
    )
    const b = opened(sectionSplice(body, 1))
    expect(spliceBody(b, 'Beta.\nMore.')).toBe(
      'Lead.\r\n\r\n## A\r\n\r\nl1\nl2\r\n\r\n## B\nBeta.\nMore.\n',
    )
    const crlfPart = opened(sectionSplice('## A\n\nx\r\ny\n\n## B\n', 0))
    expect(spliceBody(crlfPart, 'x\ny\nz')).toBe('## A\n\nx\r\ny\r\nz\n\n## B\n')
  })

  it('edits the last section of a body without a trailing newline, adding none', () => {
    const body = 'Lead.\n\n## A\n\nAlpha.\n\n## B\n\nBeta.'
    const b = opened(sectionSplice(body, 1))
    expect(spliceBody(b, 'Beta, changed.')).toBe(
      'Lead.\n\n## A\n\nAlpha.\n\n## B\n\nBeta, changed.',
    )
    expect(spliceBody(opened(sectionSplice(`${body}\n`, 1)), 'X')).toBe(
      'Lead.\n\n## A\n\nAlpha.\n\n## B\n\nX\n',
    )
  })

  it('types CRLF after a last CRLF heading with no line break after it', () => {
    const body = 'intro\r\n\r\n## A\r\n\r\nalpha\r\n\r\n## B'
    const b = opened(sectionSplice(body, 1))
    expect(b.eol).toBe('\r\n')
    expect(spliceBody(b, 'x\ny')).toBe('intro\r\n\r\n## A\r\n\r\nalpha\r\n\r\n## B\r\nx\r\ny')
    // An LF heading line in the same body keeps LF
    const mixed = opened(sectionSplice('## A\r\n\r\nalpha\r\n## B\n', 1))
    expect(spliceBody(mixed, 'x\ny')).toBe('## A\r\n\r\nalpha\r\n## B\nx\ny')
  })

  it('gives text typed into an empty section or after a last heading a line of its own', () => {
    expect(spliceBody(opened(sectionSplice('## A\n## B\n', 0)), 'x')).toBe('## A\nx\n## B\n')
    expect(spliceBody(opened(sectionSplice('Lead\n\n## A', 0)), 'x')).toBe('Lead\n\n## A\nx')
    expect(spliceBody(leadSplice('## A\n\nAlpha.'), 'New lead')).toBe('New lead\n## A\n\nAlpha.')
  })

  it('adds a missing designed section with the body’s own line breaks, keeping every other byte', () => {
    const crlf = 'Lead.\r\n\r\n## Problem\r\n\r\nP\r\n\r\n## Proof\r\n\r\nQ'
    const designed = ['Problem', 'Approach', 'Proof']
    expect(addDesignedSection(crlf, designed, 'Approach').body).toBe(
      'Lead.\r\n\r\n## Problem\r\n\r\nP\r\n\r\n## Approach\r\n\r\n## Proof\r\n\r\nQ',
    )
    expect(addDesignedSection('Lead.\r\n', ['Outro'], 'Outro').body).toBe(
      'Lead.\r\n\r\n## Outro\r\n',
    )
  })

  it('removes only the part when its text is cleared', () => {
    const a = opened(sectionSplice(BODY, 0))
    expect(spliceBody(a, '')).toBe(`Lead.\n\n## A\n\n${AFTER_A}`)
  })
})

/** A frame whose document is what a test says, as far as Live mode reads it */
function frameWith(doc: Partial<Document> | null): HTMLIFrameElement {
  return { contentDocument: doc } as unknown as HTMLIFrameElement
}

function htmlAt(url: string, contentType = 'text/html', status?: number): Partial<Document> {
  const defaultView =
    status === undefined
      ? null
      : ({
          performance: { getEntriesByType: () => [{ responseStatus: status }] },
        } as unknown as Document['defaultView'])
  return { URL: url, contentType, defaultView }
}

const SRC = '/api/preview?collection=pages&slug=pricing'

describe('what the preview frame shows', () => {
  it('is the page only at its page path, as HTML', () => {
    const page = htmlAt('http://site.test/pricing?krantho-preview=t')
    expect(inspectFrame(frameWith(page), SRC, '/pricing')).toEqual({ kind: 'page', doc: page })
    expect(inspectFrame(frameWith(htmlAt('http://site.test/pricing/')), SRC, '/pricing').kind).toBe(
      'page',
    )
    expect(inspectFrame(frameWith(htmlAt('http://site.test/about')), SRC, '/pricing')).toEqual({
      kind: 'other',
      path: '/about',
    })
  })

  it('is an error for a JSON or text answer, such as a refused preview', () => {
    const json = htmlAt('http://site.test/api/preview?x=1', 'application/json')
    expect(inspectFrame(frameWith(json), SRC, '/pricing')).toEqual({
      kind: 'error',
      path: '/api/preview',
      status: 0,
    })
    const notFound = htmlAt('http://site.test/contact', 'text/html', 404)
    expect(inspectFrame(frameWith(notFound), SRC, '/pricing')).toEqual({
      kind: 'error',
      path: '/contact',
      status: 404,
    })
    const text = htmlAt('http://site.test/pricing', 'text/plain')
    expect(inspectFrame(frameWith(text), SRC, '/pricing').kind).toBe('error')
  })

  it('is unreadable for another origin, and waits on the empty document before navigation', () => {
    expect(inspectFrame(frameWith(null), SRC, '/pricing').kind).toBe('unreadable')
    const refusing = {
      get contentDocument(): Document {
        throw new DOMException('Blocked a frame', 'SecurityError')
      },
    } as unknown as HTMLIFrameElement
    expect(inspectFrame(refusing, SRC, '/pricing').kind).toBe('unreadable')
    expect(inspectFrame(frameWith(htmlAt('about:blank')), SRC, '/pricing').kind).toBe('blank')
  })

  it('compares paths as the site serves them', () => {
    expect(samePath('/a%20b/', '/a b')).toBe(true)
    expect(samePath('/', '/')).toBe(true)
    expect(samePath('/a', '/b')).toBe(false)
  })

  it('fails before the page was shown, and moves or leaves after', () => {
    const doc = {} as Document
    const loading: FrameState = { kind: 'loading' }
    const ready: FrameState = { kind: 'ready', doc }
    expect(nextFrameState(loading, { kind: 'blank' })).toBe(loading)
    expect(nextFrameState(loading, { kind: 'page', doc })).toEqual(ready)
    expect(nextFrameState(loading, { kind: 'error', path: '/contact', status: 404 })).toEqual({
      kind: 'failed',
      why: 'error',
      path: '/contact',
      status: 404,
    })
    expect(nextFrameState(loading, { kind: 'other', path: '/' })).toEqual({
      kind: 'failed',
      why: 'error',
      path: '/',
      status: 0,
    })
    expect(nextFrameState(loading, { kind: 'unreadable' })).toEqual({
      kind: 'failed',
      why: 'unreadable',
    })
    expect(nextFrameState(loading, { kind: 'timeout' })).toEqual({ kind: 'failed', why: 'timeout' })
    expect(nextFrameState(ready, { kind: 'timeout' })).toBe(ready)
    expect(nextFrameState(ready, { kind: 'page', doc })).toBe(ready)
    expect(nextFrameState(ready, { kind: 'other', path: '/about' })).toEqual({
      kind: 'moved',
      path: '/about',
    })
    expect(nextFrameState(ready, { kind: 'unreadable' })).toEqual({ kind: 'failed', why: 'left' })
    expect(nextFrameState({ kind: 'moved', path: '/about' }, { kind: 'page', doc })).toEqual(ready)
  })
})

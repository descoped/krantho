import { describe, expect, it } from 'vitest'
import {
  type Box,
  documentMark,
  foundOf,
  inPlaceKind,
  markBox,
  markElementAt,
  markTag,
  patchSection,
  patchText,
  scanMarks,
} from '../src/editor/live-marks.js'
import { elementsOf } from '../src/editor/live-sections.js'
import type { CollectionSchema } from '../src/lib/api-types.js'

const DOC = documentMark('features', 'seo')

/** A page as a site renders it in a preview, in a frame: the document's marks, and another document's */
function page(html: string): Document {
  const frame = document.createElement('iframe')
  document.body.replaceChildren(frame)
  const doc = frame.contentDocument
  if (!doc) throw new Error('the frame has no document')
  doc.body.innerHTML = html
  return doc
}

const PAGE = `
  <h1 id="title" data-krantho-document="features/seo" data-krantho-field="title"><a href="/x">Structured <b>SEO</b></a></h1>
  <p id="benefit" data-krantho-document="features/seo" data-krantho-field="benefit">Fast</p>
  <div id="lead" data-krantho-document="features/seo" data-krantho-section="__lead" style="display:contents"><p>Lead</p></div>
  <div id="approach" data-krantho-document="features/seo" data-krantho-section="Approach" style="display:contents">
    <h2 id="approach-h">Approach</h2>
    <p id="approach-p">Words</p>
    <article id="card" data-krantho-document="features/other" data-krantho-field="title"><span id="inner">Other</span></article>
  </div>
  <h2 id="other-title" data-krantho-document="features/other" data-krantho-field="title">Other title</h2>
  <p id="seo-plus" data-krantho-document="features/seo-plus" data-krantho-field="title">Not ours</p>
`

function byId(doc: Document, id: string): Element {
  const element = doc.getElementById(id)
  if (!element) throw new Error(`no #${id}`)
  return element
}

/** Give an element a box, as a browser's layout would */
function place(element: Element, box: Box): void {
  element.getBoundingClientRect = () =>
    ({
      ...box,
      x: box.left,
      y: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
      toJSON: () => box,
    }) as DOMRect
}

describe('scanning a page for the document marks', () => {
  it('finds the edited document marks in page order, unnumbered, and leaves out every other document', () => {
    const marks = scanMarks(page(PAGE), DOC)
    expect(marks.map((mark) => mark.element.id)).toEqual(['title', 'benefit', 'lead', 'approach'])
    expect(marks.map((mark) => mark.target)).toEqual([
      { kind: 'field', name: 'title' },
      { kind: 'field', name: 'benefit' },
      { kind: 'lead' },
      { kind: 'section', heading: 'Approach', occurrence: null },
    ])
  })

  it('says what the scan found: the fields, and the sections with the lead as __lead', () => {
    const found = foundOf(scanMarks(page(PAGE), DOC))
    expect([...found.fields]).toEqual(['title', 'benefit'])
    expect([...found.sections]).toEqual(['__lead', 'Approach'])
  })

  it('finds the nearest mark of the document around an event target, passing other documents', () => {
    const doc = page(PAGE)
    expect(markElementAt(byId(doc, 'title').querySelector('b'), DOC)?.id).toBe('title')
    expect(markElementAt(byId(doc, 'inner'), DOC)?.id).toBe('approach')
    expect(markElementAt(byId(doc, 'approach-p').firstChild, DOC)?.id).toBe('approach')
    expect(markElementAt(byId(doc, 'other-title'), DOC)).toBeNull()
    expect(markElementAt(byId(doc, 'seo-plus'), DOC)).toBeNull()
    expect(markElementAt(null, DOC)).toBeNull()
  })

  it('gathers every element that renders the same field', () => {
    const doc = page(
      `${PAGE}<span id="crumb" data-krantho-document="features/seo" data-krantho-field="title">x</span>`,
    )
    const marks = scanMarks(doc, DOC)
    expect(elementsOf(marks, { kind: 'field', name: 'title' }, '').map((e) => e.id)).toEqual([
      'title',
      'crumb',
    ])
  })
})

describe('the box of a marked element', () => {
  it('is the element box', () => {
    const doc = page(PAGE)
    place(byId(doc, 'title'), { top: 10, left: 20, width: 300, height: 40 })
    expect(markBox(byId(doc, 'title'))).toEqual({ top: 10, left: 20, width: 300, height: 40 })
  })

  it('is the union of the children boxes for a display: contents wrapper, ignoring empty ones', () => {
    const doc = page(PAGE)
    place(byId(doc, 'approach-h'), { top: 100, left: 40, width: 200, height: 30 })
    place(byId(doc, 'approach-p'), { top: 140, left: 20, width: 400, height: 60 })
    place(byId(doc, 'card'), { top: 0, left: 0, width: 0, height: 0 })
    expect(markBox(byId(doc, 'approach'))).toEqual({ top: 100, left: 20, width: 400, height: 100 })
  })

  it('reads nested display: contents wrappers recursively, and is null when nothing has a box', () => {
    const doc = page(
      '<div id="outer" style="display:contents"><div style="display:contents"><p id="a">A</p></div><p id="b">B</p></div><div id="empty" style="display:contents"><p>x</p></div>',
    )
    place(byId(doc, 'a'), { top: 5, left: 5, width: 10, height: 10 })
    place(byId(doc, 'b'), { top: 50, left: 0, width: 10, height: 10 })
    expect(markBox(byId(doc, 'outer'))).toEqual({ top: 5, left: 0, width: 15, height: 55 })
    expect(markBox(byId(doc, 'empty'))).toBeNull()
  })
})

describe('the tag of a mark', () => {
  const designed = ['Problem', 'Approach']
  it('names a field, a designed or prose section, and the lead', () => {
    expect(markTag({ kind: 'field', name: 'title' }, designed)).toBe('field · title')
    expect(markTag({ kind: 'section', heading: 'approach', occurrence: 0 }, designed)).toBe(
      'section · approach · designed',
    )
    expect(markTag({ kind: 'section', heading: 'Notes', occurrence: 0 }, designed)).toBe(
      'section · Notes · prose',
    )
    expect(markTag({ kind: 'lead' }, designed)).toBe('section · lead')
  })
})

describe('patching the page as the person types', () => {
  it('sets a field text on every element that renders it, as text', () => {
    const doc = page(PAGE)
    const title = byId(doc, 'title')
    patchText([title], 'New <b>title</b>')
    expect(title.textContent).toBe('New <b>title</b>')
    expect(title.querySelector('b')).toBeNull()
  })

  it('renders a section markdown into its element, with its heading when the element renders it', () => {
    const doc = page(PAGE)
    const approach = byId(doc, 'approach')
    patchSection(approach, 'Some **bold** words', 'Approach')
    expect(approach.querySelector('h2')?.textContent).toBe('Approach')
    expect(approach.querySelector('strong')?.textContent).toBe('bold')
    const lead = byId(doc, 'lead')
    patchSection(lead, 'Lead *now*', null)
    expect(lead.querySelector('h2')).toBeNull()
    expect(lead.querySelector('em')?.textContent).toBe('now')
  })

  it('sanitizes what it renders: no script and no event handler reaches the page', () => {
    const doc = page(PAGE)
    const approach = byId(doc, 'approach')
    patchSection(approach, '<img src="x" onerror="alert(1)"><script>alert(2)</script>', 'Approach')
    expect(approach.querySelector('script')).toBeNull()
    expect(approach.querySelector('img')?.getAttribute('onerror')).toBeNull()
  })
})

const SCHEMA: CollectionSchema = {
  contract: {
    id: 'test/content',
    revision: 'test',
    label: 'Content',
    fields: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        hero: { type: 'string', description: 'media' },
        status: { type: 'string', enum: ['draft', 'published'] },
      },
    },
    metadata: {},
    body: 'optional',
    sections: [],
  },

  name: 'pages',
  source: 'database',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      hero: { type: 'string', description: 'media' },
      status: { type: 'string', enum: ['draft', 'published'] },
    },
  },
}

describe('what can be edited in place', () => {
  it('a text field types in place; media and other fields change after Save', () => {
    const draft = {
      metadata: {},
      fields: { custom: 'text', count: 3 },
      body: '',
    }
    expect(inPlaceKind('title', SCHEMA, draft)).toBe('text')
    expect(inPlaceKind('hero', SCHEMA, draft)).toBe('media')
    expect(inPlaceKind('status', SCHEMA, draft)).toBe('other')
    expect(inPlaceKind('custom', SCHEMA, draft)).toBe('text')
    expect(inPlaceKind('count', SCHEMA, draft)).toBe('other')
  })
})

import { describe, expect, it } from 'vitest'
import {
  kranthoField,
  kranthoSection,
  LEAD_SECTION,
  markAttributes,
  markBodySections,
  renderContent,
} from '../src/index.js'

const preview = { collection: 'features', slug: 'seo', preview: true }
const visitor = { collection: 'features', slug: 'seo', preview: false }

describe('kranthoField and kranthoSection', () => {
  it('mark the document and the field or section in a preview', () => {
    expect(kranthoField(preview, 'title')).toEqual({
      'data-krantho-document': 'features/seo',
      'data-krantho-field': 'title',
    })
    expect(kranthoSection(preview, 'How it works')).toEqual({
      'data-krantho-document': 'features/seo',
      'data-krantho-section': 'How it works',
    })
  })

  it('give nothing outside a preview, or without a document', () => {
    expect(kranthoField(visitor, 'title')).toEqual({})
    expect(kranthoField({ collection: 'pages', slug: 'home' }, 'title')).toEqual({})
    expect(kranthoSection(undefined, 'Approach')).toEqual({})
    expect(kranthoField(null, 'title')).toEqual({})
  })
})

describe('markAttributes', () => {
  it('renders the marks as escaped attributes, or nothing', () => {
    expect(markAttributes(kranthoSection(preview, 'Q&A "now"'))).toBe(
      ' data-krantho-document="features/seo" data-krantho-section="Q&amp;A &quot;now&quot;"',
    )
    expect(markAttributes(kranthoField(visitor, 'title'))).toBe('')
  })
})

describe('markBodySections', () => {
  const body =
    'Lead text.\n\n## Problem\n\nIt hurts.\n\n```md\n## not a heading\n```\n\n## Approach\n\nFix it.'

  it('wraps the lead and each section without changing the layout', async () => {
    const { html } = await renderContent({}, body, { atNotation: false })
    const marked = markBodySections(html, body, preview)

    expect(marked).toContain(
      `<div data-krantho-document="features/seo" data-krantho-section="${LEAD_SECTION}" style="display:contents"><p>Lead text.</p>`,
    )
    expect(marked).toContain('data-krantho-section="Problem" style="display:contents"><h2')
    expect(marked).toContain('data-krantho-section="Approach" style="display:contents"><h2')
    expect(marked.replace(/<div[^>]*style="display:contents">|<\/div>/g, '')).toBe(html)
  })

  it('leaves the HTML as it is outside a preview, or when headings do not pair up', async () => {
    const { html } = await renderContent({}, body, { atNotation: false })
    expect(markBodySections(html, body, visitor)).toBe(html)
    expect(markBodySections(`${html}<h2>Raw</h2>`, body, preview)).toBe(`${html}<h2>Raw</h2>`)
  })

  it('omits an empty lead', () => {
    const marked = markBodySections('<h2>Only</h2><p>x</p>', '## Only\n\nx', preview)
    expect(marked).not.toContain(LEAD_SECTION)
    expect(marked).toContain('data-krantho-section="Only"')
  })
})

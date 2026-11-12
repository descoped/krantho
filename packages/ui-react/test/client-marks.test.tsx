import type { ContentData } from '@krantho/core'
import type React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CMSMarkdown } from '../src/components/client/CMSMarkdown.js'
import { CMSText } from '../src/components/client/CMSText.js'
import { CMSContentProvider } from '../src/hooks/content-context.js'
import { CMSProvider } from '../src/provider.js'

function preloaded(preview: boolean | undefined): ContentData {
  return {
    fields: { title: 'About' },
    content: 'Lead.\n\n## Team\n\nPeople.',
    html: '<p>Lead.</p>\n<h2>Team</h2>\n<p>People.</p>\n',
    sections: { Team: '<p>People.</p>\n' },
    loading: false,
    error: null,
    ...(preview === undefined ? {} : { document: { collection: 'pages', slug: 'about', preview } }),
  }
}

function render(content: ContentData, element: React.ReactElement): string {
  return renderToString(
    <CMSProvider>
      <CMSContentProvider data={{ about: content }}>{element}</CMSContentProvider>
    </CMSProvider>,
  )
}

describe('client components and Live marks', () => {
  it('mark the field and sections of preloaded preview content', () => {
    const content = preloaded(true)
    expect(render(content, <CMSText slug="about" field="title" />)).toContain(
      'data-krantho-document="pages/about" data-krantho-field="title"',
    )
    expect(render(content, <CMSMarkdown slug="about" section="Team" />)).toContain(
      'data-krantho-section="Team"',
    )
    const body = render(content, <CMSMarkdown slug="about" />)
    expect(body).toContain('data-krantho-section="__lead"')
    expect(body).toContain('data-krantho-section="Team"')
  })

  it('render no marks for visitors, or for content without a document', () => {
    for (const content of [preloaded(false), preloaded(undefined)]) {
      expect(render(content, <CMSText slug="about" field="title" />)).not.toContain('data-krantho')
      expect(render(content, <CMSMarkdown slug="about" />)).not.toContain('data-krantho')
    }
  })
})

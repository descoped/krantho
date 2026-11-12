import type { ContentContract } from '@krantho/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { MetadataEditor } from '../src/editor/metadata-editor.js'
import type { PanelDocument } from '../src/editor/side-panel/panel-document.js'
import { SearchAndSharing } from '../src/editor/side-panel/search-and-sharing.js'
import { CapabilitiesContext } from '../src/lib/capabilities.js'

const contract: ContentContract = {
  id: 'test/page',
  revision: 'one',
  label: 'Page',
  fields: {},
  body: 'optional',
  sections: [],
  metadata: {
    sharing: {
      id: 'krantho/sharing',
      revision: 'one',
      label: 'Search and sharing',
      required: false,
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          image: { type: 'string', description: 'media' },
        },
      },
    },
  },
}

const LIMITS = { metaDescription: { minChars: 10, maxChars: 20 }, title: { maxChars: 30 } }

function Panel({ seo }: { seo: boolean }) {
  const [metadata, setMetadata] = useState<Record<string, Record<string, unknown>>>({})
  const fields = { title: 'About us', description: 'We build things' }
  const doc = {
    collection: 'pages',
    info: { pages: true },
    schema: { contract, schema: { properties: { title: {}, description: {} } } },
    draft: { metadata, fields, body: '' },
    meta: null,
    limits: LIMITS,
    readOnly: false,
    defaults: [],
    fieldErrors: {},
    onMetadata: setMetadata,
  } as unknown as PanelDocument
  return (
    <CapabilitiesContext.Provider
      value={{
        persistence: 'sqlite',
        framework: null,
        authMode: 'none',
        schemaVersion: null,
        features: seo ? { seo: 'enabled' } : {},
      }}
    >
      <SearchAndSharing
        doc={doc}
        onEditField={() => {}}
        renderFields={(checks) => (
          <MetadataEditor
            scope="sharing"
            checks={checks}
            contract={contract}
            metadata={metadata}
            fields={fields}
            readOnly={false}
            errors={{}}
            onMetadata={setMetadata}
          />
        )}
      />
    </CapabilitiesContext.Provider>
  )
}

describe('Search and sharing, with the search fields in the panel', () => {
  it('is a block of its own, open, with the length of each text right under its field', async () => {
    render(<Panel seo />)
    const block = screen.getByRole('region', { name: 'Search and sharing' })
    expect(block.querySelector('details.metadata-group')).toBeNull()
    expect(within(block).getByText('Search title', { exact: false })).toBeVisible()
    const lengths = block.querySelectorAll('.side-length')
    expect(lengths).toHaveLength(2)
    expect(lengths[0]).toHaveTextContent('8 chars · limit 30')
    expect(lengths[1]).toHaveTextContent('15 chars · target 10–20')
    expect(lengths[1]).toHaveTextContent('Falls back to description')
  })

  it('measures the text written in the field as it is written', async () => {
    const user = userEvent.setup()
    render(<Panel seo />)
    const block = screen.getByRole('region', { name: 'Search and sharing' })
    await user.click(
      within(block).getByRole('button', { name: 'Write a different search description' }),
    )
    const field = within(block).getByRole('textbox', { name: /Search description/ })
    await user.clear(field)
    await user.type(field, 'x'.repeat(25))
    const length = block.querySelectorAll('.side-length')[1]
    expect(length).toHaveAttribute('data-length-state', 'over')
    expect(length).toHaveTextContent('Your own search description')
  })

  it('shows the fields without checks, and without a warning, when SEO is off', () => {
    render(<Panel seo={false} />)
    const block = screen.getByRole('region', { name: 'Search and sharing' })
    expect(block.querySelector('.side-length')).toBeNull()
    expect(block).not.toHaveTextContent('SEO is off')
  })
})

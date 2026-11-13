import type { ContentContract } from '@krantho/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { MetadataEditor } from '../src/editor/metadata-editor.js'

const contract: ContentContract = {
  id: 'test/article',
  revision: 'one',
  label: 'Article',
  fields: {},
  body: 'optional',
  sections: [],
  metadata: {
    editorial: {
      id: 'test/editorial',
      revision: 'one',
      label: 'Editorial',
      required: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['byline'],
        properties: {
          byline: { type: 'string' },
          published: { type: 'boolean' },
          rating: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        },
      },
    },
  },
}

function Editor() {
  const [metadata, setMetadata] = useState<Record<string, Record<string, unknown>>>({
    editorial: { byline: 'Original', published: false, rating: null },
    obsolete: { old: 'Keep me' },
  })
  return (
    <>
      <MetadataEditor
        contract={contract}
        defaults={[
          {
            collection: 'globals',
            slug: 'editorial',
            locale: 'en',
            version: 2,
            paths: ['/metadata/editorial/byline'],
            values: { '/metadata/editorial/byline': 'Original' },
          },
        ]}
        metadata={metadata}
        readOnly={false}
        errors={{ 'metadata.editorial.byline': 'Byline is required' }}
        onMetadata={setMetadata}
      />
      <output aria-label="Draft details">{JSON.stringify(metadata)}</output>
    </>
  )
}

describe('document metadata editing', () => {
  it('edits typed values, preserves obsolete groups until explicit removal and shows field errors', async () => {
    const user = userEvent.setup()
    render(<Editor />)
    expect(screen.getByText('Copied from globals/editorial · v2')).toBeVisible()
    const byline = screen.getByRole('textbox', { name: /Byline/ })
    await user.clear(byline)
    await user.type(byline, 'New author')
    expect(screen.queryByText('Copied from globals/editorial · v2')).toBeNull()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Published' }), 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Byline is required')
    expect(screen.getByLabelText('Draft details')).toHaveTextContent('"byline":"New author"')
    expect(screen.getByLabelText('Draft details')).toHaveTextContent('"published":true')
    expect(screen.getByLabelText('Draft details')).toHaveTextContent('Keep me')
    await user.click(screen.getByText('Obsolete', { selector: 'summary' }))
    await user.click(screen.getByRole('button', { name: 'Remove these details' }))
    expect(screen.getByLabelText('Draft details')).not.toHaveTextContent('obsolete')
  })

  it('keeps null explicit and exposes a typed number when a value is chosen', async () => {
    const user = userEvent.setup()
    render(<Editor />)
    expect(screen.getByLabelText('Draft details')).toHaveTextContent('"rating":null')
    await user.click(screen.getByRole('button', { name: 'Set rating' }))
    expect(screen.getByRole('spinbutton', { name: 'Rating' })).toHaveValue(0)
    await user.click(screen.getByRole('button', { name: 'Use no value' }))
    expect(screen.getByLabelText('Draft details')).toHaveTextContent('"rating":null')
  })
})

describe('an optional group not in use', () => {
  const optional: ContentContract = {
    ...contract,
    metadata: {
      editorial: {
        ...(contract.metadata.editorial as ContentContract['metadata'][string]),
        required: false,
      },
    },
  }

  it('is one row with an Add action, not a closed disclosure', async () => {
    const user = userEvent.setup()
    const seen: Array<Record<string, Record<string, unknown>>> = []
    render(
      <MetadataEditor
        contract={optional}
        metadata={{}}
        readOnly={false}
        errors={{}}
        onMetadata={(next) => seen.push(next)}
      />,
    )
    expect(screen.queryByText('Editorial', { selector: 'summary' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(seen).toEqual([{ editorial: {} }])
  })

  it('offers no Add action when the page is read-only', () => {
    render(
      <MetadataEditor
        contract={optional}
        metadata={{}}
        readOnly
        errors={{}}
        onMetadata={() => {}}
      />,
    )
    expect(screen.getByText('Editorial')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
  })
})

describe('the metadata block', () => {
  const meta = {
    collection: 'pages',
    slug: 'about',
    locale: 'en',
    version: 3,
    liveVersion: 3,
    status: 'published',
    source: 'admin',
    changedBy: null,
    createdAt: new Date().toISOString(),
  } as const

  it('is named Metadata, shows each declared group open with the name the page reads it by', () => {
    render(
      <MetadataEditor
        contract={contract}
        metadata={{ editorial: { byline: 'Ove' } }}
        readOnly={false}
        errors={{}}
        onMetadata={() => {}}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Metadata' })).toBeVisible()
    const group = screen.getByRole('region', { name: 'Editorial' })
    expect(group).toHaveTextContent('editorial')
    expect(screen.getByRole('textbox', { name: /Byline/ })).toBeVisible()
  })

  it('shows what krantho keeps as read-only text, never as an input', () => {
    render(
      <MetadataEditor
        contract={contract}
        metadata={{ editorial: { byline: 'Ove' } }}
        system={meta}
        readOnly={false}
        errors={{}}
        onMetadata={() => {}}
      />,
    )
    const line = screen.getByText(/v3/)
    expect(line).toHaveTextContent('Live · v3 · EN · saved just now')
    expect(line.querySelector('input, select, textarea')).toBeNull()
  })
})

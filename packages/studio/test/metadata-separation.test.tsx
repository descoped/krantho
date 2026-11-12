import type { ContentContract } from '@krantho/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { MetadataEditor } from '../src/editor/metadata-editor.js'
import { SharingFields } from '../src/editor/sharing-fields.js'

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
          canonicalUrl: { type: 'string', format: 'uri' },
          index: { type: 'boolean' },
          follow: { type: 'boolean' },
        },
      },
    },
    seo: {
      id: 'test/seo',
      revision: 'one',
      label: 'Structured data',
      required: false,
      schema: {
        type: 'object',
        properties: { entities: { type: 'array' }, fieldMappings: { type: 'object' } },
      },
    },
  },
}
const fields = { title: 'Visible page title', description: 'Visible page description' }
function Editor({ openGraph }: { openGraph: () => void }) {
  const [metadata, setMetadata] = useState<Record<string, Record<string, unknown>>>({})
  return (
    <>
      <MetadataEditor
        contract={contract}
        fields={fields}
        metadata={metadata}
        readOnly={false}
        errors={{}}
        onMetadata={setMetadata}
        onOpenData={openGraph}
      />
      <output aria-label="Metadata draft">{JSON.stringify(metadata)}</output>
    </>
  )
}

it('uses the page title for search until an explicit search override is chosen', async () => {
  const user = userEvent.setup()
  render(<Editor openGraph={vi.fn()} />)
  await user.click(screen.getByText('Search and sharing', { selector: 'summary' }))
  // The page's own title is not repeated: one line says where search takes it from
  expect(screen.getByText('uses the page title')).toBeVisible()
  expect(screen.queryByText(fields.title)).toBeNull()
  expect(screen.queryByRole('textbox', { name: 'Search title' })).toBeNull()
  expect(screen.getByLabelText('Metadata draft')).toHaveTextContent('{}')
  await user.click(screen.getByRole('button', { name: 'Write a different search title' }))
  const override = screen.getByRole('textbox', { name: 'Search title' })
  expect(override).toHaveValue(fields.title)
  await user.clear(override)
  await user.type(override, 'Search only')
  expect(fields.title).toBe('Visible page title')
  expect(screen.getByLabelText('Metadata draft')).toHaveTextContent('"title":"Search only"')
  await user.click(screen.getByRole('button', { name: /^Reset search title/ }))
  expect(screen.queryByRole('textbox', { name: 'Search title' })).toBeNull()
  expect(screen.getByText('uses the page title')).toBeVisible()
})

it('distinguishes an unset indexing policy from false and uses the graph editor instead of raw schema controls', async () => {
  const user = userEvent.setup()
  const openGraph = vi.fn()
  render(<Editor openGraph={openGraph} />)
  expect(screen.queryByText('Field Mappings')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Add item' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Open graph editor' }))
  expect(openGraph).toHaveBeenCalledOnce()
  await user.click(screen.getByText('Search and sharing', { selector: 'summary' }))
  await user.click(screen.getByText('Advanced search settings', { selector: 'summary' }))
  const index = screen.getByRole('combobox', { name: 'Show in search results' })
  expect(index).toHaveValue('')
  await user.selectOptions(index, 'false')
  expect(screen.getByLabelText('Metadata draft')).toHaveTextContent('"index":false')
  await user.selectOptions(index, '')
  expect(screen.getByLabelText('Metadata draft')).not.toHaveTextContent('"index"')
})

it('starts an empty search override when the page has no title to start from', async () => {
  const user = userEvent.setup()
  const written: Array<Record<string, unknown>> = []
  render(
    <SharingFields
      fields={{}}
      values={{}}
      schema={{ type: 'object', properties: { title: { type: 'string' } } }}
      path="metadata.sharing"
      errors={{}}
      sources={{}}
      readOnly={false}
      onValues={(values) => written.push(values)}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Write a different search title' }))
  expect(written).toEqual([{ title: '' }])
})

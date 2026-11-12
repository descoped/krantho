import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installSetupApi } from './fixtures/setup-api.js'
import { headers, renderAt } from './fixtures/site-api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

async function fieldsOfPages(): Promise<HTMLElement> {
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Fields of Pages' }))
  return screen.findByRole('table', { name: 'Fields of Pages' })
}

describe('Setup › Collections & schema', () => {
  it('lists each collection with where it renders, its types and its rich results', async () => {
    installSetupApi()
    renderAt('/setup/collections')
    const table = await screen.findByRole('table', { name: 'Collections' })
    expect(headers(table)).toEqual([
      'Collection',
      'Renders at',
      'Schema.org types',
      'Rich results',
      'Fields',
    ])
    const pages = within(table)
      .getByRole('rowheader', { name: /Pages/ })
      .closest('tr') as HTMLElement
    expect(pages).toHaveTextContent('/:slug')
    expect(pages).toHaveTextContent('Article')
    expect(pages).toHaveTextContent('Breadcrumb')
    const globals = within(table)
      .getByRole('rowheader', { name: /Globals/ })
      .closest('tr') as HTMLElement
    expect(globals).toHaveTextContent('No pages')
  })

  it('says where its values come from', async () => {
    installSetupApi()
    renderAt('/setup/collections')
    const region = await screen.findByRole('region', { name: 'Collections & schema' })
    expect(region).toHaveTextContent('Configuration')
    expect(region).toHaveTextContent('krantho.collections.ts')
    expect(within(region).getByRole('link', { name: /Scopes & archetypes/ })).toBeInTheDocument()
  })

  it('locks the code fields with the hint, and marks the runtime ones', async () => {
    installSetupApi()
    renderAt('/setup/collections')
    const fields = await fieldsOfPages()
    expect(headers(fields)).toEqual(['Field', 'Type', 'Required', 'Default', 'Source', 'Edit'])
    const status = within(fields)
      .getByRole('rowheader', { name: /^status/ })
      .closest('tr') as HTMLElement
    expect(within(status).getByText('draft', { selector: 'code' })).toBeInTheDocument()
    const title = within(fields)
      .getByRole('rowheader', { name: /^title/ })
      .closest('tr') as HTMLElement
    expect(title).toHaveTextContent(
      'Defined in code, change it in krantho.collections.ts; code always wins',
    )
    expect(within(title).queryByRole('button')).toBeNull()
    const subtitle = within(fields)
      .getByRole('rowheader', { name: /subtitle/ })
      .closest('tr') as HTMLElement
    expect(subtitle).toHaveTextContent('Runtime')
    expect(within(subtitle).getByRole('button', { name: 'Edit subtitle' })).toBeInTheDocument()
  })

  it('adds a runtime field', async () => {
    const state = installSetupApi()
    renderAt('/setup/collections')
    await fieldsOfPages()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Add runtime field' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add a runtime field to Pages' })
    await user.type(within(dialog).getByLabelText('Name'), 'teaser')
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'textarea')
    await user.click(within(dialog).getByRole('button', { name: 'Save field' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(state.sent.find((s) => s.key === 'PUT /api/schema/pages/fields')?.body).toEqual({
      name: 'teaser',
      type: 'textarea',
      required: false,
    })
    const fields = await screen.findByRole('table', { name: 'Fields of Pages' })
    expect(await within(fields).findByRole('rowheader', { name: /teaser/ })).toBeInTheDocument()
  })

  it('refuses a field without a name, in the dialog', async () => {
    const state = installSetupApi()
    renderAt('/setup/collections')
    await fieldsOfPages()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Add runtime field' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Save field' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('A field needs a name.')
    expect(state.sent).toEqual([])
  })

  it.each([
    ['string', 'pattern', '(', 'The pattern is not a valid regular expression.'],
    ['enum', 'values', '', 'Give the enum two different values or more.'],
    ['enum', 'values', 'only', 'Give the enum two different values or more.'],
    ['enum', 'values', 'a, a', 'Give the enum two different values or more.'],
    ['number', 'default', 'abc', 'The default is a number.'],
    ['boolean', 'default', 'maybe', 'The default is true or false.'],
    ['enum', 'default', 'x', 'The default is one of the values.'],
    ['number', 'range', '', 'The minimum is not above the maximum.'],
  ])('refuses a %s field with a bad %s', async (type, what, value, message) => {
    const state = installSetupApi()
    renderAt('/setup/collections')
    await fieldsOfPages()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Add runtime field' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'extra')
    await user.selectOptions(within(dialog).getByLabelText('Type'), type)
    if (what === 'pattern') await user.type(within(dialog).getByLabelText('Pattern'), value)
    if (what === 'values' && value) await user.type(within(dialog).getByLabelText('Values'), value)
    if (what === 'default') {
      await user.type(within(dialog).getByLabelText('Default'), value)
      if (type === 'enum') await user.type(within(dialog).getByLabelText('Values'), 'a, b')
    }
    if (what === 'range') {
      await user.type(within(dialog).getByLabelText('Minimum'), '5')
      await user.type(within(dialog).getByLabelText('Maximum'), '2')
    }
    await user.click(within(dialog).getByRole('button', { name: 'Save field' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent(message)
    expect(state.sent).toEqual([])
  })

  it('edits a runtime field, keeping its name', async () => {
    const state = installSetupApi()
    renderAt('/setup/collections')
    await fieldsOfPages()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Edit subtitle' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit subtitle' })
    expect(within(dialog).getByLabelText('Name')).toBeDisabled()
    const type = within(dialog).getByLabelText('Type')
    expect(type).toBeDisabled()
    expect(type).toHaveAccessibleDescription('A field keeps its type')
    await user.click(within(dialog).getByLabelText('Required'))
    await user.click(within(dialog).getByRole('button', { name: 'Save field' }))
    await waitFor(() =>
      expect(state.sent.at(-1)?.body).toMatchObject({ name: 'subtitle', required: true }),
    )
  })

  it('deletes a runtime field after a confirmation', async () => {
    const state = installSetupApi()
    renderAt('/setup/collections')
    const fields = await fieldsOfPages()
    const user = userEvent.setup()
    await user.click(within(fields).getByRole('button', { name: 'Delete subtitle' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete the field subtitle?' })
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Delete field' }))
    expect(dialog).toHaveTextContent('Documents keep the values they already hold')
    await waitFor(() => expect(state.runtimeFields).toEqual([]))
    await waitFor(() =>
      expect(within(fields).queryByRole('rowheader', { name: /subtitle/ })).toBeNull(),
    )
  })

  it('says when the collection in the address is unknown', async () => {
    installSetupApi()
    renderAt('/setup/collections?collection=nope')
    expect(await screen.findByText('No collection is named nope.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Fields of Nope' })).toBeNull()
  })

  it('exports the schema as Zod', async () => {
    installSetupApi()
    renderAt('/setup/collections')
    await fieldsOfPages()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Export as Zod' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pages as Zod' })
    expect(await within(dialog).findByText(/export const pagesSchema/)).toBeInTheDocument()
  })

  it('is not registered for an editor when people sign in', async () => {
    installSetupApi({ role: 'editor', authMode: 'token' })
    renderAt('/setup/collections')
    // Collections & schema is an admin's tab when people sign in: not registered for an editor
    expect(await screen.findByRole('heading', { name: 'Nothing here' })).toBeInTheDocument()
  })
})

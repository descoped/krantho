import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialState, installSetupApi } from './fixtures/setup-api.js'
import { headers, renderAt } from './fixtures/site-api.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Setup › Integrations', () => {
  it('lists deliveries with their state, filtered by state', async () => {
    installSetupApi()
    renderAt('/setup/integrations')
    const table = await screen.findByRole('table', { name: 'Webhook deliveries' })
    expect(headers(table)).toEqual([
      'Event',
      'URL',
      'State',
      'HTTP',
      'Attempts',
      'Created',
      'Delivered',
      'Retry',
    ])
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Failed' }))
    expect(screen.getByRole('button', { name: 'Failed' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() =>
      expect(
        within(screen.getByRole('table', { name: 'Webhook deliveries' })).getAllByRole('row'),
      ).toHaveLength(2),
    )
    await user.click(screen.getByRole('button', { name: 'Pending' }))
    expect(
      await screen.findByText('No delivery is waiting for another attempt.'),
    ).toBeInTheDocument()
  })

  it('retries a failed delivery through the new endpoint, and it reads as pending', async () => {
    const state = installSetupApi()
    renderAt('/setup/integrations')
    const table = await screen.findByRole('table', { name: 'Webhook deliveries' })
    const delivered = within(table).getAllByRole('row')[1] as HTMLElement
    expect(within(delivered).queryByRole('button')).toBeNull()
    await userEvent
      .setup()
      .click(within(table).getByRole('button', { name: 'Retry delivery 2 of publish' }))
    await waitFor(() => expect(state.sent.map((s) => s.key)).toContain('POST retry 2'))
    expect(
      await screen.findByText(/It shows as pending until the webhook answers/),
    ).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByRole('table')).queryByText('Failed')).toBeNull())
  })

  it('shows the empty state when nothing was sent', async () => {
    installSetupApi({ state: { ...initialState(), deliveries: [] } })
    renderAt('/setup/integrations')
    expect(await screen.findByText('No webhook deliveries')).toBeInTheDocument()
    expect(screen.getByText(/Nothing has been sent yet/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Webhook deliveries' })).toHaveTextContent('Database')
  })
})

describe('Setup › Checkpoints', () => {
  it('shows only what the API returns, and creates a named checkpoint', async () => {
    const state = installSetupApi()
    renderAt('/setup/checkpoints')
    const table = await screen.findByRole('table', { name: 'Checkpoints, newest first' })
    expect(headers(table)).toEqual(['Checkpoint', 'Taken', 'Created', 'Actions'])
    expect(screen.getByRole('region', { name: 'Checkpoints' })).toHaveTextContent('not its size')
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Name'), 'Before launch')
    await user.click(screen.getByRole('button', { name: 'Create checkpoint' }))
    expect(
      await within(table).findByRole('rowheader', { name: 'v2 · Before launch' }),
    ).toBeInTheDocument()
    expect(state.sent.find((s) => s.key === 'POST /api/checkpoints')?.body).toEqual({
      name: 'Before launch',
    })
  })

  it('restores behind a danger confirmation that says what the restore does', async () => {
    const state = installSetupApi()
    renderAt('/setup/checkpoints')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Restore v1 · Before relaunch' }))
    const dialog = await screen.findByRole('dialog', { name: 'Restore v1 · Before relaunch?' })
    expect(dialog).toHaveTextContent('A safety checkpoint, pre-restore-v1, is taken first')
    expect(dialog).toHaveTextContent('Every cached page is marked stale')
    expect(dialog).toHaveTextContent('Settings, SEO configuration and people are not rewound')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Restore checkpoint' }))
    await waitFor(() => expect(state.sent.map((s) => s.key)).toContain('POST restore 1'))
    const table = screen.getByRole('table', { name: 'Checkpoints, newest first' })
    expect(await within(table).findByText('Before a restore')).toBeInTheDocument()
  })

  it('leaves Restore to admins', async () => {
    installSetupApi({ role: 'editor', authMode: 'token' })
    renderAt('/setup/checkpoints')
    await screen.findByRole('table', { name: 'Checkpoints, newest first' })
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Create checkpoint' })).toBeInTheDocument()
  })
})

describe('Setup › People', () => {
  const asAdmin = { role: 'admin', authMode: 'token' } as const

  it('lists the accounts with their role chips, never a last-active figure', async () => {
    installSetupApi(asAdmin)
    renderAt('/setup/people')
    const table = await screen.findByRole('table', { name: 'People' })
    expect(headers(table)).toEqual([
      'Person',
      'Email',
      'Role',
      'Status',
      'Signs in with',
      'Created',
      'Actions',
    ])
    expect(within(table).getByText('eddie@example.test')).toBeInTheDocument()
    const eddie = within(table).getByText('eddie@example.test').closest('tr') as HTMLElement
    expect(eddie).toHaveTextContent('OIDC provider')
    const ada = within(table).getByText('ada@example.test').closest('tr') as HTMLElement
    expect(ada).toHaveTextContent('Studio')
    expect(within(table).getByText('Editor')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'People' })).toHaveTextContent(
      'admin > editor > viewer',
    )
  })

  it('creates a user with a role', async () => {
    const state = installSetupApi(asAdmin)
    renderAt('/setup/people')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Create user' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create user' })
    await user.type(within(dialog).getByLabelText('Email'), 'vera@example.test')
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'viewer')
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))
    await waitFor(() =>
      expect(state.sent.find((s) => s.key === 'POST /api/users')?.body).toEqual({
        email: 'vera@example.test',
        role: 'viewer',
      }),
    )
    expect(await screen.findByText('vera@example.test')).toBeInTheDocument()
  })

  it('changes a role and deactivates an account', async () => {
    const state = installSetupApi(asAdmin)
    renderAt('/setup/people')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit Eddie' }))
    const edit = await screen.findByRole('dialog', { name: 'Edit Eddie' })
    expect(within(edit).getByLabelText('Email')).toBeDisabled()
    await user.selectOptions(within(edit).getByLabelText('Role'), 'admin')
    await user.click(within(edit).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(state.users[1]?.roles).toEqual(['admin']))
    await user.click(await screen.findByRole('button', { name: 'Deactivate Eddie' }))
    const confirm = await screen.findByRole('dialog', { name: 'Deactivate Eddie?' })
    expect(confirm).toHaveTextContent('can no longer sign in')
    await user.click(within(confirm).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(state.users[1]?.isActive).toBe(false))
    expect(await screen.findByText('Deactivated')).toBeInTheDocument()
  })
})

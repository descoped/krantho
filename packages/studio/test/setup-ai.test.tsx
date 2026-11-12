import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearFill } from '../src/structure/fill-job.js'
import {
  initialState,
  installSetupApi,
  type LlmReport,
  llmReport,
  SAVED_LLM,
  UNCONFIGURED_LLM,
} from './fixtures/setup-api.js'
import { renderAt } from './fixtures/site-api.js'

afterEach(() => {
  clearFill()
  vi.unstubAllGlobals()
})

function savedState(llm: LlmReport = SAVED_LLM): ReturnType<typeof initialState> {
  return { ...initialState(), llm: { ...llm } }
}

const enrichBodies = (state: ReturnType<typeof initialState>): unknown[] =>
  state.sent.filter((s) => s.key === 'POST /api/seo/enrich').map((s) => s.body)

const sentTo = (state: ReturnType<typeof initialState>, key: string): unknown[] =>
  state.sent.filter((s) => s.key === key).map((s) => s.body)

/** The card of one AI, by the name a person knows it by */
async function card(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name })
  const item = heading.closest('li')
  if (!item) throw new Error(`No card for ${name}`)
  return item
}

describe('Setup › AI provider', () => {
  it('says AI help is off with nothing set up, and offers the AIs anyone can turn on with a key', async () => {
    installSetupApi()
    renderAt('/setup/ai')
    expect(
      await screen.findByText('AI help is off. Add a key below to turn it on.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Ready to use' })).toBeNull()
    for (const name of ['Claude', 'ChatGPT', 'Gemini']) {
      expect(within(await card(name)).getByLabelText(`${name} key`)).toHaveValue('')
    }
    const developers = screen.getByText('For developers').closest('details')
    expect(developers).not.toBeNull()
    expect(
      within(developers as HTMLElement).getByRole('heading', { name: 'OpenRouter' }),
    ).toBeInTheDocument()
  })

  it('turns an AI on from its key, tests it at once, and says so in a sentence', async () => {
    const state = installSetupApi()
    renderAt('/setup/ai')
    const user = userEvent.setup()
    const chatgpt = await card('ChatGPT')
    await user.type(within(chatgpt).getByLabelText('ChatGPT key'), 'sk-pasted')
    await user.click(within(chatgpt).getByRole('button', { name: 'Turn on' }))

    expect(await screen.findByText('ChatGPT works: it answered.')).toBeInTheDocument()
    expect(sentTo(state, 'PUT /api/settings/llm')).toEqual([
      { provider: 'openai', apiKey: 'sk-pasted' },
    ])
    expect(sentTo(state, 'POST /api/settings/llm/test')).toEqual([{ provider: 'openai' }])
    expect(screen.getByText('AI help is on, using ChatGPT.')).toBeInTheDocument()
    const ready = within(await card('ChatGPT'))
    expect(ready.getByText('In use')).toBeInTheDocument()
    expect(ready.getByText('Key saved here, encrypted.')).toBeInTheDocument()
    expect(screen.queryByLabelText('ChatGPT key')).toBeNull()
  })

  it('cannot turn on without a key, and says why', async () => {
    installSetupApi()
    renderAt('/setup/ai')
    const turnOn = within(await card('Gemini')).getByRole('button', { name: 'Turn on' })
    expect(turnOn).toHaveAttribute('aria-disabled', 'true')
    expect(turnOn).toHaveAccessibleDescription('Paste the key first.')
  })

  it('shows an AI whose key the developer set up as ready, without a way to remove it', async () => {
    installSetupApi({ state: savedState(llmReport({ openai: 'environment' })) })
    renderAt('/setup/ai')
    const chatgpt = within(await card('ChatGPT'))
    expect(chatgpt.getByText('In use')).toBeInTheDocument()
    expect(chatgpt.getByText('Set up by your developer.')).toBeInTheDocument()
    expect(chatgpt.queryByRole('button', { name: 'Remove key' })).toBeNull()
    expect(screen.queryByText('KRANTHO_LLM_OPENAI_API_KEY', { selector: 'p' })).toBeNull()
  })

  it('switches the site to another AI that is ready, leaving the first one ready', async () => {
    const state = installSetupApi({
      state: savedState(llmReport({ anthropic: 'saved', openai: 'environment' }, 'anthropic')),
    })
    renderAt('/setup/ai')
    const user = userEvent.setup()
    await user.click(within(await card('ChatGPT')).getByRole('button', { name: 'Use this one' }))
    await waitFor(() =>
      expect(screen.getByText('AI help is on, using ChatGPT.')).toBeInTheDocument(),
    )
    expect(sentTo(state, 'PUT /api/settings/llm')).toEqual([{ provider: 'openai', use: true }])
    expect(
      within(await card('Claude')).getByRole('button', { name: 'Use this one' }),
    ).toBeInTheDocument()
  })

  it('tests the AI of the card it is pressed on', async () => {
    const state = installSetupApi({
      state: savedState(llmReport({ anthropic: 'saved', openai: 'environment' })),
    })
    renderAt('/setup/ai')
    await userEvent
      .setup()
      .click(within(await card('ChatGPT')).getByRole('button', { name: 'Test' }))
    expect(await screen.findByText('ChatGPT works: it answered.')).toBeInTheDocument()
    expect(sentTo(state, 'POST /api/settings/llm/test')).toEqual([{ provider: 'openai' }])
  })

  it('confirms Remove key first, saying it cannot be shown again, then removes that AI only', async () => {
    const state = installSetupApi({
      state: savedState(llmReport({ anthropic: 'saved', openai: 'saved' }, 'anthropic')),
    })
    renderAt('/setup/ai')
    const user = userEvent.setup()
    await user.click(within(await card('ChatGPT')).getByRole('button', { name: 'Remove key' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove the key for ChatGPT?' })
    expect(dialog).toHaveTextContent('cannot be shown again')
    expect(dialog).toHaveTextContent('A key set up by your developer is not touched')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(sentTo(state, 'DELETE /api/settings/llm')).toEqual([])
    await user.click(within(await card('ChatGPT')).getByRole('button', { name: 'Remove key' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove key' }),
    )
    await waitFor(() => expect(sentTo(state, 'DELETE /api/settings/llm')).toHaveLength(1))
    expect(await screen.findByLabelText('ChatGPT key')).toBeInTheDocument()
    expect(screen.getByText('AI help is on, using Claude.')).toBeInTheDocument()
  })

  it('keeps model and address under Advanced, and saves them for that AI alone', async () => {
    const state = installSetupApi({ state: savedState() })
    renderAt('/setup/ai')
    const user = userEvent.setup()
    const claude = within(await card('Claude'))
    expect(claude.getByText('Advanced').closest('details')).not.toHaveAttribute('open')
    await user.type(claude.getByLabelText('Model'), 'claude-sonnet-5')
    await user.type(claude.getByLabelText('Address'), 'http://proxy.test')
    await user.click(claude.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(sentTo(state, 'PUT /api/settings/llm')).toEqual([
        { provider: 'anthropic', model: 'claude-sonnet-5', baseUrl: 'http://proxy.test' },
      ]),
    )
  })

  it('names the variables a developer can set a key in, and turns a local model on with its address', async () => {
    const state = installSetupApi()
    renderAt('/setup/ai')
    const user = userEvent.setup()
    await screen.findByText(/AI help is/)
    for (const variable of [
      'KRANTHO_LLM_ANTHROPIC_API_KEY',
      'KRANTHO_LLM_OPENAI_API_KEY',
      'KRANTHO_LLM_GEMINI_API_KEY',
      'KRANTHO_LLM_OPENROUTER_API_KEY',
    ]) {
      expect(screen.getByText(variable)).toBeInTheDocument()
    }
    const local = within(await card('Ollama'))
    await user.type(local.getByLabelText('Address'), 'http://localhost:11434')
    await user.click(local.getByRole('button', { name: 'Turn on' }))
    await waitFor(() =>
      expect(sentTo(state, 'PUT /api/settings/llm')).toEqual([
        { provider: 'ollama', model: '', baseUrl: 'http://localhost:11434', use: true },
      ]),
    )
    expect(await screen.findByText('Runs on your own computer.')).toBeInTheDocument()
  })

  it('says which AI the configuration gave the assistant', async () => {
    installSetupApi({ state: savedState(llmReport({ anthropic: 'saved' }, 'anthropic', 'openai')) })
    renderAt('/setup/ai')
    expect(await screen.findByText(/The assistant is set to ChatGPT/)).toBeInTheDocument()
  })

  it('says nothing about the assistant when the configuration does not set it', async () => {
    installSetupApi({ state: savedState(UNCONFIGURED_LLM) })
    renderAt('/setup/ai')
    await screen.findByText(/AI help is/)
    expect(screen.queryByText(/The assistant is set to/)).toBeNull()
  })

  it('runs Fill missing SEO over a scope, without force', async () => {
    const state = installSetupApi({ state: savedState() })
    renderAt('/setup/ai')
    const user = userEvent.setup()
    const run = await screen.findByRole('region', { name: 'Run across the site' })
    await waitFor(() => expect(within(run).getAllByRole('option')).toHaveLength(3))
    await user.selectOptions(within(run).getByLabelText('Scope'), 'services')
    await user.click(within(run).getByRole('button', { name: 'Fill missing SEO' }))
    await waitFor(() => expect(within(run).getByRole('status')).toHaveTextContent(/^Finished/))
    expect(enrichBodies(state)).toEqual([
      { type: 'meta-descriptions', force: false, scope: 'collection', collection: 'services' },
      { type: 'archetype', force: false, scope: 'collection', collection: 'services' },
    ])
  })

  it('runs Meta only: the meta descriptions alone', async () => {
    const state = installSetupApi({ state: savedState() })
    renderAt('/setup/ai')
    const run = await screen.findByRole('region', { name: 'Run across the site' })
    await userEvent.setup().click(within(run).getByRole('button', { name: 'Meta only' }))
    await waitFor(() => expect(within(run).getByRole('status')).toHaveTextContent(/^Finished/))
    expect(enrichBodies(state)).toEqual([{ type: 'meta-descriptions', force: false, scope: 'all' }])
  })

  it('puts Force regenerate behind a danger confirmation saying it overwrites and goes live', async () => {
    const state = installSetupApi({ state: savedState() })
    renderAt('/setup/ai')
    const user = userEvent.setup()
    const run = await screen.findByRole('region', { name: 'Run across the site' })
    await user.click(within(run).getByRole('button', { name: 'Force regenerate…' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Force regenerate SEO for the whole site?',
    })
    expect(dialog).toHaveTextContent("overwrites the values there now, the editors' own included")
    expect(dialog).toHaveTextContent('change at once: this is not a draft')
    expect(dialog).not.toHaveTextContent(/lands as drafts?/)
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(enrichBodies(state)).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: 'Overwrite and regenerate' }))
    await waitFor(() => expect(within(run).getByRole('status')).toHaveTextContent(/^Finished/))
    expect(enrichBodies(state)).toEqual([
      { type: 'meta-descriptions', force: true, scope: 'all' },
      { type: 'archetype', force: true, scope: 'all' },
    ])
  })

  it('cannot run without a saved provider, and says why', async () => {
    installSetupApi()
    renderAt('/setup/ai')
    const run = await screen.findByRole('region', { name: 'Run across the site' })
    expect(within(run).getByRole('button', { name: 'Fill missing SEO' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(within(run).getByText('Add an AI key first.', { selector: 'p' })).toBeInTheDocument()
  })

  it('is read-only for an editor: no Save, no runs', async () => {
    installSetupApi({ role: 'editor', authMode: 'token', state: savedState() })
    renderAt('/setup/ai')
    expect(await screen.findByText('AI help is on, using Claude.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Test' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull()
    const run = screen.getByRole('region', { name: 'Run across the site' })
    expect(
      within(run).getByText('Enrichment is run by an admin.', { selector: 'p' }),
    ).toBeInTheDocument()
  })
})

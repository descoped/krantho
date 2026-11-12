import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssistantEvent, AssistantLimits } from '../src/lib/api-assistant.js'
import { Studio } from '../src/routes.js'

// ---------------------------------------------------------------------------
// A fake API behind a stubbed fetch
// ---------------------------------------------------------------------------

interface Call {
  url: string
  method: string
  body: unknown
  signal: AbortSignal | undefined
}

type Route = (call: Call) => Response | Promise<Response>

const LIMITS: AssistantLimits = {
  maxTurns: 8,
  maxToolCalls: 16,
  maxTokens: 16000,
  maxRequestTokens: 200000,
  maxHistoryMessages: 40,
  maxInputChars: 60000,
  toolResultChars: 12000,
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function encode(event: AssistantEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

function sse(events: readonly AssistantEvent[]): Response {
  return new Response(events.map(encode).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  })
}

/** An event stream the test writes to as it goes */
function liveSse(): { response: Response; push(e: AssistantEvent): void; close(): void } {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })
  const encoder = new TextEncoder()
  return {
    response: new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
    push: (event) => controller?.enqueue(encoder.encode(encode(event))),
    close: () => controller?.close(),
  }
}

interface FakeApi {
  calls: Call[]
  chat: Route[]
  confirm: Route[]
  chatBodies(): Array<{ messages: Array<{ role: string; content: string }> }>
}

function installApi(options: {
  features?: Record<string, string>
  authMode?: 'none' | 'token'
  signedIn?: boolean
  status?: Route
}): FakeApi {
  const api: FakeApi = {
    calls: [],
    chat: [],
    confirm: [],
    chatBodies: () =>
      api.calls
        .filter((c) => c.url === '/api/assistant/chat')
        .map((c) => c.body as { messages: Array<{ role: string; content: string }> }),
  }
  const authMode = options.authMode ?? 'none'
  const routes: Record<string, Route> = {
    'GET /api/auth/capabilities': () =>
      json({ auth_mode: authMode, login_required: authMode !== 'none' }),
    'GET /api/auth/me': () =>
      options.signedIn ? json({ id: 'u1', email: 'e@x.test', roles: ['admin'] }) : json({}, 401),
    'GET /api/capabilities': () =>
      json({
        persistence: 'sqlite',
        authMode,
        schemaVersion: 1,
        features: options.features ?? { assistant: 'enabled' },
      }),
    'GET /api/collections': () => json({ collections: [] }),
    'GET /api/assistant':
      options.status ??
      (() =>
        json({
          configured: true,
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          credential: 'oauth',
          providers: [{ provider: 'anthropic', label: 'Claude' }],
          tools: [],
          limits: LIMITS,
          confirmTtlSec: 600,
        })),
    'POST /api/assistant/chat': (call) => {
      const next = api.chat.shift()
      return next ? next(call) : sse([{ type: 'done', reason: 'end_turn' }])
    },
    'POST /api/assistant/confirm': (call) => {
      const next = api.confirm.shift()
      return next ? next(call) : json({ error: 'unexpected' }, 500)
    },
    'POST /api/auth/refresh': () => json({ ok: true }),
  }
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const call: Call = { url, method, body, signal: init?.signal ?? undefined }
    api.calls.push(call)
    const route = routes[`${method} ${url.split('?')[0]}`]
    return route ? route(call) : json({ error: 'not found' }, 404)
  })
  return api
}

function renderStudio(path = '/'): void {
  render(<Studio makeRouter={(routes) => createMemoryRouter(routes, { initialEntries: [path] })} />)
}

async function openPanel(): Promise<HTMLElement> {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Assistant' }))
  return screen.findByRole('complementary', { name: 'Assistant' })
}

async function ask(text: string): Promise<void> {
  const user = userEvent.setup()
  const input = await screen.findByLabelText('Ask the assistant')
  await waitFor(() => expect(input).toBeEnabled())
  await user.type(input, `${text}{Enter}`)
}

function memoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  }
}

beforeEach(() => {
  // The theme toggle reads both; Node's own localStorage global hides jsdom's
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------

describe('assistant availability', () => {
  it('renders no launcher and asks nothing when the feature is off', async () => {
    const api = installApi({ features: { seo: 'enabled' } })
    renderStudio()
    await screen.findByRole('navigation', { name: 'Studio' })
    expect(screen.queryByRole('button', { name: 'Assistant' })).toBeNull()
    expect(api.calls.some((c) => c.url.startsWith('/api/assistant'))).toBe(false)
  })

  it('renders no launcher when nobody is signed in under token auth', async () => {
    installApi({ authMode: 'token', signedIn: false })
    renderStudio()
    await screen.findByPlaceholderText('Enter token')
    expect(screen.queryByRole('button', { name: 'Assistant' })).toBeNull()
  })

  it('shows a refusal and disables the composer below the configured role', async () => {
    const api = installApi({ status: () => json({ error: 'Insufficient permissions' }, 403) })
    renderStudio()
    const panel = await openPanel()
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Insufficient permissions')
    expect(within(panel).getByLabelText('Ask the assistant')).toBeDisabled()
    expect(api.calls.some((c) => c.url === '/api/assistant/chat')).toBe(false)
  })
})

describe('assistant panel', () => {
  it('opens from the launcher with focus in the composer; Escape closes it and returns focus', async () => {
    installApi({})
    renderStudio()
    const launcher = await screen.findByRole('button', { name: 'Assistant' })
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
    const panel = await openPanel()
    expect(launcher).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(within(panel).getByLabelText('Ask the assistant')).toHaveFocus())
    expect(await within(panel).findByText('Claude · claude-haiku-4-5')).toBeInTheDocument()

    await userEvent.setup().keyboard('{Escape}')
    expect(panel).not.toBeVisible()
    expect(launcher).toHaveFocus()
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
  })

  it('streams text into a reply that is aria-busy until done', async () => {
    const api = installApi({})
    const stream = liveSse()
    api.chat.push(() => stream.response)
    renderStudio()
    const panel = await openPanel()
    await ask('Which pages do we have?')

    act(() => stream.push({ type: 'text', text: 'We have **two** pages.' }))
    const log = within(panel).getByRole('log')
    const strong = await within(log).findByText('two')
    const replyEntry = strong.closest('.assistant-entry') as HTMLElement
    expect(replyEntry).toHaveAttribute('aria-busy', 'true')

    act(() => {
      stream.push({ type: 'done', reason: 'end_turn' })
      stream.close()
    })
    await waitFor(() => expect(replyEntry).toHaveAttribute('aria-busy', 'false'))
    expect(api.chatBodies()[0]?.messages).toEqual([
      { role: 'user', content: 'Which pages do we have?' },
    ])
  })

  it('offers no picker with one AI', async () => {
    installApi({})
    renderStudio()
    const single = await openPanel()
    await within(single).findByText('Claude · claude-haiku-4-5')
    expect(within(single).queryByLabelText('AI used by the assistant')).toBeNull()
  })

  it('lets the user pick the AI at the top, remembers it, and sends it with the message', async () => {
    const api = installApi({
      status: () =>
        json({
          configured: true,
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          credential: 'api-key',
          providers: [
            { provider: 'anthropic', label: 'Claude' },
            { provider: 'openai', label: 'ChatGPT' },
          ],
          tools: [],
          limits: LIMITS,
          confirmTtlSec: 600,
        }),
    })
    renderStudio()
    const panel = await openPanel()
    const picker = await within(panel).findByLabelText('AI used by the assistant')
    expect(picker).toHaveValue('anthropic')
    expect(
      within(picker)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Claude', 'ChatGPT'])

    await userEvent.setup().selectOptions(picker, 'openai')
    expect(await within(panel).findByText('ChatGPT', { selector: 'p' })).toBeInTheDocument()
    expect(localStorage.getItem('krantho.assistant.provider')).toBe('openai')
    await ask('Which pages do we have?')
    await waitFor(() => expect(api.chatBodies()).toHaveLength(1))
    expect(api.calls.find((c) => c.url === '/api/assistant/chat')?.body).toMatchObject({
      provider: 'openai',
    })
  })

  it('sends no provider until the user has picked one, and ignores one that is no longer on', async () => {
    localStorage.setItem('krantho.assistant.provider', 'gemini')
    const api = installApi({})
    renderStudio()
    await openPanel()
    await ask('Hello')
    await waitFor(() => expect(api.chatBodies()).toHaveLength(1))
    expect(api.calls.find((c) => c.url === '/api/assistant/chat')?.body).not.toHaveProperty(
      'provider',
    )
  })

  it('sends the editor route as context', async () => {
    const api = installApi({})
    renderStudio('/site/pages/about?locale=en')
    await openPanel()
    await ask('Shorten this')
    await waitFor(() => expect(api.chatBodies()).toHaveLength(1))
    expect(api.calls.find((c) => c.url === '/api/assistant/chat')?.body).toMatchObject({
      context: { collection: 'pages', slug: 'about', locale: 'en' },
    })
  })

  it('lists an activity with a link to its document', async () => {
    const api = installApi({})
    api.chat.push(() =>
      sse([
        { type: 'tool', id: 'c1', tool: 'get_document', label: 'Read pages/about' },
        {
          type: 'activity',
          activity: {
            id: 'c1',
            tool: 'get_document',
            status: 'done',
            summary: 'Read pages/about (v7)',
            documents: [{ collection: 'pages', slug: 'about', locale: 'en', version: 7 }],
          },
        },
        { type: 'done', reason: 'end_turn' },
      ]),
    )
    renderStudio()
    const panel = await openPanel()
    await ask('Read about')
    expect(await within(panel).findByText('Read pages/about (v7)')).toBeInTheDocument()
    const link = within(panel).getByRole('link', { name: 'pages/about' })
    expect(link).toHaveAttribute('href', '/site/pages/about?locale=en')
  })
})

// ---------------------------------------------------------------------------

function proposal(token: string, title: string): AssistantEvent {
  return {
    type: 'activity',
    activity: {
      id: `call-${token}`,
      tool: 'publish_documents',
      status: 'pending',
      summary: `Proposed: ${title}`,
      documents: [{ collection: 'pages', slug: 'about', locale: 'en', version: 7 }],
      changes: [
        {
          ref: { collection: 'pages', slug: 'about', locale: 'en' },
          baseVersion: 7,
          fields: [{ name: 'description', before: 'A long description', after: 'Short' }],
          status: { before: 'draft', after: 'published' },
        },
      ],
      pending: {
        token,
        kind: 'publish',
        title,
        confirmLabel: 'Publish',
        destructive: false,
        expiresAt: '2026-09-30T12:32:00.000Z',
      },
    },
  }
}

const DONE: AssistantEvent = { type: 'done', reason: 'end_turn' }

describe('proposals', () => {
  it('confirms with the token and shows the result', async () => {
    const api = installApi({})
    api.chat.push(() =>
      sse([{ type: 'text', text: 'Proposed.' }, proposal('tok-1', 'Publish pages/about'), DONE]),
    )
    api.confirm.push(() =>
      json({ ok: true, results: [{ status: 'done', message: 'Published pages/about (v8)' }] }),
    )
    renderStudio()
    const panel = await openPanel()
    await ask('Publish about')

    expect(await within(panel).findByText('Needs your confirmation')).toBeInTheDocument()
    expect(within(panel).getByText('Short')).toBeInTheDocument()
    await userEvent.setup().click(within(panel).getByRole('button', { name: 'Publish' }))

    expect(await within(panel).findByText('Published pages/about (v8)')).toBeInTheDocument()
    const confirmCall = api.calls.find((c) => c.url === '/api/assistant/confirm')
    expect(confirmCall).toMatchObject({ method: 'POST', body: { token: 'tok-1' } })
    expect(within(panel).queryByRole('button', { name: 'Publish' })).toBeNull()
  })

  it('shows the server refusal when confirming fails', async () => {
    const api = installApi({})
    api.chat.push(() => sse([proposal('tok-1', 'Publish pages/about'), DONE]))
    api.confirm.push(() => json({ error: 'Changed since the proposal', conflicts: [] }, 409))
    renderStudio()
    const panel = await openPanel()
    await ask('Publish about')
    await userEvent.setup().click(await within(panel).findByRole('button', { name: 'Publish' }))
    expect(await within(panel).findByText('Changed since the proposal')).toBeInTheDocument()
  })

  it('Cancel tells the assistant with the next message', async () => {
    const api = installApi({})
    api.chat.push(() => sse([proposal('tok-1', 'Publish pages/about'), DONE]))
    renderStudio()
    const panel = await openPanel()
    await ask('Publish about')
    await userEvent.setup().click(await within(panel).findByRole('button', { name: 'Cancel' }))
    expect(await within(panel).findByText('Cancelled')).toBeInTheDocument()

    await ask('Never mind')
    await waitFor(() => expect(api.chatBodies()).toHaveLength(2))
    expect(api.chatBodies()[1]?.messages.at(-1)).toEqual({
      role: 'user',
      content: 'Cancelled: Publish pages/about\n\nNever mind',
    })
    expect(api.calls.some((c) => c.url === '/api/assistant/confirm')).toBe(false)
  })

  it('Confirm all confirms in order and stops at the first failure', async () => {
    const api = installApi({})
    api.chat.push(() =>
      sse([
        proposal('tok-1', 'Publish pages/a'),
        proposal('tok-2', 'Publish pages/b'),
        proposal('tok-3', 'Publish pages/c'),
        DONE,
      ]),
    )
    api.confirm.push(
      () => json({ ok: true, results: [{ status: 'done', message: 'Published pages/a (v2)' }] }),
      () => json({ error: 'Changed since the proposal' }, 409),
    )
    renderStudio()
    const panel = await openPanel()
    await ask('Publish all three')
    await userEvent.setup().click(await within(panel).findByRole('button', { name: 'Confirm all' }))
    expect(await within(panel).findByText('Changed since the proposal')).toBeInTheDocument()
    const tokens = api.calls
      .filter((c) => c.url === '/api/assistant/confirm')
      .map((c) => (c.body as { token: string }).token)
    expect(tokens).toEqual(['tok-1', 'tok-2'])
  })

  it('refreshes an expired session once when confirming', async () => {
    const api = installApi({})
    api.chat.push(() => sse([proposal('tok-1', 'Publish pages/about'), DONE]))
    api.confirm.push(
      () => json({ error: 'Token expired' }, 401),
      () =>
        json({ ok: true, results: [{ status: 'done', message: 'Published pages/about (v8)' }] }),
    )
    renderStudio()
    const panel = await openPanel()
    await ask('Publish about')
    await userEvent.setup().click(await within(panel).findByRole('button', { name: 'Publish' }))
    expect(await within(panel).findByText('Published pages/about (v8)')).toBeInTheDocument()
    const sequence = api.calls
      .map((c) => c.url)
      .filter((url) => url === '/api/assistant/confirm' || url === '/api/auth/refresh')
    expect(sequence).toEqual([
      '/api/assistant/confirm',
      '/api/auth/refresh',
      '/api/assistant/confirm',
    ])
  })
})

describe('conversation', () => {
  it('sends text-only history with activity lines, trimmed to the limits, starting with the user', async () => {
    const api = installApi({
      status: () =>
        json({
          configured: true,
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          credential: 'oauth',
          providers: [{ provider: 'anthropic', label: 'Claude' }],
          tools: [],
          limits: { ...LIMITS, maxHistoryMessages: 4 },
          confirmTtlSec: 600,
        }),
    })
    api.chat.push(
      () => sse([{ type: 'text', text: 'First answer' }, DONE]),
      () =>
        sse([
          { type: 'text', text: 'Drafted.' },
          {
            type: 'activity',
            activity: {
              id: 'c1',
              tool: 'create_draft',
              status: 'done',
              summary: 'Created draft pages/pricing (v1)',
              documents: [{ collection: 'pages', slug: 'pricing', locale: 'en', version: 1 }],
            },
          },
          DONE,
        ]),
    )
    renderStudio()
    const panel = await openPanel()
    await ask('One')
    await within(panel).findByText('First answer')
    await ask('Two')
    await within(panel).findByText('Created draft pages/pricing (v1)')
    await ask('Three')

    await waitFor(() => expect(api.chatBodies()).toHaveLength(3))
    expect(api.chatBodies()[2]?.messages).toEqual([
      { role: 'user', content: 'Two' },
      { role: 'assistant', content: 'Drafted.\n\n[Created draft pages/pricing (v1)]' },
      { role: 'user', content: 'Three' },
    ])
  })

  it('shows a provider without tool use as an error with a way to Settings', async () => {
    const api = installApi({})
    api.chat.push(() =>
      sse([
        {
          type: 'error',
          code: 'tools_unsupported',
          message: 'The model `llama` on `ollama` does not support tool use.',
        },
        { type: 'done', reason: 'error' },
      ]),
    )
    renderStudio()
    const panel = await openPanel()
    await ask('Hello')
    const alert = await within(panel).findByRole('alert')
    expect(alert).toHaveTextContent('does not support tool use')
    expect(within(alert).getByRole('link')).toHaveAttribute('href', '/setup/ai')
  })

  it('shows an unconfigured LLM before the stream as an error', async () => {
    const api = installApi({})
    api.chat.push(() =>
      json({ error: 'No LLM provider configured.', code: 'llm_unconfigured' }, 503),
    )
    renderStudio()
    const panel = await openPanel()
    await ask('Hello')
    const alert = await within(panel).findByRole('alert')
    expect(alert).toHaveTextContent('No LLM provider configured.')
    expect(within(alert).getByRole('link')).toHaveAttribute('href', '/setup/ai')
  })

  it('Stop aborts the request', async () => {
    const api = installApi({})
    const stream = liveSse()
    api.chat.push(() => stream.response)
    renderStudio()
    const panel = await openPanel()
    await ask('Write a long page')
    act(() => stream.push({ type: 'text', text: 'Working on it' }))
    await within(panel).findByText('Working on it')

    await userEvent.setup().click(within(panel).getByRole('button', { name: 'Stop' }))
    const signal = api.calls.find((c) => c.url === '/api/assistant/chat')?.signal
    expect(signal?.aborted).toBe(true)
    expect(await within(panel).findByRole('button', { name: 'Send' })).toBeInTheDocument()
    expect(within(panel).queryByRole('alert')).toBeNull()
  })
})

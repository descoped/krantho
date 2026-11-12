import { parseServerSentEvents } from '@krantho/ai'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editor } from './assistant/auth.js'
import { asUser, testApi, testConfig, testStores } from './assistant/fixtures.js'
import {
  BASE_URL,
  type ModelTurn,
  type Vendor,
  type VendorMockOptions,
  vendorMock,
} from './assistant/vendor-mock.js'
import { storeKey } from './fake-vault.js'

/**
 * The assistant against mock models that answer in the shape each provider documents and
 * refuse what it is documented to refuse (see `assistant/vendor-mock.ts`). The whole chat
 * route runs: the system prompt, the real tools and their schemas, the provider adapter,
 * the agent loop and the event stream.
 */
afterEach(() => {
  vi.unstubAllGlobals()
})

interface StreamedEvent {
  type: string
  [key: string]: unknown
}

async function converse(
  vendor: Vendor,
  turns: ModelTurn[],
  options: VendorMockOptions & { maxTurns?: number } = {},
) {
  const stores = testStores()
  await stores.adapter.seed(
    {
      collection: 'pages',
      slug: 'about',
      fields: { title: 'About us', description: 'Who we are' },
      body: 'We help.',
    },
    'draft',
  )
  await stores.settings.setSetting('llm.provider', vendor)
  await stores.settings.setSetting(`llm.baseUrl.${vendor}`, BASE_URL[vendor])
  await storeKey(stores.settings, vendor, 'test-key')
  const mock = vendorMock(vendor, turns, options)
  vi.stubGlobal('fetch', mock.fetch)

  const config = testConfig(
    options.maxTurns === undefined ? {} : { assistant: { limits: { maxTurns: options.maxTurns } } },
  )
  const response = await testApi(stores, config).handle(
    asUser(editor, 'POST', '/api/assistant/chat', {
      messages: [{ role: 'user', content: 'What is on the About page?' }],
      context: { collection: 'pages', slug: 'about' },
    }),
  )
  expect(response.status).toBe(200)
  const events: StreamedEvent[] = []
  for await (const event of parseServerSentEvents(response.body as ReadableStream<Uint8Array>)) {
    events.push(JSON.parse(event.data) as StreamedEvent)
  }
  return { events, mock, stores }
}

const read = { name: 'get_document', args: { collection: 'pages', slug: 'about' } }
const typesOf = (events: StreamedEvent[]): string[] => events.map((event) => event.type)
const textOf = (events: StreamedEvent[]): string =>
  events.flatMap((event) => (event.type === 'text' ? [String(event.text)] : [])).join('')
const activities = (events: StreamedEvent[]) =>
  events.flatMap((event) =>
    event.type === 'activity' ? [event['activity'] as { tool: string; status: string }] : [],
  )

describe.each(['gemini', 'openrouter', 'ollama'] as const)('the assistant on %s', (vendor) => {
  it('reads a document with a tool and answers from it', async () => {
    const { events, mock } = await converse(vendor, [
      { calls: [read] },
      { text: 'The About page is titled About us.' },
    ])

    expect(events.filter((event) => event.type === 'error')).toEqual([])
    expect(activities(events)).toEqual([
      expect.objectContaining({ tool: 'get_document', status: 'done' }),
    ])
    expect(textOf(events)).toBe('The About page is titled About us.')
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'end_turn' })
    expect(mock.requests).toHaveLength(2)
    // The second request carries the tool result for the call the model made
    const result = mock.requests[1]?.messages.find((message) => message.role === 'tool')
    expect(String(result?.content)).toContain('About us')
  })

  it('reports usage whether or not the provider sends it', async () => {
    const { events } = await converse(vendor, [{ calls: [read] }, { text: 'Done.' }])
    const usage = events.filter((event) => event.type === 'usage')
    expect(usage.length).toBeGreaterThan(0)
    expect(Number(usage.at(-1)?.['inputTokens'])).toBeGreaterThan(0)
  })
})

describe('the assistant on gemini', () => {
  it('uses a model Google has not retired', async () => {
    const { mock } = await converse('gemini', [{ text: 'Hello' }])
    expect(mock.requests[0]?.model).toBe('gemini-3.6-flash')
  })

  it('declares every tool without an object that names no properties', async () => {
    const { events, mock } = await converse('gemini', [{ text: 'Hello' }])
    expect(events.filter((event) => event.type === 'error')).toEqual([])
    const declared = mock.requests[0]?.tools.map((tool) => tool.function.name) ?? []
    expect(declared).toEqual(
      expect.arrayContaining(['get_document', 'update_draft', 'create_draft']),
    )
  })

  it('sends the thought signature of a function call back with it', async () => {
    const { mock, events } = await converse('gemini', [{ calls: [read] }, { text: 'Done.' }])
    expect(events.filter((event) => event.type === 'error')).toEqual([])
    const call = mock.requests[1]?.messages.find((message) => message.tool_calls)?.tool_calls?.[0]
    expect(call?.['extra_content']).toEqual({ google: { thought_signature: 'sig-0' } })
  })

  it('proposes a change whose fields the model wrote as a JSON string', async () => {
    const { events, mock } = await converse('gemini', [
      { calls: [read] },
      {
        calls: [
          {
            name: 'update_draft',
            args: {
              collection: 'pages',
              slug: 'about',
              basedOnVersion: 1,
              fields: { title: 'About our practice' },
            },
          },
        ],
      },
      { text: 'I drafted the change; it waits for your confirmation.' },
    ])

    expect(events.filter((event) => event.type === 'error')).toEqual([])
    const sent = mock.requests[0]?.tools.find((tool) => tool.function.name === 'update_draft')
    const properties = sent?.function.parameters['properties'] as Record<string, { type: string }>
    expect(properties['fields']?.type).toBe('string')
    // The string reached the tool as an object: a replaced title is proposed, not written
    const update = activities(events).find((activity) => activity.tool === 'update_draft')
    expect(update?.status).toBe('pending')
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'end_turn' })
  })

  it("shows the reason in Google's array-shaped error", async () => {
    const message = 'models/gemini-3.6-flash is not found for API version v1beta'
    const { events } = await converse('gemini', [{ text: 'never sent' }], {
      failWith: { status: 404, message },
    })
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', message }))
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'error' })
  })
})

describe('the assistant on openrouter', () => {
  it('keeps the tools in a request that forbids calling them, so the answer can follow', async () => {
    const { events, mock } = await converse(
      'openrouter',
      [
        { calls: [read], textWithoutTools: 'Here is what I found: the page is titled About us.' },
        { calls: [read], textWithoutTools: 'Here is what I found: the page is titled About us.' },
      ],
      { maxTurns: 2 },
    )

    expect(mock.requests[1]?.toolChoice).toBe('none')
    expect(mock.requests[1]?.tools.length).toBeGreaterThan(0)
    expect(events.filter((event) => event.type === 'error')).toEqual([])
    expect(textOf(events)).toContain('About us')
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'end_turn' })
  })

  it("sends the turn's reasoning details back unmodified and reads past the keep-alive comments", async () => {
    const { events, mock } = await converse('openrouter', [{ calls: [read] }, { text: 'Done.' }])
    expect(events.filter((event) => event.type === 'error')).toEqual([])
    const turn = mock.requests[1]?.messages.find((message) => message.tool_calls)
    expect(turn?.reasoning_details).toEqual([{ type: 'reasoning.encrypted', data: 'enc-0' }])
  })

  it('ends with the error the provider reports mid-stream', async () => {
    const { events } = await converse('openrouter', [
      { text: 'Part of an answer', streamError: 'Provider disconnected' },
    ])
    expect(typesOf(events)).toContain('error')
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'error', message: 'Provider disconnected' }),
    )
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'error' })
  })
})

describe('the assistant on ollama', () => {
  it('still gets an answer on the last allowed turn, where tool_choice is not read', async () => {
    const { events, mock } = await converse(
      'ollama',
      [
        { calls: [read] },
        { calls: [read], textWithoutTools: 'The About page is titled About us.' },
      ],
      { maxTurns: 2 },
    )

    // Ollama would call a tool whenever it is offered one, so the last request offers none
    expect(mock.requests[1]?.tools).toEqual([])
    expect(mock.requests[1]?.toolChoice).toBeUndefined()
    expect(textOf(events)).toBe('The About page is titled About us.')
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'end_turn' })
  })

  it('names the model when it has no tool support', async () => {
    const { events } = await converse('ollama', [{ text: 'never sent' }], { toolsSupported: false })
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'error',
        code: 'tools_unsupported',
        message: expect.stringContaining('llama3.1'),
      }),
    )
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'error' })
  })
})

import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { KranthoConfigInput } from '@krantho/config'
import { envNameFor, LEAVES } from '@krantho/config'
import { defineCollection } from '@krantho/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { KranthoHandler } from '../src/handler.js'
import { createKranthoHandler } from '../src/handler.js'

/**
 * The assistant end to end on SQLite: the LLM settings stored the way the
 * admin stores them, the provider faked on the wire (OpenAI format), a chat
 * that creates a draft, and a publish confirmed through the confirm route.
 */

const jwtSecret = 'assistant-e2e-secret-that-is-long-enough-to-sign'
const collections = {
  pages: defineCollection({
    name: 'pages',
    source: 'database',
    schema: z.object({ title: z.string() }),
  }),
}

let dataDir: string
let handler: KranthoHandler
const savedEnv: Record<string, string | undefined> = {}

beforeEach(async () => {
  for (const leaf of LEAVES) {
    const name = envNameFor(leaf)
    if (!name) continue
    for (const key of [name, `${name}_FILE`]) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  }
  dataDir = join(mkdtempSync(join(tmpdir(), 'krantho-assistant-')), 'data')
  const input: KranthoConfigInput = {
    site: {
      domain: 'localhost',
      name: 'Assistant e2e',
      language: 'en',
      baseUrl: 'http://localhost:4010',
    },
    paths: { dataDir },
    auth: { mode: 'token', jwtSecret, token: { secret: 'shared-secret' } },
    assistant: { enabled: true },
  }
  handler = await createKranthoHandler({ config: input, collections })
})

afterEach(() => {
  vi.unstubAllGlobals()
  handler.close()
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(join(dataDir, '..'), { recursive: true, force: true })
})

/** An access token in the shape the API issues */
function accessToken(): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const now = Math.floor(Date.now() / 1000)
  const payload = encode({
    sub: 'u1',
    email: 'ada@example.com',
    name: 'Ada',
    roles: ['admin'],
    iat: now,
    exp: now + 300,
  })
  const signature = createHmac('sha256', jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url')
  return `${header}.${payload}.${signature}`
}

function api(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost:4010${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken()}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** One streamed OpenAI-format turn; `hold` keeps the body open until it resolves */
function sseTurn(chunks: object[], hold?: Promise<void>): Response {
  const encoder = new TextEncoder()
  const lines = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const last = lines.pop() ?? ''
        for (const line of lines) controller.enqueue(encoder.encode(line))
        await hold
        controller.enqueue(encoder.encode(`${last}data: [DONE]\n\n`))
        controller.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

function toolCallTurn(id: string, name: string, input: object): Response {
  return sseTurn([
    {
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(input) } }],
          },
        },
      ],
    },
    {
      choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 20, completion_tokens: 5 },
    },
  ])
}

function textTurn(text: string, hold?: Promise<void>): Response {
  return sseTurn(
    [
      { choices: [{ delta: { content: text } }] },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 30, completion_tokens: 3 },
      },
    ],
    hold,
  )
}

interface ServerSentEvent {
  event: string
  data: string
}

/** The events of a `text/event-stream` body as they arrive (the API writes `\n` line ends) */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerSentEvent> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true })
    let end = buffer.indexOf('\n\n')
    while (end >= 0) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const event = /^event: (.*)$/m.exec(block)?.[1]
      const data = /^data: (.*)$/m.exec(block)?.[1]
      if (event && data) yield { event, data }
      end = buffer.indexOf('\n\n')
    }
  }
}

async function events(response: Response): Promise<ServerSentEvent[]> {
  const all: ServerSentEvent[] = []
  for await (const event of readEvents(response.body as ReadableStream<Uint8Array>)) all.push(event)
  return all
}

const chat = (content: string) =>
  api('POST', '/api/assistant/chat', { messages: [{ role: 'user', content }] })

describe('the assistant on SQLite', () => {
  it('drafts through the chat, streaming, and publishes on confirm', async () => {
    const settings = await handler.handle(
      api('PUT', '/api/settings/llm', {
        provider: 'openai',
        apiKey: 'test',
        baseUrl: 'http://llm.test',
      }),
    )
    expect(settings.status).toBe(200)

    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const turns = [
      toolCallTurn('c1', 'create_draft', {
        collection: 'pages',
        slug: 'assistant-test',
        fields: { title: 'Opening hours' },
      }),
      textTurn('Created the draft.', held),
    ]
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe('http://llm.test/v1/chat/completions')
      const next = turns.shift()
      if (!next) throw new Error('no scripted turn left')
      return next
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await handler.handle(chat('Draft a page about our opening hours'))
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')

    // Events are readable while the model is still answering
    const iterator = readEvents(response.body as ReadableStream<Uint8Array>)
    const seen: string[] = []
    while (!seen.includes('text')) {
      const next = await iterator.next()
      if (next.done) throw new Error('stream ended before the text arrived')
      seen.push(next.value.event)
    }
    expect(seen).toEqual(['usage', 'tool', 'activity', 'text'])
    release()
    const rest: string[] = []
    for (let next = await iterator.next(); !next.done; next = await iterator.next())
      rest.push(next.value.event)
    expect(rest).toEqual(['usage', 'done'])

    const versions = await handler.handle(api('GET', '/api/content/pages/assistant-test/versions'))
    const history = (await versions.json()) as {
      versions: Array<{ changedBy: string; status: string }>
    }
    expect(history.versions[0]).toMatchObject({
      status: 'draft',
      changedBy: 'admin:ada@example.com via assistant',
    })

    turns.push(
      toolCallTurn('c2', 'publish_documents', {
        documents: [{ collection: 'pages', slug: 'assistant-test' }],
      }),
      textTurn('It waits for your confirmation.'),
    )
    const proposal = await events(await handler.handle(chat('Publish pages/assistant-test')))
    const activity = proposal.find((event) => event.event === 'activity')
    const token = (
      JSON.parse(activity?.data ?? '{}') as { activity: { pending?: { token: string } } }
    ).activity.pending?.token
    expect(token).toBeTypeOf('string')

    const confirmed = await handler.handle(api('POST', '/api/assistant/confirm', { token }))
    expect(confirmed.status).toBe(200)
    expect(await confirmed.json()).toMatchObject({ ok: true, results: [{ status: 'done' }] })

    const live = await handler.handle(api('GET', '/api/content/pages/assistant-test'))
    expect(((await live.json()) as { meta: { status: string } }).meta.status).toBe('published')
  })
})

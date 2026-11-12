import { vi } from 'vitest'

/**
 * Mock models for the providers the assistant reaches through the OpenAI-compatible
 * Chat Completions API. Each answers in the shape its vendor documents and rejects a
 * request the vendor is documented (or widely reported) to reject, so a test that
 * passes shows the assistant's requests are ones the vendor accepts.
 *
 * Sources: ai.google.dev/gemini-api/docs/openai (compatibility, `extra_content`
 * thought signatures), openrouter.ai/docs (streaming comments and errors, tool calling,
 * `reasoning_details`), docs.ollama.com/api/openai-compatibility and Ollama's
 * `openai/openai.go` (`tool_choice` is not read; arguments are a JSON string).
 */
export type Vendor = 'gemini' | 'openrouter' | 'ollama'

/** The assistant's request as the vendor receives it */
export interface WireRequest {
  url: string
  authorization: string | undefined
  model: string
  messages: WireMessage[]
  tools: WireTool[]
  toolChoice: unknown
  body: Record<string, unknown>
}

export interface WireMessage {
  role: string
  content?: unknown
  tool_calls?: Array<Record<string, unknown>>
  tool_call_id?: string
  reasoning_details?: unknown
}

export interface WireTool {
  type: string
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

/** One turn of the scripted model */
export interface ModelTurn {
  text?: string
  /** Tool calls, with arguments as the model would meet them in the declared schema */
  calls?: Array<{ name: string; args: Record<string, unknown> }>
  /** What the model says instead of calling tools when it is not offered any */
  textWithoutTools?: string
  /** An error the provider reports mid-stream, after the turn's text */
  streamError?: string
}

export interface VendorMockOptions {
  /** Fail every request with this HTTP status and message, in the vendor's error shape */
  failWith?: { status: number; message: string }
  /** An Ollama model that has no tool template */
  toolsSupported?: boolean
}

export interface VendorMock {
  fetch: ReturnType<typeof vi.fn>
  requests: WireRequest[]
}

const BASE_PATH: Record<Vendor, string> = {
  gemini: '/v1beta/openai/chat/completions',
  openrouter: '/v1/chat/completions',
  ollama: '/v1/chat/completions',
}

/** Where a vendor's tests point the provider's base URL */
export const BASE_URL: Record<Vendor, string> = {
  gemini: 'http://gemini.test/v1beta/openai',
  openrouter: 'http://openrouter.test',
  ollama: 'http://ollama.test',
}

const encoder = new TextEncoder()

function data(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`
}

function sse(chunks: string[]): Response {
  return new Response(encoder.encode(chunks.join('')), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function errorResponse(vendor: Vendor, status: number, message: string): Response {
  // Gemini's OpenAI-compatible endpoint wraps its error in an array
  const body =
    vendor === 'gemini'
      ? [{ error: { code: status, message, status: 'INVALID_ARGUMENT' } }]
      : vendor === 'ollama'
        ? { error: { message, type: 'api_error', param: null, code: null } }
        : { error: { code: status, message } }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function parse(url: string, init: RequestInit): WireRequest {
  const body = JSON.parse(String(init.body)) as Record<string, unknown>
  const headers = init.headers as Record<string, string>
  return {
    url,
    authorization: headers['authorization'],
    model: String(body['model']),
    messages: (body['messages'] ?? []) as WireMessage[],
    tools: (body['tools'] ?? []) as WireTool[],
    toolChoice: body['tool_choice'],
    body,
  }
}

/** Every `object` in a schema that names no properties, with its path */
function openObjects(schema: unknown, path: string, found: string[] = []): string[] {
  if (typeof schema !== 'object' || schema === null) return found
  const node = schema as Record<string, unknown>
  const properties = node['properties'] as Record<string, unknown> | undefined
  if (node['type'] === 'object' && (!properties || Object.keys(properties).length === 0)) {
    found.push(path)
  }
  for (const [name, value] of Object.entries(properties ?? {})) {
    openObjects(value, `${path}.${name}`, found)
  }
  openObjects(node['items'], `${path}[]`, found)
  return found
}

/** What a vendor refuses in a request, or null when it accepts it */
function refusal(
  vendor: Vendor,
  request: WireRequest,
  emitted: { signatures: string[]; reasoning: unknown[] },
  options: VendorMockOptions,
): string | null {
  const toolHistory = request.messages.filter((m) => m.role === 'tool' || m.tool_calls)
  if (vendor === 'gemini') {
    // Reported: Gemini rejects an OBJECT parameter with no properties
    for (const tool of request.tools) {
      const open = openObjects(tool.function.parameters, `${tool.function.name}.parameters`)
      if (open.length > 0) return `${open[0]}.properties: should be non-empty for OBJECT type`
    }
    // Documented: a function call's thought signature goes back in `extra_content`
    const turns = request.messages.filter((m) => m.tool_calls)
    for (const [turn, message] of turns.entries()) {
      const first = message.tool_calls?.[0]
      const extra = first?.['extra_content'] as
        | { google?: { thought_signature?: string } }
        | undefined
      if (extra?.google?.thought_signature !== emitted.signatures[turn]) {
        return 'Function call is missing a thought_signature in functionCall parts. This is required for tools to work correctly, and missing thought_signature may lead to degraded model performance.'
      }
    }
  }
  if (vendor === 'openrouter') {
    // Documented: the tools parameter must be in every request that carries tool history
    if (toolHistory.length > 0 && request.tools.length === 0) {
      return 'Tool calls and results in the conversation require the tools parameter'
    }
    // Documented: reasoning_details go back unmodified in the assistant message
    const turns = request.messages.filter((m) => m.tool_calls)
    for (const [turn, message] of turns.entries()) {
      if (JSON.stringify(message.reasoning_details) !== JSON.stringify(emitted.reasoning[turn])) {
        return 'reasoning_details must be passed back unmodified with the tool calls'
      }
    }
  }
  if (vendor === 'ollama' && options.toolsSupported === false && request.tools.length > 0) {
    return 'registry.ollama.ai/library/gemma:2b does not support tools'
  }
  return null
}

/** The arguments as a model that follows the declared schema writes them: an object a string was declared for is JSON */
function followDeclaration(
  tool: WireTool | undefined,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const properties = (tool?.function.parameters['properties'] ?? {}) as Record<
    string,
    { type?: string }
  >
  return Object.fromEntries(
    Object.entries(args).map(([name, value]) => [
      name,
      properties[name]?.type === 'string' && typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : value,
    ]),
  )
}

/** The stream of one turn, in the vendor's shape */
function stream(
  vendor: Vendor,
  turn: ModelTurn,
  request: WireRequest,
  emitted: { signatures: string[]; reasoning: unknown[] },
  index: number,
): Response {
  // Ollama does not read tool_choice: it calls a tool whenever it is offered tools
  const offered = request.tools.length > 0
  const forbidden = vendor !== 'ollama' && request.toolChoice === 'none'
  const mayCall = offered && !forbidden
  const calls = mayCall ? (turn.calls ?? []) : []
  const text = calls.length > 0 ? turn.text : (turn.textWithoutTools ?? turn.text)
  const chunks: string[] = []
  if (vendor === 'openrouter') chunks.push(': OPENROUTER PROCESSING\n\n')
  if (text)
    chunks.push(data({ choices: [{ index: 0, delta: { role: 'assistant', content: text } }] }))
  if (calls.length > 0) {
    const tools = calls.map((call, position) => {
      const declared = request.tools.find((tool) => tool.function.name === call.name)
      const wire: Record<string, unknown> = {
        id: `call_${String(index)}_${String(position)}`,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(followDeclaration(declared, call.args)),
        },
      }
      if (vendor !== 'gemini') wire['index'] = position
      if (vendor === 'gemini' && position === 0) {
        const signature = `sig-${String(emitted.signatures.length)}`
        emitted.signatures.push(signature)
        wire['extra_content'] = { google: { thought_signature: signature } }
      }
      return wire
    })
    if (vendor === 'openrouter') {
      const details = [{ type: 'reasoning.encrypted', data: `enc-${String(index)}` }]
      emitted.reasoning.push(details)
      chunks.push(data({ choices: [{ index: 0, delta: { reasoning_details: details } }] }))
    }
    chunks.push(data({ choices: [{ index: 0, delta: { tool_calls: tools } }] }))
  }
  if (turn.streamError !== undefined) {
    chunks.push(
      data({
        error: { code: 502, message: turn.streamError },
        choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }],
      }),
    )
    return sse(chunks)
  }
  // Gemini reports `stop` even for a turn that calls tools; Ollama's layer remaps to tool_calls
  const finish = calls.length > 0 && vendor !== 'gemini' ? 'tool_calls' : 'stop'
  chunks.push(data({ choices: [{ index: 0, delta: {}, finish_reason: finish }] }))
  // Ollama's layer never reports usage: the stream_options field is accepted and unread
  if (vendor !== 'ollama') {
    chunks.push(data({ choices: [], usage: { prompt_tokens: 120 + index, completion_tokens: 20 } }))
  }
  chunks.push('data: [DONE]\n\n')
  return sse(chunks)
}

/** A fetch stub that plays `turns` as the vendor's model, one per request */
export function vendorMock(
  vendor: Vendor,
  turns: ModelTurn[],
  options: VendorMockOptions = {},
): VendorMock {
  const requests: WireRequest[] = []
  const emitted = { signatures: [] as string[], reasoning: [] as unknown[] }
  const fetchMock = vi.fn(async (input: unknown, init: RequestInit) => {
    const url = String(input)
    const request = parse(url, init)
    requests.push(request)
    if (new URL(url).pathname !== BASE_PATH[vendor]) {
      return errorResponse(vendor, 404, `No route for ${url}`)
    }
    if (options.failWith) {
      return errorResponse(vendor, options.failWith.status, options.failWith.message)
    }
    // Ollama ignores the credential
    if (vendor !== 'ollama' && request.authorization !== 'Bearer test-key') {
      return errorResponse(vendor, 401, 'Incorrect API key provided')
    }
    const refused = refusal(vendor, request, emitted, options)
    if (refused !== null) return errorResponse(vendor, 400, refused)
    const turn = turns[requests.length - 1] ?? { text: '(the script has no more turns)' }
    return stream(vendor, turn, request, emitted, requests.length - 1)
  })
  return { fetch: fetchMock, requests }
}

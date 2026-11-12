import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * A language model that answers from a script, speaking the OpenAI-compatible
 * Chat Completions stream (the `ollama` provider's wire format, which needs no
 * credential). A spec points the site's AI provider at it, so the assistant
 * runs its whole path (tool calls, drafts, confirmation) with no real model and
 * no cost.
 *
 * The model answers a user message with the script step whose `prompt` equals
 * it: one tool call; once the tool's result comes back, the step's `reply`.
 */
export interface ScriptStep {
  /** The user message this step answers, exactly */
  prompt: string
  /** The tool the model calls first, with its input */
  call: { name: string; input: Record<string, unknown> }
  /** What the model says once the tool has answered */
  reply: string
}

/** What a request to the model carried, for a spec to check */
export interface ModelRequest {
  /** The tools the site offered the model, by name */
  tools: string[]
  /** The last message's role */
  last: string
}

export interface FakeModel {
  /** The base URL to give the AI provider settings */
  baseUrl: string
  /** Every request the model has answered, oldest first */
  requests: ModelRequest[]
  stop: () => Promise<void>
}

interface WireMessage {
  role: string
  content?: unknown
}

interface WireRequest {
  messages?: WireMessage[]
  tools?: Array<{ function?: { name?: string } }>
}

function chunk(delta: Record<string, unknown>, finish: string | null = null): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
}

function usage(): string {
  const counts = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
  return `data: ${JSON.stringify({ choices: [], usage: counts })}\n\n`
}

function toolTurn(step: ScriptStep): string {
  const call = {
    index: 0,
    id: 'call_e2e_1',
    type: 'function',
    function: { name: step.call.name, arguments: JSON.stringify(step.call.input) },
  }
  return (
    chunk({ role: 'assistant', tool_calls: [call] }) +
    chunk({}, 'tool_calls') +
    usage() +
    'data: [DONE]\n\n'
  )
}

function textTurn(text: string): string {
  const [first = '', ...rest] = text.split(' ')
  return (
    chunk({ role: 'assistant', content: first }) +
    (rest.length > 0 ? chunk({ content: ` ${rest.join(' ')}` }) : '') +
    chunk({}, 'stop') +
    usage() +
    'data: [DONE]\n\n'
  )
}

async function readBody(req: IncomingMessage): Promise<WireRequest> {
  const parts: Buffer[] = []
  for await (const part of req) parts.push(part as Buffer)
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as WireRequest
}

/** The step a conversation is in: the one answering its last user message */
function stepFor(messages: WireMessage[], script: ScriptStep[]): ScriptStep | undefined {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user')
  return script.find((step) => step.prompt === lastUser?.content)
}

/** Start the model on a free port of this machine */
export async function startFakeModel(script: ScriptStep[]): Promise<FakeModel> {
  const requests: ModelRequest[] = []
  const server: Server = createServer((req, res) => {
    void (async () => {
      if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
        res.writeHead(404).end()
        return
      }
      const body = await readBody(req)
      const messages = body.messages ?? []
      const last = messages.at(-1)?.role ?? ''
      requests.push({
        tools: (body.tools ?? []).flatMap((tool) =>
          tool.function?.name ? [tool.function.name] : [],
        ),
        last,
      })
      const step = stepFor(messages, script)
      const turn = !step
        ? textTurn('The e2e model has no script for this message.')
        : last === 'tool'
          ? textTurn(step.reply)
          : toolTurn(step)
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      res.end(turn)
    })()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

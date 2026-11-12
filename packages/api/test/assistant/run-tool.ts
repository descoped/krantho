import { vi } from 'vitest'
import { executeTool } from '../../src/assistant/agent-loop.js'
import { ASSISTANT_TOOLS } from '../../src/assistant/tool-registry.js'
import type { ToolOutcome } from '../../src/assistant/tools/define-tool.js'
import { createFramer } from '../../src/assistant/untrusted.js'
import { WritePolicy } from '../../src/assistant/write-policy.js'
import type { ApiContext } from '../../src/types.js'
import { storeKey } from '../fake-vault.js'

/** One chat request's tool state: the write policy and the framer shared by its calls */
export interface RequestState {
  writes: WritePolicy
  frame: (source: string, text: string) => string
  spend: (usage: { inputTokens: number; outputTokens: number }) => void
}

export function newRequest(): RequestState {
  return { writes: new WritePolicy(), frame: createFramer().frame, spend: () => {} }
}

/** Run a tool by name as the loop does: its schema validates the input first */
export function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ApiContext,
  request: RequestState = newRequest(),
): Promise<ToolOutcome> {
  const tool = ASSISTANT_TOOLS.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`No tool ${name}`)
  return executeTool(tool, input, {
    ctx,
    callId: 'call-1',
    writes: request.writes,
    frame: request.frame,
    signal: new AbortController().signal,
    spend: request.spend,
  })
}

/**
 * Store LLM settings the way Studio does (provider openai at a test URL) and
 * answer every completion with `content`.
 */
export async function fakeCompletion(
  settings: { setSetting(key: string, value: string): Promise<void> },
  content: Record<string, unknown>,
): Promise<ReturnType<typeof vi.fn>> {
  await settings.setSetting('llm.provider', 'openai')
  await storeKey(settings, 'openai', 'test-key')
  await settings.setSetting('llm.baseUrl.openai', 'http://llm.test')
  const fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          model: 'test',
          choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

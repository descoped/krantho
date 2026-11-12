import { parseServerSentEvents } from '@krantho/ai'
import { describe, expect, it } from 'vitest'
import {
  diffDocument,
  isOverwrite,
  listSections,
  replaceSections,
} from '../src/assistant/document-change.js'
import type { AssistantEvent } from '../src/assistant/protocol.js'
import { createEventStream, encodeEvent } from '../src/assistant/sse-stream.js'
import { WritePolicy } from '../src/assistant/write-policy.js'

async function collect(stream: ReadableStream<Uint8Array>): Promise<AssistantEvent[]> {
  const events: AssistantEvent[] = []
  for await (const event of parseServerSentEvents(stream)) events.push(JSON.parse(event.data))
  return events
}

describe('createEventStream', () => {
  it('encodes each event with its type as the event name', () => {
    expect(encodeEvent({ type: 'done', reason: 'end_turn' })).toBe(
      'event: done\ndata: {"type":"done","reason":"end_turn"}\n\n',
    )
  })

  it('turns an exception escaping the run into an internal error and done', async () => {
    const stream = createEventStream(async (emit) => {
      emit({ type: 'text', text: 'partial' })
      throw new Error('secret detail')
    }, undefined)
    const events = await collect(stream)
    expect(events).toEqual([
      { type: 'text', text: 'partial' },
      { type: 'error', code: 'internal', message: 'The assistant failed unexpectedly.' },
      { type: 'done', reason: 'error' },
    ])
  })

  it('aborts the run when the client cancels the stream or the request aborts', async () => {
    let seen: AbortSignal | undefined
    const cancelled = createEventStream(async (_emit, signal) => {
      seen = signal
      await new Promise((resolve) => signal.addEventListener('abort', resolve))
    }, undefined)
    await cancelled.cancel()
    expect(seen?.aborted).toBe(true)

    const upstream = new AbortController()
    let aborted = false
    const stream = createEventStream(async (emit, signal) => {
      await new Promise((resolve) => signal.addEventListener('abort', resolve))
      aborted = true
      emit({ type: 'done', reason: 'aborted' })
    }, upstream.signal)
    upstream.abort()
    expect(await collect(stream)).toEqual([{ type: 'done', reason: 'aborted' }])
    expect(aborted).toBe(true)
  })
})

describe('document changes', () => {
  const ref = { collection: 'pages', slug: 'a', locale: 'en' }

  it('diffs fields and body, leaving status to the caller', () => {
    const change = diffDocument(
      ref,
      2,
      { fields: { title: 'A', tags: ['x'], status: 'published' }, body: 'old' },
      { fields: { title: 'A', tags: ['x', 'y'], extra: 1, status: 'draft' }, body: 'new' },
    )
    expect(change.fields).toEqual([
      { name: 'tags', before: ['x'], after: ['x', 'y'] },
      { name: 'extra', before: undefined, after: 1 },
    ])
    expect(change.body).toEqual({ before: 'old', after: 'new' })
    expect(isOverwrite(change)).toBe(true)
  })

  it('treats filling empty values as no overwrite', () => {
    const change = diffDocument(
      ref,
      1,
      { fields: { title: 'A', description: '', tags: [] }, body: '  ' },
      { fields: { title: 'A', description: 'D', tags: ['t'] }, body: 'Body' },
    )
    expect(isOverwrite(change)).toBe(false)
  })

  it('lists and replaces ## sections, ignoring headings in code fences', () => {
    const body = '# Title\n\n## One\n\nFirst.\n\n```\n## Not a section\n```\n\n## Two ##\n\nSecond.'
    expect(listSections(body)).toEqual(['One', 'Two'])
    expect(replaceSections(body, [{ heading: 'two', content: 'Changed.' }])).toBe(
      '# Title\n\n## One\n\nFirst.\n\n```\n## Not a section\n```\n\n## Two ##\n\nChanged.',
    )
    expect(replaceSections(body, [{ heading: 'One', content: 'New first.\n' }])).toBe(
      '# Title\n\n## One\n\nNew first.\n\n## Two ##\n\nSecond.',
    )
    expect(() => replaceSections(body, [{ heading: 'Three', content: 'x' }])).toThrow(
      'No section "Three"',
    )
  })
})

describe('WritePolicy', () => {
  const change = (slug: string, baseVersion: number, before: unknown) => ({
    ref: { collection: 'pages', slug, locale: 'en' },
    baseVersion,
    fields: [{ name: 'title', before, after: 'x' }],
  })

  it('writes one new or filled document at once and shows everything else first', () => {
    const policy = new WritePolicy()
    expect(policy.decide(change('a', 1, 'old'))).toBe('confirm')
    const filled = change('a', 1, '')
    expect(policy.decide(filled)).toBe('write')
    policy.recordWrite(filled)
    expect(policy.decide(change('a', 2, ''))).toBe('write')
    expect(policy.decide(change('b', 0, undefined))).toBe('confirm')
  })

  it('keeps writing a document created in the request, even over its own text', () => {
    const policy = new WritePolicy()
    const created = change('new', 0, undefined)
    policy.recordWrite(created)
    expect(policy.decide(change('new', 1, 'x'))).toBe('write')
  })
})

import { describe, expect, it } from 'vitest'
import { parseServerSentEvents, type ServerSentEvent } from '../src/sse.js'
import { byteStream, type Chunk } from './chat-fixtures.js'

async function parse(chunks: Chunk[]): Promise<ServerSentEvent[]> {
  const out: ServerSentEvent[] = []
  for await (const event of parseServerSentEvents(byteStream(chunks))) out.push(event)
  return out
}

describe('parseServerSentEvents', () => {
  it('dispatches an event on a blank line with the default name', async () => {
    expect(await parse(['data: one\n\ndata: two\n\n'])).toEqual([
      { event: 'message', data: 'one' },
      { event: 'message', data: 'two' },
    ])
  })

  it('reads event names and ids', async () => {
    expect(await parse(['event: ping\nid: 7\ndata: {}\n\n'])).toEqual([
      { event: 'ping', data: '{}', id: '7' },
    ])
  })

  it('accepts \\r\\n, \\r and \\n line endings', async () => {
    expect(await parse(['data: a\r\n\r\ndata: b\r\rdata: c\n\n'])).toEqual([
      { event: 'message', data: 'a' },
      { event: 'message', data: 'b' },
      { event: 'message', data: 'c' },
    ])
  })

  it('treats a \\r at a chunk end as possibly half of \\r\\n', async () => {
    expect(await parse(['data: a\r', '\n\r', '\ndata: b\n\n'])).toEqual([
      { event: 'message', data: 'a' },
      { event: 'message', data: 'b' },
    ])
  })

  it('ignores comment lines, retry and unknown fields', async () => {
    const events = await parse([': OPENROUTER PROCESSING\n\nretry: 10\nfoo: bar\ndata: x\n\n'])
    expect(events).toEqual([{ event: 'message', data: 'x' }])
  })

  it('joins multi-line data with \\n and strips only one leading space', async () => {
    expect(await parse(['data:first\ndata:  second\ndata\n\n'])).toEqual([
      { event: 'message', data: 'first\n second\n' },
    ])
  })

  it('does not dispatch an event without data', async () => {
    expect(await parse(['event: empty\n\ndata: kept\n\n'])).toEqual([
      { event: 'message', data: 'kept' },
    ])
  })

  it('reassembles lines split across chunks', async () => {
    expect(await parse(['event: mes', 'sage_start\nda', 'ta: {"a"', ':1}\n', '\n'])).toEqual([
      { event: 'message_start', data: '{"a":1}' },
    ])
  })

  it('decodes a multibyte character split across chunks', async () => {
    const bytes = new TextEncoder().encode('data: blåbær ✓\n\n')
    const cut = bytes.indexOf(0xc3) + 1
    expect(await parse([bytes.slice(0, cut), bytes.slice(cut, -3), bytes.slice(-3)])).toEqual([
      { event: 'message', data: 'blåbær ✓' },
    ])
  })

  it('dispatches a final event not followed by a blank line', async () => {
    expect(await parse(['data: one\n\ndata: last'])).toEqual([
      { event: 'message', data: 'one' },
      { event: 'message', data: 'last' },
    ])
  })

  it('cancels the reader when the consumer stops early', async () => {
    let cancelled = false
    const body = byteStream(['data: one\n\n', 'data: two\n\n'], {
      hang: true,
      onCancel: () => {
        cancelled = true
      },
    })
    for await (const event of parseServerSentEvents(body)) {
      expect(event.data).toBe('one')
      break
    }
    expect(cancelled).toBe(true)
    expect(body.locked).toBe(false)
  })

  it('ends iteration when the signal aborts during a pending read', async () => {
    const controller = new AbortController()
    let cancelled = false
    const body = byteStream(['data: one\n\n'], {
      hang: true,
      onCancel: () => {
        cancelled = true
      },
    })
    const seen: string[] = []
    for await (const event of parseServerSentEvents(body, controller.signal)) {
      seen.push(event.data)
      setTimeout(() => controller.abort(), 0)
    }
    expect(seen).toEqual(['one'])
    expect(cancelled).toBe(true)
  })

  it('yields nothing when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const seen: ServerSentEvent[] = []
    for await (const event of parseServerSentEvents(
      byteStream(['data: x\n\n']),
      controller.signal,
    )) {
      seen.push(event)
    }
    expect(seen).toEqual([])
  })
})

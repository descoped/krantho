import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { writeResponseHeaders, writeWebResponse } from '../src/node-response.js'

/** Minimal ServerResponse capturing setHeader calls. */
function fakeRes(): { res: ServerResponse; headers: Map<string, string | string[]> } {
  const headers = new Map<string, string | string[]>()
  const res = {
    setHeader(name: string, value: string | number | readonly string[]): void {
      headers.set(name.toLowerCase(), Array.isArray(value) ? [...value] : (value as string))
    },
  } as unknown as ServerResponse
  return { res, headers }
}

describe('writeResponseHeaders', () => {
  it('emits each Set-Cookie as a distinct array entry, not a folded string', () => {
    const webHeaders = new Headers()
    webHeaders.append('set-cookie', 'krantho_access=a; Path=/')
    webHeaders.append('set-cookie', 'krantho_refresh=r; Path=/')
    webHeaders.set('content-type', 'application/json')
    const response = new Response('{}', { headers: webHeaders })

    const { res, headers } = fakeRes()
    writeResponseHeaders(res, response)

    expect(headers.get('set-cookie')).toEqual([
      'krantho_access=a; Path=/',
      'krantho_refresh=r; Path=/',
    ])
    expect(headers.get('content-type')).toBe('application/json')
  })

  it('does not set Set-Cookie when the response carries none', () => {
    const response = new Response('{}', { headers: { 'content-type': 'application/json' } })
    const { res, headers } = fakeRes()

    writeResponseHeaders(res, response)

    expect(headers.has('set-cookie')).toBe(false)
    expect(headers.get('content-type')).toBe('application/json')
  })
})

/** A ServerResponse stand-in that records what is written, with a controllable `write` result */
class FakeResponse extends EventEmitter {
  statusCode = 0
  headers = new Map<string, string | string[]>()
  writes: Uint8Array[] = []
  ended = 0
  destroyed = false
  destroyError: Error | undefined
  writableFinished = false
  headersFlushed = false
  /** What each `write` returns; false makes the writer wait for `drain` */
  writeResult = true

  setHeader(name: string, value: string | readonly string[]): void {
    this.headers.set(name.toLowerCase(), typeof value === 'string' ? value : [...value])
  }
  flushHeaders(): void {
    this.headersFlushed = true
  }
  write(chunk: Uint8Array): boolean {
    this.writes.push(chunk)
    return this.writeResult
  }
  end(): void {
    this.ended++
    this.writableFinished = true
    this.emit('close')
  }
  destroy(err?: Error): void {
    this.destroyed = true
    this.destroyError = err
    this.emit('close')
  }
}

function asRes(fake: FakeResponse): ServerResponse {
  return fake as unknown as ServerResponse
}

/** A stream whose chunks the test pushes one by one */
function pushStream(): {
  stream: ReadableStream<Uint8Array>
  push: (text: string) => void
  close: () => void
  fail: (err: Error) => void
  cancelled: () => boolean
} {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let wasCancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel() {
      wasCancelled = true
    },
  })
  const encoder = new TextEncoder()
  return {
    stream,
    push: (text) => controller.enqueue(encoder.encode(text)),
    close: () => controller.close(),
    fail: (err) => controller.error(err),
    cancelled: () => wasCancelled,
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('writeWebResponse', () => {
  it('writes each chunk as it arrives, before the body closes, and ends once', async () => {
    const fake = new FakeResponse()
    const source = pushStream()
    const response = new Response(source.stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })

    const done = writeWebResponse(asRes(fake), response)
    source.push('event: text\ndata: 1\n\n')
    await tick()
    expect(fake.statusCode).toBe(200)
    expect(fake.headersFlushed).toBe(true)
    expect(fake.headers.get('content-type')).toBe('text/event-stream')
    expect(fake.writes).toHaveLength(1)
    expect(fake.ended).toBe(0)

    source.push('event: done\ndata: {}\n\n')
    source.close()
    await done
    expect(fake.writes).toHaveLength(2)
    expect(fake.ended).toBe(1)
  })

  it('waits for drain when the socket buffer is full', async () => {
    const fake = new FakeResponse()
    fake.writeResult = false
    const source = pushStream()
    const done = writeWebResponse(asRes(fake), new Response(source.stream))

    source.push('a')
    source.push('b')
    source.close()
    await tick()
    expect(fake.writes).toHaveLength(1)

    fake.writeResult = true
    fake.emit('drain')
    await done
    expect(fake.writes).toHaveLength(2)
    expect(fake.ended).toBe(1)
  })

  it('cancels the body when the client goes away first', async () => {
    const fake = new FakeResponse()
    const source = pushStream()
    const done = writeWebResponse(asRes(fake), new Response(source.stream))

    source.push('first')
    await tick()
    fake.destroyed = true
    fake.emit('close')
    await done
    expect(source.cancelled()).toBe(true)
    expect(fake.ended).toBe(0)
  })

  it('destroys the response when the body fails after the headers were sent', async () => {
    const fake = new FakeResponse()
    const source = pushStream()
    const done = writeWebResponse(asRes(fake), new Response(source.stream))

    source.push('partial')
    await tick()
    source.fail(new Error('upstream broke'))
    await done
    expect(fake.destroyed).toBe(true)
    expect(fake.destroyError?.message).toBe('upstream broke')
    expect(fake.ended).toBe(0)
  })

  it('keeps binary bytes intact', async () => {
    const fake = new FakeResponse()
    const bytes = new Uint8Array([0, 255, 137, 80, 78, 71, 13, 10, 26, 10, 128])
    await writeWebResponse(asRes(fake), new Response(bytes, { status: 200 }))

    const written = Buffer.concat(fake.writes.map((chunk) => Buffer.from(chunk)))
    expect([...written]).toEqual([...bytes])
    expect(fake.ended).toBe(1)
  })

  it('ends a response without a body', async () => {
    const fake = new FakeResponse()
    await writeWebResponse(asRes(fake), new Response(null, { status: 304 }))
    expect(fake.statusCode).toBe(304)
    expect(fake.writes).toHaveLength(0)
    expect(fake.ended).toBe(1)
  })
})

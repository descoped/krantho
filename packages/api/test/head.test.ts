import { describe, expect, it } from 'vitest'
import { answerHead } from '../src/head.js'
import type { ApiRequest, ApiResponse } from '../src/types.js'

const request: ApiRequest = { method: 'HEAD', path: '/api/thing', params: {}, query: {} }

function answering(response: ApiResponse) {
  const seen: string[] = []
  const handle = async (req: ApiRequest): Promise<ApiResponse> => {
    seen.push(req.method)
    return response
  }
  return { handle, seen }
}

describe('answerHead', () => {
  it('runs the request as GET and drops the body', async () => {
    const { handle, seen } = answering({ status: 200, body: { ok: true } })
    const res = await answerHead(request, handle)

    expect(seen).toEqual(['GET'])
    expect(res).toEqual({
      status: 200,
      body: null,
      headers: { 'content-type': 'application/json' },
    })
  })

  it('keeps a content type the handler named, in any letter case', async () => {
    const { handle } = answering({
      status: 200,
      body: '<x/>',
      headers: { 'Content-Type': 'image/svg+xml' },
    })
    const res = await answerHead(request, handle)

    expect(res.headers).toEqual({ 'Content-Type': 'image/svg+xml' })
  })

  it('gives strings, bytes and streams the type they are served with', async () => {
    const text = await answerHead(request, answering({ status: 200, body: 'hello' }).handle)
    const bytes = await answerHead(
      request,
      answering({ status: 200, body: new Uint8Array([1]) }).handle,
    )

    expect(text.headers?.['content-type']).toBe('text/plain')
    expect(bytes.headers?.['content-type']).toBe('application/octet-stream')
  })

  it('cancels a stream body instead of leaving it unread', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true
      },
    })
    const res = await answerHead(request, answering({ status: 200, body }).handle)

    expect(cancelled).toBe(true)
    expect(res.body).toBeNull()
    expect(res.headers?.['content-type']).toBe('application/octet-stream')
  })

  it('keeps the status, cookies and headers of an error or redirect', async () => {
    const res = await answerHead(
      request,
      answering({
        status: 302,
        body: null,
        headers: { Location: '/elsewhere' },
        cookies: ['a=1; Path=/'],
      }).handle,
    )

    expect(res).toEqual({
      status: 302,
      body: null,
      headers: { Location: '/elsewhere' },
      cookies: ['a=1; Path=/'],
    })
  })
})

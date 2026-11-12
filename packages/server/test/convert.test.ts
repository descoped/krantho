import { describe, expect, it } from 'vitest'
import { toApiRequest, toResponse } from '../src/convert.js'

describe('toApiRequest', () => {
  it('extracts method and path from GET request', async () => {
    const request = new Request('http://localhost:3000/api/content/blog')
    const result = await toApiRequest(request)

    expect(result.method).toBe('GET')
    expect(result.path).toBe('/api/content/blog')
    expect(result.params).toEqual({})
  })

  it('extracts query parameters', async () => {
    const request = new Request('http://localhost:3000/api/content/blog?status=published&limit=10')
    const result = await toApiRequest(request)

    expect(result.query['status']).toBe('published')
    expect(result.query['limit']).toBe('10')
  })

  it('extracts headers as lowercase keys', async () => {
    const request = new Request('http://localhost:3000/api/collections', {
      headers: { Authorization: 'Bearer test-token', 'X-Custom': 'value' },
    })
    const result = await toApiRequest(request)

    expect(result.headers?.['authorization']).toBe('Bearer test-token')
    expect(result.headers?.['x-custom']).toBe('value')
  })

  it('parses JSON body from POST request', async () => {
    const request = new Request('http://localhost:3000/api/content/blog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'test', frontmatter: { title: 'Test' }, body: '# Hello' }),
    })
    const result = await toApiRequest(request)

    expect(result.method).toBe('POST')
    const body = result.body as Record<string, unknown>
    expect(body['slug']).toBe('test')
  })

  it('handles PUT request with body', async () => {
    const request = new Request('http://localhost:3000/api/content/blog/test', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frontmatter: { title: 'Updated' } }),
    })
    const result = await toApiRequest(request)

    expect(result.method).toBe('PUT')
    expect(result.body).toBeDefined()
  })

  it('handles DELETE request without body', async () => {
    const request = new Request('http://localhost:3000/api/content/blog/test', {
      method: 'DELETE',
    })
    const result = await toApiRequest(request)

    expect(result.method).toBe('DELETE')
    expect(result.body).toBeUndefined()
  })

  it('handles GET request with empty query', async () => {
    const request = new Request('http://localhost:3000/api/collections')
    const result = await toApiRequest(request)

    expect(result.query).toEqual({})
  })

  it('handles malformed JSON body gracefully', async () => {
    const request = new Request('http://localhost:3000/api/content/blog', {
      method: 'POST',
      body: 'not-json',
    })
    const result = await toApiRequest(request)

    expect(result.body).toBeUndefined()
  })
})

describe('toResponse', () => {
  it('creates JSON response with status 200', () => {
    const response = toResponse({
      status: 200,
      body: { slug: 'test', collection: 'blog' },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
  })

  it('serializes body as JSON', async () => {
    const response = toResponse({
      status: 200,
      body: { items: [{ slug: 'a' }, { slug: 'b' }] },
    })

    const json = (await response.json()) as Record<string, unknown>
    const items = json['items'] as Array<{ slug: string }>
    expect(items).toHaveLength(2)
  })

  it('preserves error status codes', () => {
    const response = toResponse({
      status: 404,
      body: { error: 'Not found' },
    })

    expect(response.status).toBe(404)
  })

  it('preserves 422 validation errors', () => {
    const response = toResponse({
      status: 422,
      body: { error: 'Validation failed', details: [] },
    })

    expect(response.status).toBe(422)
  })

  it('merges custom headers', () => {
    const response = toResponse({
      status: 200,
      body: {},
      headers: { 'x-request-id': 'abc-123' },
    })

    expect(response.headers.get('x-request-id')).toBe('abc-123')
    expect(response.headers.get('content-type')).toBe('application/json')
  })

  it('emits each cookie as a separate Set-Cookie line (RFC 6265, not folded)', () => {
    const access = 'krantho_access=a; HttpOnly; SameSite=Lax; Path=/; Max-Age=900'
    const refresh = 'krantho_refresh=r; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000'
    const response = toResponse({
      status: 200,
      body: {},
      cookies: [access, refresh],
    })

    expect(response.headers.getSetCookie()).toEqual([access, refresh])
  })

  it('carries cookies alongside a Location header (302)', () => {
    const response = toResponse({
      status: 302,
      body: null,
      headers: { Location: '/studio/' },
      cookies: ['krantho_access=a; Path=/', 'krantho_refresh=r; Path=/'],
    })

    expect(response.headers.get('location')).toBe('/studio/')
    expect(response.headers.getSetCookie()).toHaveLength(2)
  })
})

describe('toResponse with a stream body', () => {
  it('passes the stream through unread, with its headers and cookies', async () => {
    let pulled = 0
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(encoder.encode(`event: text\ndata: ${pulled}\n\n`))
        if (pulled === 2) controller.close()
      },
    })

    const response = toResponse({
      status: 200,
      body,
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
      cookies: ['a=1; Path=/'],
    })

    expect(response.body).toBe(body)
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8')
    expect(response.headers.getSetCookie()).toEqual(['a=1; Path=/'])
    expect(await response.text()).toBe('event: text\ndata: 1\n\nevent: text\ndata: 2\n\n')
  })

  it('defaults a stream without a content type to octet-stream', () => {
    const response = toResponse({ status: 200, body: new ReadableStream() })
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
  })
})

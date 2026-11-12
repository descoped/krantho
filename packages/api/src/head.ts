import type { ApiRequest, ApiResponse } from './types.js'

/** The content type a response body is served with when the handler names none */
function defaultContentType(body: unknown): string | undefined {
  if (body === null || body === undefined) return undefined
  if (body instanceof ReadableStream || body instanceof Uint8Array)
    return 'application/octet-stream'
  if (typeof body === 'string') return 'text/plain'
  return 'application/json'
}

/**
 * Answer a HEAD request the way GET answers it, without the body (RFC 9110,
 * section 9.3.2): the GET route runs, and its status, headers and cookies are
 * kept. The content type the body would have been served with is kept too,
 * since the response no longer carries the body that decides it.
 */
export async function answerHead(
  req: ApiRequest,
  handle: (req: ApiRequest) => Promise<ApiResponse>,
): Promise<ApiResponse> {
  const response = await handle({ ...req, method: 'GET' })
  const headers = { ...response.headers }
  const named = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')
  const contentType = named ? undefined : defaultContentType(response.body)
  if (contentType) headers['content-type'] = contentType
  if (response.body instanceof ReadableStream) await response.body.cancel()
  return { ...response, headers, body: null }
}

import type { ApiRequest, ApiResponse } from '@krantho/api'

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Check whether the content-type header indicates multipart form data.
 */
function isMultipart(headers: Record<string, string>): boolean {
  const ct = headers['content-type'] ?? ''
  return ct.startsWith('multipart/form-data')
}

/**
 * Parse multipart form data from a Request into the files array format
 * expected by ApiRequest.
 */
async function parseMultipartFiles(request: Request): Promise<{
  files: Array<{ name: string; data: Uint8Array; filename: string; mimeType: string }>
  body: Record<string, unknown>
}> {
  const formData = await request.formData()
  const files: Array<{ name: string; data: Uint8Array; filename: string; mimeType: string }> = []
  const body: Record<string, unknown> = {}

  for (const [key, value] of formData) {
    if (value instanceof File) {
      const buffer = await value.arrayBuffer()
      files.push({
        name: key,
        data: new Uint8Array(buffer),
        filename: value.name,
        mimeType: value.type || 'application/octet-stream',
      })
    } else {
      body[key] = value
    }
  }

  return { files, body }
}

/**
 * Convert a Web Request to a framework-agnostic ApiRequest.
 *
 * Extracts method, path, query parameters, headers, and body.
 * Supports both JSON and multipart/form-data content types.
 * The `/api` prefix is preserved — the API router expects it.
 */
export async function toApiRequest(request: Request): Promise<ApiRequest> {
  const url = new URL(request.url)
  const method = request.method.toUpperCase()

  const query: Record<string, string> = {}
  for (const [key, value] of url.searchParams) {
    query[key] = value
  }

  const headers: Record<string, string> = {}
  for (const [key, value] of request.headers) {
    headers[key.toLowerCase()] = value
  }

  let body: unknown
  let files:
    | Array<{ name: string; data: Uint8Array; filename: string; mimeType: string }>
    | undefined

  if (METHODS_WITH_BODY.has(method) && request.body) {
    if (isMultipart(headers)) {
      const parsed = await parseMultipartFiles(request)
      files = parsed.files
      body = parsed.body
    } else {
      try {
        body = await request.json()
      } catch {
        // Non-JSON body or empty — leave undefined
      }
    }
  }

  return {
    method,
    path: url.pathname,
    params: {},
    query,
    body,
    headers,
    rawRequest: request,
    files,
  }
}

/**
 * Convert a framework-agnostic ApiResponse to a Web Response.
 *
 * Handles JSON bodies (default), binary bodies (Buffer/Uint8Array for image
 * serving) and stream bodies (a `ReadableStream`, passed through unread). Content-Type is set from response headers if present,
 * otherwise defaults to application/json.
 */
export function toResponse(apiResponse: ApiResponse): Response {
  const responseHeaders = new Headers()

  if (apiResponse.headers) {
    for (const [key, value] of Object.entries(apiResponse.headers)) {
      responseHeaders.set(key, value)
    }
  }

  // Emit each cookie as its own Set-Cookie header line (RFC 6265). Headers.append
  // accumulates, and the resulting Response exposes them via headers.getSetCookie().
  if (apiResponse.cookies) {
    for (const cookie of apiResponse.cookies) {
      responseHeaders.append('set-cookie', cookie)
    }
  }

  // Stream body (e.g. server-sent events) — passed through unread
  if (apiResponse.body instanceof ReadableStream) {
    if (!responseHeaders.has('content-type')) {
      responseHeaders.set('content-type', 'application/octet-stream')
    }
    return new Response(apiResponse.body, {
      status: apiResponse.status,
      headers: responseHeaders,
    })
  }

  // Binary body (Buffer or Uint8Array) — pass raw bytes
  if (apiResponse.body instanceof Uint8Array || Buffer.isBuffer(apiResponse.body)) {
    if (!responseHeaders.has('content-type')) {
      responseHeaders.set('content-type', 'application/octet-stream')
    }
    const raw = Buffer.isBuffer(apiResponse.body)
      ? apiResponse.body
      : Buffer.from(apiResponse.body as Uint8Array)
    // Copy to a new ArrayBuffer to satisfy BodyInit type (avoids SharedArrayBuffer issue)
    const ab = new ArrayBuffer(raw.byteLength)
    new Uint8Array(ab).set(raw)
    return new Response(ab, {
      status: apiResponse.status,
      headers: responseHeaders,
    })
  }

  // Null body (e.g., 304 Not Modified)
  if (apiResponse.body === null || apiResponse.body === undefined) {
    return new Response(null, {
      status: apiResponse.status,
      headers: responseHeaders,
    })
  }

  // String body with explicit Content-Type (e.g., text/html)
  if (typeof apiResponse.body === 'string') {
    if (!responseHeaders.has('content-type')) {
      responseHeaders.set('content-type', 'text/plain')
    }
    return new Response(apiResponse.body, {
      status: apiResponse.status,
      headers: responseHeaders,
    })
  }

  // Default: JSON
  if (!responseHeaders.has('content-type')) {
    responseHeaders.set('content-type', 'application/json')
  }

  return new Response(JSON.stringify(apiResponse.body), {
    status: apiResponse.status,
    headers: responseHeaders,
  })
}

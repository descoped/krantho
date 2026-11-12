const BASE = '/api'

/** Error with full response body for structured error handling */
export class ApiError extends Error {
  readonly status: number
  readonly body: Record<string, unknown>

  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  const body: unknown = await response.json()

  if (!response.ok) {
    const errorBody = body as Record<string, unknown>
    const message =
      typeof errorBody['error'] === 'string'
        ? errorBody['error']
        : `Request failed: ${response.status}`
    throw new ApiError(message, response.status, errorBody)
  }

  return body as T
}

/**
 * Fetch a text/plain or text/xml endpoint (e.g. robots.txt, sitemap.xml)
 * and return the raw body as a string. Errors still parse as JSON when
 * possible to produce consistent ApiError messages.
 */
export async function requestText(path: string, options?: RequestInit): Promise<string> {
  const response = await fetch(`${BASE}${path}`, options)

  if (!response.ok) {
    let errorBody: Record<string, unknown> = {}
    try {
      errorBody = (await response.json()) as Record<string, unknown>
    } catch {
      // Non-JSON error body — fall through with empty object
    }
    const message =
      typeof errorBody['error'] === 'string'
        ? errorBody['error']
        : `Request failed: ${response.status}`
    throw new ApiError(message, response.status, errorBody)
  }

  return response.text()
}

export { BASE }

/** The `?locale=` query of a document request, or nothing for the site's default locale */
export function localeQuery(locale: string | undefined): string {
  return locale ? `?${new URLSearchParams({ locale })}` : ''
}

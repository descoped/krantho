import type { ApiContext, ApiHandler, ApiResponse } from '../types.js'

/**
 * Run a REST handler in-process with the request's authenticated context. The
 * handlers called this way read only params, query and body.
 */
export function callHandler(
  handler: ApiHandler,
  ctx: ApiContext,
  req: { params?: Record<string, string>; query?: Record<string, string>; body?: unknown },
): Promise<ApiResponse> {
  return handler(
    {
      method: 'POST',
      path: '',
      params: req.params ?? {},
      query: req.query ?? {},
      body: req.body,
      headers: {},
    },
    ctx,
  )
}

/** The error message of a non-2xx handler response */
export function responseError(response: ApiResponse): string {
  const body = response.body as { error?: unknown } | null
  return typeof body?.error === 'string' ? body.error : `Request failed (${response.status})`
}

/** Whether a handler response is a success */
export function isSuccess(response: ApiResponse): boolean {
  return response.status >= 200 && response.status < 300
}

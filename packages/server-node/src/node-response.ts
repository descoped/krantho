import type { ServerResponse } from 'node:http'

/**
 * Copy a Web Response's headers onto a Node ServerResponse.
 *
 * Set-Cookie is emitted as one header line per cookie: iterating a Web `Headers`
 * object folds same-name headers (including Set-Cookie) into a single comma-joined
 * value, which RFC 6265 forbids. `getSetCookie()` recovers the distinct values, and
 * `res.setHeader(name, string[])` writes one line per array element.
 */
export function writeResponseHeaders(res: ServerResponse, response: Response): void {
  for (const [key, value] of response.headers) {
    if (key.toLowerCase() === 'set-cookie') continue
    res.setHeader(key, value)
  }
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) {
    res.setHeader('set-cookie', cookies)
  }
}

/** Write one chunk, waiting for `drain` when the socket's buffer is full */
function writeChunk(res: ServerResponse, chunk: Uint8Array): Promise<void> {
  if (res.write(chunk)) return Promise.resolve()
  return new Promise((resolve) => {
    const done = (): void => {
      res.off('drain', done)
      res.off('close', done)
      resolve()
    }
    res.once('drain', done)
    res.once('close', done)
  })
}

/**
 * Write a Web Response to a Node response: headers (one Set-Cookie line per
 * cookie), then the body chunk by chunk as it arrives, honouring backpressure.
 * When the client goes away first, the body stream is cancelled; when the body
 * fails after the headers were sent, the response is destroyed.
 */
export async function writeWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  writeResponseHeaders(res, response)
  res.flushHeaders()
  if (!response.body) {
    res.end()
    return
  }

  const reader = response.body.getReader()
  const onClose = (): void => {
    if (!res.writableFinished) reader.cancel().catch(() => {})
  }
  res.once('close', onClose)
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (res.destroyed) break
      await writeChunk(res, value)
    }
    if (!res.destroyed) res.end()
  } catch (err: unknown) {
    res.destroy(err instanceof Error ? err : new Error(String(err)))
  } finally {
    res.off('close', onClose)
    reader.releaseLock()
  }
}

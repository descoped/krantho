import type { IncomingMessage } from 'node:http'

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Read the full request body from a Node.js IncomingMessage, byte for byte: an upload is not text */
function readBody(req: IncomingMessage): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
    req.on('error', reject)
  })
}

/** Convert a Node.js IncomingMessage to a Web Request */
export async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const protocol = req.headers['x-forwarded-proto'] ?? 'http'
  const host = req.headers.host ?? 'localhost'
  const fullUrl = `${protocol}://${host}${req.url ?? '/'}`

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers.set(key, value)
    }
  }

  const init: RequestInit = { method: req.method ?? 'GET', headers }

  if (req.method && METHODS_WITH_BODY.has(req.method)) {
    const body = await readBody(req)
    if (body.byteLength > 0) {
      init.body = body
    }
  }

  return new Request(fullUrl, init)
}

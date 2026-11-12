import { createServer, IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Socket } from 'node:net'
import { describe, expect, it } from 'vitest'
import { toWebRequest } from '../src/node-request.js'
import { writeWebResponse } from '../src/node-response.js'

describe('toWebRequest', () => {
  it('preserves a DELETE JSON body for bulk deletion', async () => {
    const req = new IncomingMessage(new Socket())
    req.method = 'DELETE'
    req.url = '/api/content/pages'
    req.headers = { host: 'localhost', 'content-type': 'application/json' }
    const pending = toWebRequest(req)
    req.emit('data', Buffer.from('{"slugs":["about"],"locale":"en"}'))
    req.emit('end')
    const request = await pending
    expect(request.method).toBe('DELETE')
    expect(await request.json()).toEqual({ slugs: ['about'], locale: 'en' })
  })

  it('accepts a DELETE request without a body', async () => {
    const req = new IncomingMessage(new Socket())
    req.method = 'DELETE'
    const pending = toWebRequest(req)
    req.emit('end')
    expect(await (await pending).text()).toBe('')
  })
})

describe('binary bodies', () => {
  // The PNG signature, then every byte value: none of it is valid UTF-8 text
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe])
  const everyByte = Uint8Array.from({ length: 256 }, (_, i) => i)

  it('passes an uploaded body to the handler byte for byte', async () => {
    const req = new IncomingMessage(new Socket())
    req.method = 'POST'
    req.headers = { host: 'localhost', 'content-type': 'image/png' }
    const pending = toWebRequest(req)
    req.emit('data', Buffer.from(png.subarray(0, 4)))
    req.emit('data', Buffer.from(png.subarray(4)))
    req.emit('end')
    expect(new Uint8Array(await (await pending).arrayBuffer())).toEqual(png)
  })

  it('sends a file up through the adapter and back byte for byte, over a real connection', async () => {
    // What a media upload and a served image variant do: the handler stores what it was sent
    // and a later response carries it out
    const server = createServer(async (req, res) => {
      const request = await toWebRequest(req)
      const bytes = await request.arrayBuffer()
      await writeWebResponse(res, new Response(bytes, { headers: { 'content-type': 'image/png' } }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const { port } = server.address() as AddressInfo
      for (const sent of [png, everyByte]) {
        const answer = await fetch(`http://127.0.0.1:${port}/api/media`, {
          method: 'POST',
          headers: { 'content-type': 'image/png' },
          body: sent,
        })
        expect(new Uint8Array(await answer.arrayBuffer())).toEqual(sent)
      }
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})

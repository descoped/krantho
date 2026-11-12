import { afterEach, describe, expect, it, vi } from 'vitest'
import { replaceMedia, uploadMedia } from '../src/lib/api-media.js'

function stubFetch(response: Response): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (): Promise<Response> => response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploadMedia', () => {
  it('should return the stored item', async () => {
    const fetchMock = stubFetch(Response.json({ id: 'm1', filename: 'photo.png' }, { status: 201 }))
    const item = await uploadMedia(file, 'Alt')
    expect(item.id).toBe('m1')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/media/upload',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('should surface the API error message', async () => {
    stubFetch(Response.json({ error: 'File type not allowed' }, { status: 400 }))
    await expect(uploadMedia(file)).rejects.toThrow('File type not allowed')
  })

  it('should name a host body-size rejection without JSON', async () => {
    stubFetch(new Response('Request Entity Too Large', { status: 413 }))
    await expect(uploadMedia(file)).rejects.toThrow('File too large for this host')
  })

  it('should report the status for other non-JSON failures', async () => {
    stubFetch(new Response('<html>Bad Gateway</html>', { status: 502 }))
    await expect(uploadMedia(file)).rejects.toThrow('Upload failed: 502')
  })

  it('should report the status for a JSON error without a message', async () => {
    stubFetch(Response.json({}, { status: 500 }))
    await expect(uploadMedia(file)).rejects.toThrow('Upload failed: 500')
  })
})

describe('replaceMedia', () => {
  it('should post to the replace endpoint and return the item', async () => {
    const fetchMock = stubFetch(Response.json({ id: 'm1' }))
    const item = await replaceMedia('m1', file)
    expect(item.id).toBe('m1')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/media/m1/replace',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('should name a host body-size rejection without JSON', async () => {
    stubFetch(new Response('Payload Too Large', { status: 413 }))
    await expect(replaceMedia('m1', file)).rejects.toThrow('File too large for this host')
  })

  it('should report the status for other non-JSON failures', async () => {
    stubFetch(new Response('', { status: 504 }))
    await expect(replaceMedia('m1', file)).rejects.toThrow('Upload failed: 504')
  })
})

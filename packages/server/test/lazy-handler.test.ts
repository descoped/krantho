import { describe, expect, it, vi } from 'vitest'
import type { KranthoHandler, KranthoHandlerOptions } from '../src/handler.js'

const createKranthoHandler = vi.fn<(options: KranthoHandlerOptions) => Promise<KranthoHandler>>()
vi.mock('../src/handler.js', () => ({ createKranthoHandler }))

const { createLazyHandler } = await import('../src/lazy-handler.js')

const options = { config: {}, collections: {} } as unknown as KranthoHandlerOptions
const handler: KranthoHandler = { handle: async () => new Response(), close: () => {} }

describe('createLazyHandler', () => {
  it('creates once and returns the cached handler afterwards', async () => {
    createKranthoHandler.mockReset().mockResolvedValue(handler)
    const get = createLazyHandler(options)
    const [first, second] = await Promise.all([get(), get()])
    expect(first).toBe(handler)
    expect(second).toBe(handler)
    expect(await get()).toBe(handler)
    expect(createKranthoHandler).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed creation — the next call retries', async () => {
    createKranthoHandler
      .mockReset()
      .mockRejectedValueOnce(new Error('database not reachable'))
      .mockResolvedValue(handler)
    const get = createLazyHandler(options)
    await expect(get()).rejects.toThrow('database not reachable')
    expect(await get()).toBe(handler)
    expect(createKranthoHandler).toHaveBeenCalledTimes(2)
  })
})

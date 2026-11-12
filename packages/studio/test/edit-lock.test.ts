import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEditLock } from '../src/editor/use-edit-lock.js'

interface Deferred {
  resolve: (response: Response) => void
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A fake lock endpoint whose takes answer only when the test says so */
function installLockApi(): { calls: string[]; takes: Deferred[] } {
  const calls: string[] = []
  const takes: Deferred[] = []
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${new URL(String(input), 'http://studio.test').pathname}`)
    if (method === 'POST') return new Promise<Response>((resolve) => takes.push({ resolve }))
    return Promise.resolve(json({ released: true }))
  })
  return { calls, takes }
}

const target = { collection: 'pages', slug: 'about', locale: 'en' }
const held = (expiresAt: string): Response => json({ locked: true, expiresAt })

describe('the edit lock', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('releases a lock whose first take answers after the editor closed', async () => {
    const { calls, takes } = installLockApi()
    const { unmount } = renderHook(() => useEditLock(target))
    await waitFor(() => expect(takes).toHaveLength(1))
    unmount()
    await act(async () => {
      takes[0]?.resolve(held(new Date(Date.now() + 60_000).toISOString()))
    })
    await waitFor(() => expect(calls).toContain('DELETE /api/content/pages/about/lock'))
  })

  it('renews at half the lease the server set, and a renewal in flight never re-takes a released lock', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const { calls, takes } = installLockApi()
    const { result, unmount } = renderHook(() => useEditLock(target))
    await act(async () => {
      takes[0]?.resolve(held(new Date(Date.now() + 120_000).toISOString()))
    })
    expect(result.current.state).toBe('held')
    // Half the two-minute lease: no renewal before a minute, one at a minute
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_000)
    })
    expect(takes).toHaveLength(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(takes).toHaveLength(2)
    unmount()
    await act(async () => {
      takes[1]?.resolve(held(new Date(Date.now() + 120_000).toISOString()))
    })
    expect(calls.at(-1)).toBe('DELETE /api/content/pages/about/lock')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000)
    })
    expect(takes).toHaveLength(2)
  })

  it('asks again, waiting longer, when the network fails, and keeps what it knew', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const answers: Array<() => Promise<Response>> = [
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => Promise.reject(new TypeError('Failed to fetch')),
      () => Promise.resolve(held(new Date(Date.now() + 120_000).toISOString())),
    ]
    let asked = 0
    vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== 'POST') return Promise.resolve(json({ released: true }))
      const answer = answers[Math.min(asked, answers.length - 1)]
      asked += 1
      return answer ? answer() : Promise.reject(new Error('no answer'))
    })
    const { result } = renderHook(() => useEditLock(target))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(asked).toBe(1)
    expect(result.current.state).toBe('none')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(asked).toBe(2)
    // The second failure waits twice as long
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000)
    })
    expect(asked).toBe(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(asked).toBe(3)
    expect(result.current.state).toBe('held')
  })

  it('reads a store without edit locks (501) as unguarded, and stops asking', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let asked = 0
    vi.stubGlobal('fetch', () => {
      asked += 1
      return Promise.resolve(json({ error: 'Adapter does not support locks' }, 501))
    })
    const { result } = renderHook(() => useEditLock(target))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.state).toBe('unavailable')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000)
    })
    expect(asked).toBe(1)
  })
})

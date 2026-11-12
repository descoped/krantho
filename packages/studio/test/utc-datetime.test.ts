import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localInputToUtc, utcToLocalInput } from '../src/editor/utc-datetime.js'
import { formatTimestamp } from '../src/lib/format.js'

describe('UTC timestamps in a datetime-local input', () => {
  const zone = process.env['TZ']
  beforeAll(() => {
    process.env['TZ'] = 'Europe/Oslo'
  })
  afterAll(() => {
    if (zone === undefined) delete process.env['TZ']
    else process.env['TZ'] = zone
  })

  it('shows a stored UTC moment on the viewer clock', () => {
    expect(utcToLocalInput('2026-10-10T09:30:00Z')).toBe('2026-10-10T11:30')
    expect(utcToLocalInput('2026-01-10T09:30:00Z')).toBe('2026-01-10T10:30')
  })

  it('stores what the viewer typed as UTC with a Z and no milliseconds', () => {
    expect(localInputToUtc('2026-10-10T11:30')).toBe('2026-10-10T09:30:00Z')
  })

  it('returns the stored value unchanged after a show and a save', () => {
    for (const stored of ['2026-10-10T09:30:00Z', '2026-03-29T01:30:00Z', '2026-10-25T00:30:00Z']) {
      expect(localInputToUtc(utcToLocalInput(stored))).toBe(stored)
    }
  })

  it('treats an empty or unreadable value as empty', () => {
    expect(utcToLocalInput(undefined)).toBe('')
    expect(utcToLocalInput('soon')).toBe('')
    expect(localInputToUtc('')).toBe('')
  })
})

describe('formatTimestamp', () => {
  it('reads a stored moment on a clock, with its zone', () => {
    const shown = formatTimestamp('2026-10-10T09:30:00Z', 'Europe/Oslo')
    expect(shown).toContain('11:30')
    expect(shown).toMatch(/GMT\+2|CEST|UTC\+2/)
  })

  it('is empty when the value is not a moment', () => {
    expect(formatTimestamp(undefined)).toBe('')
    expect(formatTimestamp('soon')).toBe('')
  })
})

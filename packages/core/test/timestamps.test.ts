import { describe, expect, it } from 'vitest'
import { normalizeTimestamps, toUtcTimestamp } from '../src/index.js'

describe('toUtcTimestamp', () => {
  it('writes a date alone as midnight UTC', () => {
    expect(toUtcTimestamp('2026-10-10')).toBe('2026-10-10T00:00:00Z')
  })

  it('keeps a UTC timestamp as it is', () => {
    expect(toUtcTimestamp('2026-10-10T09:30:00Z')).toBe('2026-10-10T09:30:00Z')
  })

  it('writes a time with an offset as the same moment in UTC', () => {
    expect(toUtcTimestamp('2026-10-10T11:30:00+02:00')).toBe('2026-10-10T09:30:00Z')
    expect(toUtcTimestamp('2026-10-10T11:30:00+0200')).toBe('2026-10-10T09:30:00Z')
  })

  it('reads a time without a zone as UTC, never as the clock of the machine', () => {
    expect(toUtcTimestamp('2026-10-10T09:30')).toBe('2026-10-10T09:30:00Z')
    expect(toUtcTimestamp('2026-10-10 09:30:15')).toBe('2026-10-10T09:30:15Z')
  })

  it('keeps fractions of a second that are set', () => {
    expect(toUtcTimestamp('2026-10-10T09:30:00.250Z')).toBe('2026-10-10T09:30:00.250Z')
  })

  it('returns null for what is not a moment', () => {
    for (const written of [
      'soon',
      '',
      '2026-02-31',
      '2026-13-01',
      '10/10/2026',
      '2026-10-10T09:30junk',
      '2026-10-10T09:30:00Zjunk',
      '2026-02-31T09:30:00Z',
      '2026-10-10T25:00',
    ]) {
      expect(toUtcTimestamp(written)).toBeNull()
    }
  })
})

describe('normalizeTimestamps', () => {
  const schema = {
    type: 'object',
    properties: {
      published: { type: 'string', format: 'date-time' },
      reviewed: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
      title: { type: 'string' },
      history: { type: 'array', items: { type: 'string', format: 'date-time' } },
      nested: { type: 'object', properties: { at: { type: 'string', format: 'date-time' } } },
    },
  } as const

  it('converts each declared date-time and leaves the rest alone', () => {
    expect(
      normalizeTimestamps(schema, {
        published: '2026-10-10',
        reviewed: '2026-10-10T11:30:00+02:00',
        title: '2026-10-10',
        history: ['2026-01-01', '2026-01-02T10:00:00Z'],
        nested: { at: '2026-03-04' },
        extra: '2026-05-06',
      }),
    ).toEqual({
      published: '2026-10-10T00:00:00Z',
      reviewed: '2026-10-10T09:30:00Z',
      title: '2026-10-10',
      history: ['2026-01-01T00:00:00Z', '2026-01-02T10:00:00Z'],
      nested: { at: '2026-03-04T00:00:00Z' },
      extra: '2026-05-06',
    })
  })

  it('leaves a value that is not a moment for validation to refuse', () => {
    expect(normalizeTimestamps(schema, { published: 'soon', reviewed: null })).toEqual({
      published: 'soon',
      reviewed: null,
    })
  })
})

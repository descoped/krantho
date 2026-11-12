import { describe, expect, it } from 'vitest'
import { parseAddress, parseOpeningHours } from '../src/seo/map-business'

describe('parseOpeningHours', () => {
  it('parses English day with time range', () => {
    const result = parseOpeningHours('Monday 17:00 - 19:00')
    expect(result).toEqual({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: 'Monday',
      opens: '17:00',
      closes: '19:00',
    })
  })

  it('parses Tuesday format', () => {
    const result = parseOpeningHours('Tuesday 16:00 - 19:00')
    expect(result).toEqual({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: 'Tuesday',
      opens: '16:00',
      closes: '19:00',
    })
  })

  it('returns null for invalid format', () => {
    expect(parseOpeningHours('Invalid')).toBeNull()
    expect(parseOpeningHours('')).toBeNull()
  })

  it('returns null for unmapped day name', () => {
    expect(parseOpeningHours('Mandag 09:00 - 17:00')).toBeNull()
  })
})

describe('parseAddress', () => {
  it('parses 5-digit postal code and city', () => {
    const result = parseAddress('94105 San Francisco')
    expect(result).toEqual({
      postalCode: '94105',
      addressLocality: 'San Francisco',
    })
  })

  it('parses 4-digit postal code and city', () => {
    const result = parseAddress('0164 Oslo')
    expect(result).toEqual({
      postalCode: '0164',
      addressLocality: 'Oslo',
    })
  })

  it('handles multi-word city names', () => {
    const result = parseAddress('1234 Stor Oslo')
    expect(result).toEqual({
      postalCode: '1234',
      addressLocality: 'Stor Oslo',
    })
  })

  it('returns full string as locality for invalid format', () => {
    const result = parseAddress('some address')
    expect(result).toEqual({
      postalCode: '',
      addressLocality: 'some address',
    })
  })
})

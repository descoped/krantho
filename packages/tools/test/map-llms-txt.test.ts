import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock cms-reader before importing map-llms-txt
vi.mock('../src/shared/cms-reader', () => ({
  readYAML: vi.fn(),
  readCMSContent: vi.fn(),
}))

import { mapLlmsTxt } from '../src/seo/map-llms-txt'
import type { BusinessMetadata } from '../src/seo/types'
import { readCMSContent, readYAML } from '../src/shared/cms-reader'

const mockReadYAML = vi.mocked(readYAML)
const mockReadCMSContent = vi.mocked(readCMSContent)

const MOCK_BUSINESS: BusinessMetadata = {
  url: 'https://example.com',
  geo: { latitude: 59.0, longitude: 10.0 },
  'area-served': 'Test City',
  'founding-year': 2024,
  image: 'https://example.com/image.jpg',
  'legal-name': 'Test Person',
  'job-title': 'Test Title',
  'alumni-of': 'Test University',
  'person-description': 'Test description',
  'knows-about': ['Topic A', 'Topic B'],
  prose: {
    summary: 'Test summary line.',
    description: 'Test description line.',
  },
  'llms-sections': [
    {
      heading: 'Services',
      links: [
        {
          title: 'Service A',
          path: '/services',
          description: 'Description A',
        },
      ],
    },
  ],
  'llms-optional': [
    {
      heading: 'Optional',
      links: [
        {
          title: 'Extra',
          path: '/extra',
          description: 'Extra description',
        },
      ],
    },
  ],
}

const MOCK_CONTACT_FM: Record<string, unknown> = {
  'phone-number': '+47 12 34 56 78',
  'email-address': 'test@example.com',
  'location-title': 'Test Street 1',
  'location-address': '0000 Test City',
  'hours-line1': 'Monday 09:00 - 17:00',
  'hours-line2': 'Tuesday 09:00 - 17:00',
  'footer-license': 'License: PSY-31245',
}

const MOCK_FEES_FM: Record<string, unknown> = {
  description: 'Test prices valid from 2026.',
  'service-1-name': 'Test Strategy',
  'service-1-duration-1': '45 min',
  'service-1-price-1': '$1,000',
  'payment-text': 'Pay with Vipps',
  'insurance-text': 'Check your insurance.',
  'cancellation-text': 'Cancel 48 hours before.',
}

describe('mapLlmsTxt', () => {
  beforeEach(() => {
    mockReadYAML.mockReturnValue(MOCK_BUSINESS)
    mockReadCMSContent.mockImplementation((slug: string) => {
      if (slug === 'contact') return { frontmatter: MOCK_CONTACT_FM, content: '' }
      if (slug === 'fees') return { frontmatter: MOCK_FEES_FM, content: '' }
      return { frontmatter: {}, content: '' }
    })
  })

  it('starts with h1 title using legal-name', () => {
    const result = mapLlmsTxt()
    expect(result).toMatch(/^# Test Person\n/)
  })

  it('includes blockquote summary', () => {
    const result = mapLlmsTxt()
    expect(result).toContain('> Test summary line.')
  })

  it('includes description paragraph', () => {
    const result = mapLlmsTxt()
    expect(result).toContain('Test description line.')
  })

  it('renders section headings', () => {
    const result = mapLlmsTxt()
    expect(result).toContain('## Services')
    expect(result).toContain('## Optional')
  })

  it('renders markdown links with full URLs', () => {
    const result = mapLlmsTxt()
    expect(result).toContain('- [Service A](https://example.com/services): Description A')
  })

  it('renders optional section links', () => {
    const result = mapLlmsTxt()
    expect(result).toContain('- [Extra](https://example.com/extra): Extra description')
  })

  it('renders contact details from CMS', () => {
    const result = mapLlmsTxt()
    expect(result).toContain('## Contact Details')
    expect(result).toContain('Phone: +47 12 34 56 78')
    expect(result).toContain('Email: test@example.com')
    expect(result).toContain('Address: Test Street 1, 0000 Test City')
  })

  it('renders pricing from CMS', () => {
    const result = mapLlmsTxt()
    expect(result).toContain('## Pricing')
    expect(result).toContain('Test Strategy: 45 min: $1,000')
    expect(result).toContain('Cancellation: Cancel 48 hours before.')
  })

  it('renders expertise from business.yaml', () => {
    const result = mapLlmsTxt()
    expect(result).toContain('## Expertise and Methods')
    expect(result).toContain('- Topic A')
    expect(result).toContain('- Topic B')
  })

  it('renders credentials', () => {
    const result = mapLlmsTxt()
    expect(result).toContain('## Credentials')
    expect(result).toContain('Title: Test Title')
    expect(result).toContain('Education: Test University')
    expect(result).toContain('License: PSY-31245')
  })

  it('ends with a newline', () => {
    const result = mapLlmsTxt()
    expect(result.endsWith('\n')).toBe(true)
  })
})

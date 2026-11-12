import { afterEach, describe, expect, it } from 'vitest'
import {
  BUILT_IN_PROFILES,
  getProfile,
  googleProfile,
  registerProfile,
  ruleFor,
} from '../src/profiles/index.js'
import type { Finding } from '../src/validate/index.js'
import { validateGraph } from '../src/validate/index.js'
import {
  getVocabularyProperty,
  isPropertyOfType,
  isSubtypeOf,
  lifecycleOf,
} from '../src/vocabulary/index.js'

const BASE = 'https://example.org'

function graph(...nodes: Record<string, unknown>[]): Record<string, unknown> {
  return { '@context': 'https://schema.org', '@graph': nodes }
}

function google(...nodes: Record<string, unknown>[]): Finding[] {
  return validateGraph(graph(...nodes), { profiles: ['google'] }).filter(
    (f) => f.profile === 'google',
  )
}

describe('built-in reader profiles', () => {
  it('should register Google and Bing', () => {
    expect(getProfile('google')).toBe(googleProfile)
    expect(getProfile('bing')?.rules).toEqual([])
  })

  for (const profile of BUILT_IN_PROFILES) {
    for (const rule of profile.rules) {
      it(`${profile.id}: ${rule.type} cites its source and names current properties of the type`, () => {
        expect(rule.source).toMatch(/^https:\/\/developers\.google\.com\//)
        expect(rule.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        const properties = [
          ...(rule.required ?? []),
          ...(rule.recommended ?? []),
          ...(rule.oneOf ?? []).flat(),
        ]
        for (const property of properties) {
          const definition = getVocabularyProperty(property)
          expect(definition, property).toBeDefined()
          // Defined for the type, or for one of its subtypes (servesCuisine on LocalBusiness)
          const fits =
            isPropertyOfType(property, rule.type) ||
            (definition?.domain ?? []).some((owner) => isSubtypeOf(owner, rule.type))
          expect(fits, `${rule.type}.${property}`).toBe(true)
          const status = lifecycleOf(property)?.status
          expect(status === 'superseded' || status === 'retired', property).toBe(false)
        }
      })
    }
  }
})

describe('ruleFor', () => {
  it("should use a type's own rule, else its nearest ancestor's", () => {
    expect(ruleFor(googleProfile, 'Article')?.feature).toBe('Article')
    expect(ruleFor(googleProfile, 'TechArticle')?.feature).toBe('Article')
    expect(ruleFor(googleProfile, 'Restaurant')?.feature).toBe('Local business')
    expect(ruleFor(googleProfile, 'Corporation')?.feature).toBe('Organization')
    expect(ruleFor(googleProfile, 'EmployerAggregateRating')?.feature).toBe(
      'Employer aggregate rating',
    )
    expect(ruleFor(googleProfile, 'Person')).toBeUndefined()
  })
})

describe('reader findings', () => {
  it('should report a property a feature needs as a warning citing the rule', () => {
    const findings = google({
      '@type': 'Event',
      '@id': `${BASE}/e/#event`,
      name: 'Talk',
      startDate: '2026-11-01',
    })
    const location = findings.find((f) => f.property === 'location')
    expect(location).toMatchObject({
      severity: 'warning',
      code: 'profile-required',
      source: 'https://developers.google.com/search/docs/appearance/structured-data/event',
    })
  })

  it('should report recommended properties as information', () => {
    const findings = google({ '@type': 'Article', '@id': `${BASE}/a/#article`, headline: 'A' })
    expect(findings.every((f) => f.severity === 'info' && f.code === 'profile-recommended')).toBe(
      true,
    )
    expect(findings.map((f) => f.property)).toEqual([
      'author',
      'dateModified',
      'datePublished',
      'image',
    ])
  })

  it('should require one property of each group', () => {
    const app = {
      '@type': 'SoftwareApplication',
      '@id': `${BASE}/#app`,
      name: 'App',
      offers: { '@type': 'Offer', price: 0 },
    }
    expect(google(app).filter((f) => f.code === 'profile-required')).toHaveLength(1)
    expect(
      google({ ...app, review: { '@type': 'Review', reviewBody: 'Good' } }).filter(
        (f) => f.code === 'profile-required',
      ),
    ).toEqual([])
  })

  it('should say a feature is retired without asking for its properties', () => {
    const findings = google({ '@type': 'FAQPage', '@id': `${BASE}/faq/#faq` })
    expect(findings).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'profile-retired-feature' }),
    ])
  })

  it('should state the conditions of a restricted feature', () => {
    const findings = google({
      '@type': 'Dataset',
      '@id': `${BASE}/d/#dataset`,
      name: 'D',
      description: 'Data',
    })
    expect(findings[0]).toMatchObject({ severity: 'info', code: 'profile-restricted-feature' })
    expect(findings[0]?.message).toContain('Dataset Search')
  })

  it('should check the entities a page states, not their nested parts', () => {
    const product = {
      '@type': 'Product',
      '@id': `${BASE}/p/#product`,
      name: 'P',
      review: { '@type': 'Review', reviewBody: 'Fine' },
    }
    expect(google(product).filter((f) => f.type === 'Review')).toEqual([])
  })

  it('should not run reader rules unless asked', () => {
    expect(
      validateGraph(graph({ '@type': 'Event', '@id': `${BASE}/e/#event`, name: 'E' })),
    ).toEqual([])
  })

  it('should refuse a reader that is not registered', () => {
    expect(() => validateGraph(graph(), { profiles: ['nope'] })).toThrow(/no reader profile "nope"/)
  })
})

describe('registerProfile', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  it("should apply a site's own reader rules", () => {
    restore = registerProfile({
      id: 'assistant',
      name: 'Assistant',
      rules: [
        {
          type: 'Article',
          status: 'active',
          required: ['image'],
          source: 'https://example.org/rules',
          verifiedAt: '2026-10-02',
        },
      ],
    })
    const findings = validateGraph(
      graph({ '@type': 'TechArticle', '@id': `${BASE}/a/#article`, headline: 'A' }),
      {
        profiles: ['assistant'],
      },
    )
    expect(findings).toEqual([
      expect.objectContaining({
        profile: 'assistant',
        code: 'profile-required',
        property: 'image',
      }),
    ])
  })

  it('should refuse rules for unknown types or without a source', () => {
    const rule = {
      type: 'Atricle',
      status: 'active' as const,
      source: 'x',
      verifiedAt: '2026-10-02',
    }
    expect(() => registerProfile({ id: 'bad', name: 'Bad', rules: [rule] })).toThrow(
      /not a Schema.org type/,
    )
    expect(() =>
      registerProfile({
        id: 'bad',
        name: 'Bad',
        rules: [{ ...rule, type: 'Article', verifiedAt: 'today' }],
      }),
    ).toThrow(/needs a source and a verifiedAt date/)
  })
})

import { describe, expect, it } from 'vitest'
import { composeFromConfig } from '../src/graph/compose-from-config.js'
import type { SchemaEntity, SeoGraphConfig } from '../src/graph/types.js'

const siteConfig: SeoGraphConfig = {
  domain: 'acme.example.com',
  name: 'Acme Co',
  language: 'en',
  baseUrl: 'https://acme.example.com',
}

/** A site that configures an Organization and a Person, for cross-links to resolve to */
const siteLevel = {
  entities: [
    { '@type': 'Organization', properties: {} },
    { '@type': 'Person', properties: { name: 'Ada Example' } },
  ],
}

function findEntity(
  graph: ReturnType<typeof composeFromConfig>,
  type: string,
): Record<string, unknown> | undefined {
  return graph['@graph'].find((e) => (e as SchemaEntity)['@type'] === type) as
    | Record<string, unknown>
    | undefined
}

describe('buildHowTo', () => {
  it('produces a HowTo entity with required Google rich result fields', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'HowTo', properties: {} }] },
      fields: {
        title: 'How to bake bread',
        step: ['Mix flour and water', 'Knead for 10 minutes', 'Bake at 220°C for 30 minutes'],
      },
      siteConfig,
      path: '/how-to/bake-bread',
    })

    const howto = findEntity(graph, 'HowTo')
    expect(howto).toBeDefined()
    expect(howto?.['name']).toBe('How to bake bread')
    expect(howto?.['step']).toHaveLength(3)
  })

  it('wraps each step as a HowToStep entity', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'HowTo', properties: {} }] },
      fields: { title: 'Test', step: ['Step 1', 'Step 2'] },
      siteConfig,
      path: '/h/t',
    })

    const howto = findEntity(graph, 'HowTo')
    const steps = howto?.['step'] as Array<Record<string, unknown>>
    expect(steps[0]?.['@type']).toBe('HowToStep')
    expect(steps[0]?.['text']).toBe('Step 1')
  })

  it('uses howto @id convention', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'HowTo', properties: {} }] },
      fields: { title: 'Guide', step: ['x'] },
      siteConfig,
      path: '/guide',
    })

    expect(findEntity(graph, 'HowTo')?.['@id']).toBe('https://acme.example.com/guide/#howto')
  })

  it('cross-links author to site Person via @id', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'HowTo', properties: {} }] },
      fields: { title: 'Guide', step: ['x'] },
      siteConfig,
      siteLevel,
      path: '/g',
    })

    const howto = findEntity(graph, 'HowTo')
    expect((howto?.['author'] as Record<string, unknown> | undefined)?.['@id']).toBe(
      'https://acme.example.com/#person',
    )
  })

  it('wraps supply and tool entries as HowToSupply and HowToTool sub-entities', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'HowTo', properties: {} }] },
      fields: {
        title: 'Build a shelf',
        step: ['Cut wood', 'Assemble'],
        supply: ['2x4 boards', 'screws'],
        tool: ['saw', 'screwdriver'],
      },
      siteConfig,
      path: '/h/shelf',
    })

    const howto = findEntity(graph, 'HowTo')
    const supply = howto?.['supply'] as Array<Record<string, unknown>>
    expect(supply[0]?.['@type']).toBe('HowToSupply')
    expect(supply[0]?.['name']).toBe('2x4 boards')

    const tool = howto?.['tool'] as Array<Record<string, unknown>>
    expect(tool[0]?.['@type']).toBe('HowToTool')
    expect(tool[1]?.['name']).toBe('screwdriver')
  })

  it('omits empty optional fields', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'HowTo', properties: {} }] },
      fields: { title: 'Min', step: ['x'] },
      siteConfig,
      path: '/h/min',
    })

    const howto = findEntity(graph, 'HowTo')
    expect(howto?.['totalTime']).toBeUndefined()
    expect(howto?.['estimatedCost']).toBeUndefined()
    expect(howto?.['supply']).toBeUndefined()
    expect(howto?.['tool']).toBeUndefined()
  })

  it('reads alternate `steps` plural field name', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'HowTo', properties: {} }] },
      fields: { title: 'Recipe', steps: ['Mix', 'Bake'] },
      siteConfig,
      path: '/h/alt',
    })

    const howto = findEntity(graph, 'HowTo')
    const steps = howto?.['step'] as Array<Record<string, unknown>>
    expect(steps).toHaveLength(2)
    expect(steps[0]?.['text']).toBe('Mix')
    expect(steps[1]?.['text']).toBe('Bake')
  })

  it('parses comma-separated strings for step, supply, and tool (legacy CMS compat)', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'HowTo', properties: {} }] },
      fields: {
        title: 'Build a shelf',
        step: 'Cut wood, Sand edges, Assemble',
        supply: '2x4 boards, screws, glue',
        tool: 'saw, screwdriver',
      },
      siteConfig,
      path: '/h/csv',
    })

    const howto = findEntity(graph, 'HowTo')
    const steps = howto?.['step'] as Array<Record<string, unknown>>
    expect(steps).toHaveLength(3)
    expect(steps[0]?.['text']).toBe('Cut wood')
    expect(steps[2]?.['text']).toBe('Assemble')

    const supply = howto?.['supply'] as Array<Record<string, unknown>>
    expect(supply).toHaveLength(3)
    expect(supply[1]?.['name']).toBe('screws')

    const tool = howto?.['tool'] as Array<Record<string, unknown>>
    expect(tool).toHaveLength(2)
  })
})

describe('buildCourse', () => {
  it('produces a Course entity with required Google rich result fields', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'Course', properties: {} }] },
      fields: {
        title: 'Intro to TypeScript',
        description: 'Learn TypeScript fundamentals',
      },
      siteConfig,
      path: '/courses/typescript',
    })

    const course = findEntity(graph, 'Course')
    expect(course).toBeDefined()
    expect(course?.['name']).toBe('Intro to TypeScript')
    expect(course?.['description']).toBe('Learn TypeScript fundamentals')
  })

  it('cross-links provider to site Organization via @id', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'Course', properties: {} }] },
      fields: { title: 'Course', description: 'Desc' },
      siteConfig,
      siteLevel,
      path: '/c',
    })

    const course = findEntity(graph, 'Course')
    expect((course?.['provider'] as Record<string, unknown> | undefined)?.['@id']).toBe(
      'https://acme.example.com/#business',
    )
  })

  it('uses course @id convention', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'Course', properties: {} }] },
      fields: { title: 'Course', description: 'Desc' },
      siteConfig,
      path: '/courses/intro',
    })

    expect(findEntity(graph, 'Course')?.['@id']).toBe(
      'https://acme.example.com/courses/intro/#course',
    )
  })

  it('reads alternate course-code field name', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'Course', properties: {} }] },
      fields: { title: 'C', description: 'D', 'course-code': 'CS101' },
      siteConfig,
      path: '/c',
    })

    expect(findEntity(graph, 'Course')?.['courseCode']).toBe('CS101')
  })

  it('auto-populates hasCourseInstance with default courseMode', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'Course', properties: {} }] },
      fields: { title: 'C', description: 'D' },
      siteConfig,
      path: '/c',
    })

    const course = findEntity(graph, 'Course')
    const instance = course?.['hasCourseInstance'] as Record<string, unknown>
    expect(instance).toBeDefined()
    expect(instance['@type']).toBe('CourseInstance')
    expect(instance['courseMode']).toBe('Online')
  })

  it('uses courseMode field when provided for hasCourseInstance default', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'Course', properties: {} }] },
      fields: { title: 'C', description: 'D', courseMode: 'Hybrid' },
      siteConfig,
      path: '/c',
    })

    const instance = findEntity(graph, 'Course')?.['hasCourseInstance'] as Record<string, unknown>
    expect(instance['courseMode']).toBe('Hybrid')
  })

  it('passes through full hasCourseInstance object form unchanged', () => {
    const graph = composeFromConfig({
      config: {
        entities: [
          {
            '@type': 'Course',
            properties: {
              hasCourseInstance: {
                '@type': 'CourseInstance',
                courseMode: 'Onsite',
                courseSchedule: {
                  '@type': 'Schedule',
                  startDate: '2026-09-01',
                  endDate: '2026-12-15',
                },
              },
            },
          },
        ],
      },
      fields: { title: 'C', description: 'D' },
      siteConfig,
      path: '/c',
    })

    const instance = findEntity(graph, 'Course')?.['hasCourseInstance'] as Record<string, unknown>
    expect(instance['courseMode']).toBe('Onsite')
    expect((instance['courseSchedule'] as Record<string, unknown>)['startDate']).toBe('2026-09-01')
  })
})

describe('buildJobPosting', () => {
  it('produces a JobPosting entity with required Google rich result fields', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'JobPosting', properties: {} }] },
      fields: {
        title: 'Senior TypeScript Engineer',
        description: 'Build production systems',
        datePosted: '2026-04-01',
        jobLocation: 'San Francisco, CA',
      },
      siteConfig,
      path: '/jobs/sr-engineer',
    })

    const job = findEntity(graph, 'JobPosting')
    expect(job).toBeDefined()
    expect(job?.['title']).toBe('Senior TypeScript Engineer')
    expect(job?.['description']).toBe('Build production systems')
    expect(job?.['datePosted']).toBe('2026-04-01')
  })

  it('wraps jobLocation string as a Place sub-entity', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'JobPosting', properties: {} }] },
      fields: {
        title: 'Job',
        description: 'D',
        datePosted: '2026-01-01',
        jobLocation: 'Remote, US',
      },
      siteConfig,
      path: '/j',
    })

    const job = findEntity(graph, 'JobPosting')
    const loc = job?.['jobLocation'] as Record<string, unknown>
    expect(loc['@type']).toBe('Place')
    expect(loc['name']).toBe('Remote, US')
  })

  it('passes through jobLocation object form unchanged', () => {
    const graph = composeFromConfig({
      config: {
        entities: [
          {
            '@type': 'JobPosting',
            properties: {
              jobLocation: {
                '@type': 'Place',
                address: {
                  '@type': 'PostalAddress',
                  streetAddress: '1 Main St',
                  addressLocality: 'SF',
                  addressRegion: 'CA',
                  postalCode: '94102',
                  addressCountry: 'US',
                },
              },
            },
          },
        ],
      },
      fields: { title: 'Eng', description: 'D', datePosted: '2026-01-01' },
      siteConfig,
      path: '/j',
    })

    const job = findEntity(graph, 'JobPosting')
    const loc = job?.['jobLocation'] as Record<string, unknown>
    expect((loc['address'] as Record<string, unknown>)['streetAddress']).toBe('1 Main St')
  })

  it('cross-links hiringOrganization to site Organization via @id', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'JobPosting', properties: {} }] },
      fields: { title: 'Job', description: 'D', datePosted: '2026-01-01', jobLocation: 'NYC' },
      siteConfig,
      siteLevel,
      path: '/j',
    })

    const job = findEntity(graph, 'JobPosting')
    expect((job?.['hiringOrganization'] as Record<string, unknown> | undefined)?.['@id']).toBe(
      'https://acme.example.com/#business',
    )
  })

  it('reads alternate kebab-case field names', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'JobPosting', properties: {} }] },
      fields: {
        title: 'Job',
        description: 'D',
        'date-posted': '2026-02-15',
        'job-location': 'LA',
        'employment-type': 'FULL_TIME',
        'base-salary': '$120k-$160k',
      },
      siteConfig,
      path: '/j/k',
    })

    const job = findEntity(graph, 'JobPosting')
    expect(job?.['datePosted']).toBe('2026-02-15')
    expect(job?.['employmentType']).toBe('FULL_TIME')
    expect((job?.['jobLocation'] as Record<string, unknown> | undefined)?.['name']).toBe('LA')
    // baseSalary string is wrapped as a MonetaryAmount sub-entity
    const salary = job?.['baseSalary'] as Record<string, unknown>
    expect(salary['@type']).toBe('MonetaryAmount')
    expect(salary['value']).toBe('$120k-$160k')
  })

  it('wraps baseSalary string as a MonetaryAmount sub-entity', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'JobPosting', properties: {} }] },
      fields: {
        title: 'Eng',
        description: 'D',
        datePosted: '2026-01-01',
        jobLocation: 'NYC',
        baseSalary: '120000',
      },
      siteConfig,
      path: '/j/s',
    })

    const salary = findEntity(graph, 'JobPosting')?.['baseSalary'] as Record<string, unknown>
    expect(salary['@type']).toBe('MonetaryAmount')
    expect(salary['value']).toBe('120000')
  })

  it('passes through baseSalary object form unchanged', () => {
    const graph = composeFromConfig({
      config: {
        entities: [
          {
            '@type': 'JobPosting',
            properties: {
              baseSalary: {
                '@type': 'MonetaryAmount',
                currency: 'USD',
                value: {
                  '@type': 'QuantitativeValue',
                  minValue: 120000,
                  maxValue: 160000,
                  unitText: 'YEAR',
                },
              },
            },
          },
        ],
      },
      fields: { title: 'Eng', description: 'D', datePosted: '2026-01-01', jobLocation: 'NYC' },
      siteConfig,
      path: '/j/o',
    })

    const salary = findEntity(graph, 'JobPosting')?.['baseSalary'] as Record<string, unknown>
    expect(salary['@type']).toBe('MonetaryAmount')
    expect(salary['currency']).toBe('USD')
    const value = salary['value'] as Record<string, unknown>
    expect(value['minValue']).toBe(120000)
    expect(value['maxValue']).toBe(160000)
  })
})

describe('buildVideoObject', () => {
  it('produces a VideoObject entity with required Google rich result fields', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'VideoObject', properties: {} }] },
      fields: {
        title: 'Product demo',
        description: 'Demonstrates the product',
        contentUrl: 'https://example.com/video.mp4',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        uploadDate: '2026-03-15',
      },
      siteConfig,
      path: '/videos/demo',
    })

    const video = findEntity(graph, 'VideoObject')
    expect(video).toBeDefined()
    expect(video?.['name']).toBe('Product demo')
    expect(video?.['contentUrl']).toBe('https://example.com/video.mp4')
    expect(video?.['thumbnailUrl']).toBe('https://example.com/thumb.jpg')
    expect(video?.['uploadDate']).toBe('2026-03-15')
  })

  it('cross-links publisher to site Organization and author to site Person', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'VideoObject', properties: {} }] },
      fields: {
        title: 'V',
        description: 'D',
        contentUrl: 'u.mp4',
        thumbnailUrl: 't.jpg',
        uploadDate: '2026-01-01',
      },
      siteConfig,
      siteLevel,
      path: '/v',
    })

    const video = findEntity(graph, 'VideoObject')
    expect((video?.['publisher'] as Record<string, unknown> | undefined)?.['@id']).toBe(
      'https://acme.example.com/#business',
    )
    expect((video?.['author'] as Record<string, unknown> | undefined)?.['@id']).toBe(
      'https://acme.example.com/#person',
    )
  })

  it('uses video @id convention', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'VideoObject', properties: {} }] },
      fields: {
        title: 'V',
        description: 'D',
        contentUrl: 'u.mp4',
        thumbnailUrl: 't.jpg',
        uploadDate: '2026-01-01',
      },
      siteConfig,
      path: '/videos/intro',
    })

    expect(findEntity(graph, 'VideoObject')?.['@id']).toBe(
      'https://acme.example.com/videos/intro/#video',
    )
  })

  it('reads alternate kebab-case field names', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'VideoObject', properties: {} }] },
      fields: {
        title: 'V',
        description: 'D',
        'content-url': 'u.mp4',
        'thumbnail-url': 't.jpg',
        'upload-date': '2026-04-01',
        'embed-url': 'e.html',
      },
      siteConfig,
      path: '/v',
    })

    const video = findEntity(graph, 'VideoObject')
    expect(video?.['contentUrl']).toBe('u.mp4')
    expect(video?.['thumbnailUrl']).toBe('t.jpg')
    expect(video?.['uploadDate']).toBe('2026-04-01')
    expect(video?.['embedUrl']).toBe('e.html')
  })

  it('falls back uploadDate to datePublished when neither uploadDate nor upload-date is set', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'VideoObject', properties: {} }] },
      fields: {
        title: 'V',
        description: 'D',
        contentUrl: 'u.mp4',
        thumbnailUrl: 't.jpg',
        datePublished: '2026-05-15',
      },
      siteConfig,
      path: '/v/dp',
    })

    expect(findEntity(graph, 'VideoObject')?.['uploadDate']).toBe('2026-05-15')
  })

  it('falls back uploadDate to generic date as a last resort', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'VideoObject', properties: {} }] },
      fields: {
        title: 'V',
        description: 'D',
        contentUrl: 'u.mp4',
        thumbnailUrl: 't.jpg',
        date: '2026-06-01',
      },
      siteConfig,
      path: '/v/d',
    })

    expect(findEntity(graph, 'VideoObject')?.['uploadDate']).toBe('2026-06-01')
  })

  it('omits empty optional fields', () => {
    const graph = composeFromConfig({
      config: { entities: [{ '@type': 'VideoObject', properties: {} }] },
      fields: {
        title: 'V',
        description: 'D',
        contentUrl: 'u',
        thumbnailUrl: 't',
        uploadDate: '2026-01-01',
      },
      siteConfig,
      path: '/v',
    })

    const video = findEntity(graph, 'VideoObject')
    expect(video?.['duration']).toBeUndefined()
    expect(video?.['embedUrl']).toBeUndefined()
  })
})

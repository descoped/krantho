import { describe, expect, it } from 'vitest'
import { composeFromConfig } from '../src/graph/compose-from-config.js'
import type { SchemaEntity, SeoGraphConfig } from '../src/graph/types.js'

const siteConfig: SeoGraphConfig = {
  domain: 'acme.example.com',
  name: 'Acme Events',
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

describe('buildEvent', () => {
  it('produces an Event entity with required Google rich result fields', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Event', properties: {} }],
      },
      fields: {
        title: 'Annual Conference 2026',
        startDate: '2026-09-15T09:00:00',
        location: 'Acme Convention Center, San Francisco',
      },
      siteConfig,
      path: '/events/annual-2026',
    })

    const event = findEntity(graph, 'Event')
    expect(event).toBeDefined()
    expect(event?.['name']).toBe('Annual Conference 2026')
    expect(event?.['startDate']).toBe('2026-09-15T09:00:00')
    expect(event?.['location']).toEqual({
      '@type': 'Place',
      name: 'Acme Convention Center, San Francisco',
    })
  })

  it('uses event @id convention for cross-referencing', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Event', properties: {} }],
      },
      fields: {
        title: 'Workshop',
        startDate: '2026-10-01',
        location: 'Online',
      },
      siteConfig,
      path: '/events/workshop',
    })

    const event = findEntity(graph, 'Event')
    expect(event?.['@id']).toBe('https://acme.example.com/events/workshop/#event')
  })

  it('cross-links organizer to site Organization via @id', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Event', properties: {} }],
      },
      fields: { title: 'Talk', startDate: '2026-11-01', location: 'HQ' },
      siteConfig,
      siteLevel,
      path: '/events/talk',
    })

    const event = findEntity(graph, 'Event')
    expect((event?.['organizer'] as Record<string, unknown> | undefined)?.['@id']).toBe(
      'https://acme.example.com/#business',
    )
  })

  it('passes through location object when provided', () => {
    const graph = composeFromConfig({
      config: {
        entities: [
          {
            '@type': 'Event',
            properties: {
              location: {
                '@type': 'Place',
                name: 'Acme Center',
                address: {
                  '@type': 'PostalAddress',
                  streetAddress: '123 Main St',
                  addressLocality: 'San Francisco',
                },
              },
            },
          },
        ],
      },
      fields: { title: 'Conf', startDate: '2026-12-01' },
      siteConfig,
      path: '/events/conf',
    })

    const event = findEntity(graph, 'Event')
    const location = event?.['location'] as Record<string, unknown>
    expect(location['@type']).toBe('Place')
    expect((location['address'] as Record<string, unknown>)['streetAddress']).toBe('123 Main St')
  })

  it('omits empty optional fields from output', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Event', properties: {} }],
      },
      fields: { title: 'Minimal', startDate: '2026-01-01', location: 'Somewhere' },
      siteConfig,
      path: '/e/min',
    })

    const event = findEntity(graph, 'Event')
    expect(event?.['endDate']).toBeUndefined()
    expect(event?.['eventStatus']).toBeUndefined()
    expect(event?.['eventAttendanceMode']).toBeUndefined()
    expect(event?.['offers']).toBeUndefined()
  })

  it('wraps offers as an Offer sub-entity', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Event', properties: {} }],
      },
      fields: {
        title: 'Paid Event',
        startDate: '2026-05-01',
        location: 'Venue',
        offers: '$50',
      },
      siteConfig,
      path: '/e/paid',
    })

    const event = findEntity(graph, 'Event')
    const offers = event?.['offers'] as Record<string, unknown>
    expect(offers['@type']).toBe('Offer')
    expect(offers['price']).toBe('$50')
  })

  it('passes through offers object when provided (Offer sub-entity)', () => {
    const graph = composeFromConfig({
      config: {
        entities: [
          {
            '@type': 'Event',
            properties: {
              offers: {
                '@type': 'Offer',
                price: '99',
                priceCurrency: 'USD',
                availability: 'https://schema.org/InStock',
              },
            },
          },
        ],
      },
      fields: { title: 'Object Offer', startDate: '2026-05-02', location: 'Venue' },
      siteConfig,
      path: '/e/obj-offer',
    })

    const event = findEntity(graph, 'Event')
    const offers = event?.['offers'] as Record<string, unknown>
    expect(offers['@type']).toBe('Offer')
    expect(offers['price']).toBe('99')
    expect(offers['priceCurrency']).toBe('USD')
    expect(offers['availability']).toBe('https://schema.org/InStock')
  })

  it('omits required fields from the entity when missing', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Event', properties: {} }],
      },
      // Intentionally missing startDate and location (Google-required fields).
      fields: { title: 'Incomplete Event' },
      siteConfig,
      path: '/e/incomplete',
    })

    const event = findEntity(graph, 'Event')
    expect(event).toBeDefined()
    expect(event?.['name']).toBe('Incomplete Event')
    // Missing required fields are dropped by compact(), letting
    // validateRichResult flag them downstream.
    expect(event?.['startDate']).toBeUndefined()
    expect(event?.['location']).toBeUndefined()
  })
})

describe('buildRecipe', () => {
  it('produces a Recipe entity with required Google rich result fields', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Recipe', properties: {} }],
      },
      fields: {
        title: 'Chocolate Chip Cookies',
        image: 'https://example.com/cookies.jpg',
        recipeIngredient: ['2 cups flour', '1 cup sugar', '1 cup chocolate chips'],
        recipeInstructions: [
          'Mix dry ingredients',
          'Add wet ingredients',
          'Bake at 375F for 12 min',
        ],
      },
      siteConfig,
      path: '/recipes/cookies',
    })

    const recipe = findEntity(graph, 'Recipe')
    expect(recipe).toBeDefined()
    expect(recipe?.['name']).toBe('Chocolate Chip Cookies')
    expect(recipe?.['image']).toBe('https://example.com/cookies.jpg')
    expect(recipe?.['recipeIngredient'] as string[]).toHaveLength(3)
    expect(recipe?.['recipeInstructions'] as Array<Record<string, unknown>>).toHaveLength(3)
  })

  it('wraps each instruction as a HowToStep entity', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Recipe', properties: {} }],
      },
      fields: {
        title: 'Test',
        image: 'img.jpg',
        recipeIngredient: ['x'],
        recipeInstructions: ['Step one', 'Step two'],
      },
      siteConfig,
      path: '/r/test',
    })

    const recipe = findEntity(graph, 'Recipe')
    const steps = recipe?.['recipeInstructions'] as Array<Record<string, unknown>>
    expect(steps[0]?.['@type']).toBe('HowToStep')
    expect(steps[0]?.['text']).toBe('Step one')
    expect(steps[1]?.['text']).toBe('Step two')
  })

  it('parses comma-separated string ingredients for legacy CMS compatibility', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Recipe', properties: {} }],
      },
      fields: {
        title: 'Salad',
        image: 'salad.jpg',
        recipeIngredient: 'lettuce, tomato, cucumber',
        recipeInstructions: ['Toss together'],
      },
      siteConfig,
      path: '/r/salad',
    })

    const recipe = findEntity(graph, 'Recipe')
    expect(recipe?.['recipeIngredient']).toEqual(['lettuce', 'tomato', 'cucumber'])
  })

  it('cross-links author to site Person via @id', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Recipe', properties: {} }],
      },
      fields: {
        title: 'Soup',
        image: 'soup.jpg',
        recipeIngredient: ['water'],
        recipeInstructions: ['Boil'],
      },
      siteConfig,
      siteLevel,
      path: '/r/soup',
    })

    const recipe = findEntity(graph, 'Recipe')
    expect((recipe?.['author'] as Record<string, unknown> | undefined)?.['@id']).toBe(
      'https://acme.example.com/#person',
    )
  })

  it('uses recipe @id convention for cross-referencing', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Recipe', properties: {} }],
      },
      fields: {
        title: 'Bread',
        image: 'bread.jpg',
        recipeIngredient: ['flour'],
        recipeInstructions: ['Bake'],
      },
      siteConfig,
      path: '/recipes/bread',
    })

    const recipe = findEntity(graph, 'Recipe')
    expect(recipe?.['@id']).toBe('https://acme.example.com/recipes/bread/#recipe')
  })

  it('includes nutrition as a NutritionInformation sub-entity when provided', () => {
    const graph = composeFromConfig({
      config: {
        entities: [
          {
            '@type': 'Recipe',
            properties: {
              nutrition: {
                calories: '250 calories',
                fatContent: '12 g',
              },
            },
          },
        ],
      },
      fields: {
        title: 'Pasta',
        image: 'pasta.jpg',
        recipeIngredient: ['pasta'],
        recipeInstructions: ['Boil'],
      },
      siteConfig,
      path: '/r/pasta',
    })

    const recipe = findEntity(graph, 'Recipe')
    const nutrition = recipe?.['nutrition'] as Record<string, unknown>
    expect(nutrition['@type']).toBe('NutritionInformation')
    expect(nutrition['calories']).toBe('250 calories')
    expect(nutrition['fatContent']).toBe('12 g')
  })

  it('omits empty optional fields from output', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Recipe', properties: {} }],
      },
      fields: {
        title: 'Minimal',
        image: 'min.jpg',
        recipeIngredient: ['x'],
        recipeInstructions: ['y'],
      },
      siteConfig,
      path: '/r/min',
    })

    const recipe = findEntity(graph, 'Recipe')
    expect(recipe?.['prepTime']).toBeUndefined()
    expect(recipe?.['cookTime']).toBeUndefined()
    expect(recipe?.['recipeYield']).toBeUndefined()
    expect(recipe?.['nutrition']).toBeUndefined()
  })

  it('reads alternate CMS field names (prep-time, cook-time, total-time)', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Recipe', properties: {} }],
      },
      fields: {
        title: 'Quick Meal',
        image: 'meal.jpg',
        recipeIngredient: ['food'],
        recipeInstructions: ['eat'],
        'prep-time': 'PT5M',
        'cook-time': 'PT10M',
        'total-time': 'PT15M',
      },
      siteConfig,
      path: '/r/quick',
    })

    const recipe = findEntity(graph, 'Recipe')
    expect(recipe?.['prepTime']).toBe('PT5M')
    expect(recipe?.['cookTime']).toBe('PT10M')
    expect(recipe?.['totalTime']).toBe('PT15M')
  })

  it('omits required fields from the entity when missing', () => {
    const graph = composeFromConfig({
      config: {
        entities: [{ '@type': 'Recipe', properties: {} }],
      },
      // Intentionally missing image, recipeIngredient, recipeInstructions.
      fields: { title: 'Bare Recipe' },
      siteConfig,
      path: '/r/bare',
    })

    const recipe = findEntity(graph, 'Recipe')
    expect(recipe).toBeDefined()
    expect(recipe?.['name']).toBe('Bare Recipe')
    // Missing required fields are dropped by compact(), letting
    // validateRichResult flag them downstream.
    expect(recipe?.['image']).toBeUndefined()
    expect(recipe?.['recipeIngredient']).toBeUndefined()
    expect(recipe?.['recipeInstructions']).toBeUndefined()
  })
})

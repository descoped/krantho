import {
  AUTHOR_RULE,
  authorOf,
  ORGANIZATION_RULE,
  propertyValue,
  siteOrganization,
} from '../context.js'
import type { TypeDefinition } from '../definition.js'
import { asStringList, asSubEntity, compact } from '../values.js'

function steps(value: unknown): Array<{ '@type': string; text: string }> {
  return asStringList(value).map((text) => ({ '@type': 'HowToStep', text }))
}

/**
 * A recipe. Ingredients and instructions accept a list, a comma-separated
 * string or one string; instructions become HowToSteps.
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/recipe
 */
export const recipeType: TypeDefinition = {
  type: 'Recipe',
  scope: 'document',
  idFragment: 'recipe',
  fields: {
    name: [],
    description: [],
    image: [],
    author: [],
    prepTime: ['prep-time'],
    cookTime: ['cook-time'],
    totalTime: ['total-time'],
    recipeYield: ['yield'],
    recipeCategory: ['category'],
    recipeCuisine: ['cuisine'],
    recipeIngredient: ['ingredients'],
    recipeInstructions: ['instructions'],
    nutrition: [],
  },
  references: { author: AUTHOR_RULE },
  build: (context) =>
    compact({
      '@type': context.type,
      '@id': context.id,
      author: authorOf(context),
      recipeIngredient: asStringList(propertyValue(context, 'recipeIngredient')),
      recipeInstructions: steps(propertyValue(context, 'recipeInstructions')),
      nutrition: asSubEntity(propertyValue(context, 'nutrition'), 'NutritionInformation', 'name'),
    }),
}

/**
 * A how-to guide: its steps, supplies and tools as HowTo sub-entities.
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/how-to
 */
export const howToType: TypeDefinition = {
  type: 'HowTo',
  scope: 'document',
  idFragment: 'howto',
  fields: {
    name: [],
    description: [],
    image: [],
    author: [],
    totalTime: ['total-time'],
    estimatedCost: ['estimated-cost'],
    step: ['steps'],
    supply: [],
    tool: [],
  },
  references: { author: AUTHOR_RULE },
  build: (context) =>
    compact({
      '@type': context.type,
      '@id': context.id,
      author: authorOf(context),
      step: steps(propertyValue(context, 'step')),
      supply: asStringList(propertyValue(context, 'supply')).map((name) => ({
        '@type': 'HowToSupply',
        name,
      })),
      tool: asStringList(propertyValue(context, 'tool')).map((name) => ({
        '@type': 'HowToTool',
        name,
      })),
    }),
}

/**
 * A video, published by the site's organization.
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/video
 */
export const videoObjectType: TypeDefinition = {
  type: 'VideoObject',
  scope: 'document',
  idFragment: 'video',
  fields: {
    name: [],
    description: [],
    author: [],
    contentUrl: ['content-url'],
    thumbnailUrl: ['thumbnail-url', 'thumbnail'],
    uploadDate: ['upload-date', 'datePublished', 'date'],
    duration: [],
    embedUrl: ['embed-url'],
  },
  references: { author: AUTHOR_RULE, publisher: ORGANIZATION_RULE },
  build: (context) => ({
    '@type': context.type,
    '@id': context.id,
    publisher: siteOrganization(context),
    author: authorOf(context),
  }),
}

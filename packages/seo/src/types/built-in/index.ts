import type { TypeDefinition } from '../definition.js'
import { registerType } from '../registry.js'
import {
  articleType,
  breadcrumbListType,
  faqPageType,
  productType,
  serviceType,
} from './content.js'
import { courseType, eventType, jobPostingType } from './events.js'
import { howToType, recipeType, videoObjectType } from './media.js'
import { localBusinessType, organizationType, personType, webSiteType } from './site.js'

/** The types krantho builds with a dedicated definition */
export const BUILT_IN_TYPES: readonly TypeDefinition[] = [
  localBusinessType,
  organizationType,
  webSiteType,
  personType,
  articleType,
  breadcrumbListType,
  faqPageType,
  serviceType,
  productType,
  eventType,
  recipeType,
  howToType,
  courseType,
  jobPostingType,
  videoObjectType,
]

for (const definition of BUILT_IN_TYPES) registerType(definition)
